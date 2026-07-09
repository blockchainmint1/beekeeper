// UTXO (TXC / ISK) wallet primitives.
// Lazy-loads bitcoinjs-lib so SSR never touches it.
import { HDKey } from "@scure/bip32";
import type { UtxoChain } from "@/lib/chains";
import { mnemonicToSeed } from "./seed";
import { toLegacyBch, toCashAddr, isValidBchAddress } from "./cashaddr";

export type AddressType = "segwit" | "legacy";

let walletLibsPromise: Promise<{
  bitcoin: typeof import("bitcoinjs-lib");
  ecc: typeof import("@bitcoinerlab/secp256k1");
}> | null = null;

async function getLibs() {
  if (!walletLibsPromise) {
    walletLibsPromise = (async () => {
      await import("./buffer-polyfill");
      const [bitcoin, ecc] = await Promise.all([
        import("bitcoinjs-lib"),
        import("@bitcoinerlab/secp256k1"),
      ]);
      const eccLib = (ecc as { default?: unknown }).default ?? ecc;
      bitcoin.initEccLib(eccLib as never);
      return { bitcoin, ecc: eccLib as typeof import("@bitcoinerlab/secp256k1") };
    })();
  }
  return walletLibsPromise;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export interface UtxoAccount {
  chain: UtxoChain;
  index: number;
  type: AddressType;
  address: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/** Compute WIF (compressed) for the derived private key. */
export async function utxoWif(account: UtxoAccount): Promise<string> {
  await getLibs(); // ensures buffer polyfill is loaded for `wif`
  const wifLib = (await import("wif")) as unknown as {
    encode: (version: number, priv: Uint8Array, compressed: boolean) => string;
    default?: { encode: (version: number, priv: Uint8Array, compressed: boolean) => string };
  };
  const encode = wifLib.encode ?? wifLib.default?.encode;
  if (!encode) throw new Error("wif encoder unavailable");
  return encode(account.chain.network.wif, account.privateKey, true);
}

function addressFor(
  bitcoin: typeof import("bitcoinjs-lib"),
  pubkey: Uint8Array,
  type: AddressType,
  chain: UtxoChain,
): string {
  const payment =
    type === "segwit"
      ? bitcoin.payments.p2wpkh({ pubkey, network: chain.network })
      : bitcoin.payments.p2pkh({ pubkey, network: chain.network });
  const { address } = payment;
  if (!address) throw new Error("Failed to derive address");
  return address;
}

function scriptFor(
  bitcoin: typeof import("bitcoinjs-lib"),
  pubkey: Uint8Array,
  type: AddressType,
  chain: UtxoChain,
): Uint8Array {
  const payment =
    type === "segwit"
      ? bitcoin.payments.p2wpkh({ pubkey, network: chain.network })
      : bitcoin.payments.p2pkh({ pubkey, network: chain.network });
  if (!payment.output) throw new Error("Failed to derive output script");
  return payment.output;
}

export async function deriveUtxoAccount(
  mnemonic: string,
  chain: UtxoChain,
  index = 0,
  type: AddressType = "segwit",
): Promise<UtxoAccount> {
  const { bitcoin } = await getLibs();
  // BCH has no native segwit — force legacy.
  const effectiveType: AddressType = chain.cashAddrPrefix ? "legacy" : type;
  const seed = mnemonicToSeed(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const base = effectiveType === "segwit" ? chain.bip84Base : chain.bip44Base;
  const child = root.derive(`${base}/${index}`);
  if (!child.privateKey || !child.publicKey) {
    throw new Error("No private key derived");
  }
  let address = addressFor(bitcoin, child.publicKey, effectiveType, chain);
  // Convert legacy → CashAddr for display on BCH-family chains.
  if (chain.cashAddrPrefix) {
    try { address = toCashAddr(address); } catch { /* fall back to legacy */ }
  }
  return {
    chain,
    index,
    type: effectiveType,
    address,
    publicKey: child.publicKey,
    privateKey: child.privateKey,
  };
}

/* ─────────── HD scan (gap-limit, both receive + change chains) ─────────── */

export interface HdScanAddress {
  address: string;
  index: number;
  change: boolean;
  type: AddressType;
  sats: number;
  txCount: number;
}

export interface HdScanResult {
  totalSats: number;
  active: HdScanAddress[]; // any address with tx_count > 0 OR balance > 0
  scanned: number;
  highestUsedIndex: number; // -1 if none
}

/** BIP44/84-style HD scan with gap-limit. Walks receive (chain=0) and change (chain=1)
 *  branches until `gapLimit` consecutive unused addresses are seen.
 *
 *  Gap is bumped to 50 by default (vs the BIP-44 standard of 20) so merchants
 *  using rotating receive addresses can burst without us missing payments.
 *  `minIndex` forces the walker to scan at least that many addresses on each
 *  branch even when empty — callers pass the persisted watermark + gap. */
export async function scanUtxoHd(
  mnemonic: string,
  chain: UtxoChain,
  opts: { type?: AddressType; gapLimit?: number; maxIndex?: number; minIndex?: number } = {},
): Promise<HdScanResult> {
  const { bitcoin } = await getLibs();
  const gapLimit = opts.gapLimit ?? 50;
  const maxIndex = opts.maxIndex ?? 500;
  const minIndex = opts.minIndex ?? 0;
  const requestedType = opts.type ?? chain.defaultAddressType;
  const effectiveType: AddressType = chain.cashAddrPrefix ? "legacy" : requestedType;
  const baseWithChain =
    effectiveType === "segwit" ? chain.bip84Base : chain.bip44Base;
  // baseWithChain ends in "/0" (receive). Strip to get the account-level base.
  const accountBase = baseWithChain.replace(/\/0$/, "");
  const seed = mnemonicToSeed(mnemonic);
  const root = HDKey.fromMasterSeed(seed);

  const active: HdScanAddress[] = [];
  let totalSats = 0;
  let scanned = 0;
  let highestUsedIndex = -1;

  for (const change of [false, true]) {
    const branchBase = `${accountBase}/${change ? 1 : 0}`;
    let consecutiveEmpty = 0;
    for (let i = 0; i < maxIndex; i++) {
      if (i >= minIndex && consecutiveEmpty >= gapLimit) break;
      const node = root.derive(`${branchBase}/${i}`);
      if (!node.publicKey) {
        consecutiveEmpty++;
        continue;
      }
      let address = addressFor(bitcoin, node.publicKey, effectiveType, chain);
      if (chain.cashAddrPrefix) {
        try { address = toCashAddr(address); } catch { /* keep legacy */ }
      }
      scanned++;
      let info: AddressInfo;
      try {
        info = await esplora.addressInfo(chain, address);
      } catch {
        consecutiveEmpty++;
        continue;
      }
      const sats = addressBalanceSats(info).total;
      const txCount = info.chain_stats.tx_count + info.mempool_stats.tx_count;
      if (txCount > 0 || sats > 0) {
        active.push({ address, index: i, change, type: effectiveType, sats, txCount });
        totalSats += sats;
        consecutiveEmpty = 0;
        if (!change && i > highestUsedIndex) highestUsedIndex = i;
      } else {
        consecutiveEmpty++;
      }
    }
  }

  return { totalSats, active, scanned, highestUsedIndex };
}


export async function validateUtxoAddress(addr: string, chain: UtxoChain): Promise<boolean> {
  const { bitcoin } = await getLibs();
  if (chain.cashAddrPrefix) {
    // Accept CashAddr or legacy on BCH-family chains.
    if (isValidBchAddress(addr)) return true;
  }
  try {
    bitcoin.address.toOutputScript(addr.trim(), chain.network);
    return true;
  } catch {
    return false;
  }
}

/* ─────────── Esplora client ─────────── */

export interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
}

export interface AddressStats {
  funded_txo_sum: number;
  spent_txo_sum: number;
  tx_count: number;
}
export interface AddressInfo {
  address: string;
  chain_stats: AddressStats;
  mempool_stats: AddressStats;
}

async function esploraGet<T>(chain: UtxoChain, path: string): Promise<T> {
  const res = await fetch(`${chain.apiBase}${path}`);
  if (!res.ok) throw new Error(`${chain.ticker} esplora ${path} ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export const esplora = {
  addressInfo: async (chain: UtxoChain, a: string): Promise<AddressInfo> => {
    if (chain.id === "isk") {
      const { iskAddressInfo } = await import("./isk.functions");
      return iskAddressInfo({ data: { address: a } });
    }
    return esploraGet<AddressInfo>(chain, `/address/${a}`);
  },
  addressUtxos: async (chain: UtxoChain, a: string): Promise<EsploraUtxo[]> => {
    if (chain.id === "isk") {
      const { iskAddressUtxos } = await import("./isk.functions");
      return iskAddressUtxos({ data: { address: a } });
    }
    return esploraGet<EsploraUtxo[]>(chain, `/address/${a}/utxo`);
  },
  addressTxs: async (chain: UtxoChain, a: string): Promise<unknown[]> => {
    if (chain.id === "isk") {
      const { iskAddressTxs } = await import("./isk.functions");
      return iskAddressTxs({ data: { address: a } });
    }
    return esploraGet<unknown[]>(chain, `/address/${a}/txs`);
  },
  txHex: async (chain: UtxoChain, txid: string): Promise<string> => {
    if (chain.id === "isk") {
      const { iskTxHex } = await import("./isk.functions");
      return iskTxHex({ data: { txid } });
    }
    return esploraGet<string>(chain, `/tx/${txid}/hex`);
  },
  async broadcast(chain: UtxoChain, rawHex: string): Promise<string> {
    if (chain.id === "isk") {
      const { iskBroadcast } = await import("./isk.functions");
      return iskBroadcast({ data: { rawHex } });
    }
    const res = await fetch(`${chain.apiBase}/tx`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: rawHex,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || `Broadcast failed (${res.status})`);
    return text.trim();
  },
};

export function addressBalanceSats(info: AddressInfo) {
  const confirmed = info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum;
  const unconfirmed = info.mempool_stats.funded_txo_sum - info.mempool_stats.spent_txo_sum;
  return { confirmed, unconfirmed, total: confirmed + unconfirmed };
}

/* ─────────── send ─────────── */

function inputVBytes(type: AddressType): number {
  return type === "segwit" ? 68 : 148;
}

export async function buildAndSign(args: {
  account: UtxoAccount;
  utxos: EsploraUtxo[];
  toAddress: string;
  amountSats: number;
  feeRate: number;
}): Promise<{ hex: string; feeSats: number }> {
  const { bitcoin, ecc } = await getLibs();
  const { account, utxos, toAddress, amountSats, feeRate } = args;
  if (utxos.length === 0) throw new Error("No UTXOs available");

  // BCH and other SIGHASH_FORKID chains need a custom BIP143 signer
  // that bitcoinjs-lib does not provide. Surface a clear message instead
  // of broadcasting an invalid (non-fork-id) transaction that the network
  // will silently reject.
  if (account.chain.forkId !== undefined) {
    throw new Error(
      `${account.chain.ticker} send is not yet supported in this build. ` +
      `Receive, balance, history, and message signing all work — sending is ` +
      `coming in a follow-up that adds SIGHASH_FORKID signing.`,
    );
  }

  const isSegwit = account.type === "segwit";
  // BCH-family addresses arrive in CashAddr form — normalize before bitcoinjs-lib.
  const normalizedTo = account.chain.cashAddrPrefix ? toLegacyBch(toAddress) : toAddress;
  const prevHexes = isSegwit
    ? []
    : await Promise.all(utxos.map((u) => esplora.txHex(account.chain, u.txid)));
  const witnessScript = isSegwit ? scriptFor(bitcoin, account.publicKey, "segwit", account.chain) : null;

  const psbt = new bitcoin.Psbt({ network: account.chain.network });
  utxos.forEach((u, i) => {
    if (isSegwit) {
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        witnessUtxo: { script: witnessScript!, value: BigInt(u.value) },
      });
    } else {
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        nonWitnessUtxo: hexToBytes(prevHexes[i]),
      });
    }
  });

  const estVBytes = 11 + inputVBytes(account.type) * utxos.length + 34 * 2;
  const fee = Math.max(estVBytes * feeRate, 250);

  const totalIn = utxos.reduce((s, u) => s + u.value, 0);
  const change = totalIn - amountSats - fee;
  if (change < 0) throw new Error("Insufficient funds for amount + fee");

  psbt.addOutput({ address: normalizedTo, value: BigInt(amountSats) });
  if (change >= account.chain.dustSats) {
    const changeAddr = account.chain.cashAddrPrefix ? toLegacyBch(account.address) : account.address;
    psbt.addOutput({ address: changeAddr, value: BigInt(change) });
  }

  const ecSigner = {
    publicKey: account.publicKey,
    sign: (hash: Uint8Array) => {
      const sig = ecc.sign(hash, account.privateKey);
      return new Uint8Array(sig);
    },
  };
  for (let i = 0; i < utxos.length; i++) {
    psbt.signInput(i, ecSigner as never);
  }
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return { hex: tx.toHex(), feeSats: fee };
}

/* ─────────── units ─────────── */

export function satsToCoin(sats: number | bigint, decimals = 8): string {
  const SATS = 10n ** BigInt(decimals);
  const n = typeof sats === "bigint" ? sats : BigInt(Math.trunc(sats));
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / SATS;
  const frac = (abs % SATS).toString().padStart(decimals, "0").replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : whole.toString();
  return neg ? `-${body}` : body;
}

export function coinToSats(amount: string, decimals = 8): number {
  const trimmed = amount.trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(trimmed)) {
    throw new Error("Invalid amount");
  }
  const [whole, frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const total = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount too large");
  return Number(total);
}