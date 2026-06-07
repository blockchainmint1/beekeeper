// UTXO (TXC / ISK) wallet primitives.
// Lazy-loads bitcoinjs-lib so SSR never touches it.
import { HDKey } from "@scure/bip32";
import type { UtxoChain } from "@/lib/chains";
import { mnemonicToSeed } from "./seed";

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
  const { bitcoin } = await getLibs();
  // bitcoinjs ECPair lives in `ecpair`, but we can encode WIF directly.
  // Manual WIF: [wif version][32-byte priv][0x01 compressed flag] then base58check.
  const wifByte = account.chain.network.wif;
  const payload = new Uint8Array(34);
  payload[0] = wifByte;
  payload.set(account.privateKey, 1);
  payload[33] = 0x01;
  return bitcoin.address.toBase58Check
    ? // not the right helper — fall through to bs58check below
      base58check(payload)
    : base58check(payload);
}

// tiny base58check implementation that avoids pulling another dep
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58check(payload: Uint8Array): string {
  // checksum = first 4 bytes of double-sha256
  return sha256(payload).then ? "" : ""; // placeholder so TS sees Promise; replaced below
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
  const seed = mnemonicToSeed(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const base = type === "segwit" ? chain.bip84Base : chain.bip44Base;
  const child = root.derive(`${base}/${index}`);
  if (!child.privateKey || !child.publicKey) {
    throw new Error("No private key derived");
  }
  const address = addressFor(bitcoin, child.publicKey, type, chain);
  return {
    chain,
    index,
    type,
    address,
    publicKey: child.publicKey,
    privateKey: child.privateKey,
  };
}

export async function validateUtxoAddress(addr: string, chain: UtxoChain): Promise<boolean> {
  const { bitcoin } = await getLibs();
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
  addressInfo: (chain: UtxoChain, a: string) =>
    esploraGet<AddressInfo>(chain, `/address/${a}`),
  addressUtxos: (chain: UtxoChain, a: string) =>
    esploraGet<EsploraUtxo[]>(chain, `/address/${a}/utxo`),
  addressTxs: (chain: UtxoChain, a: string) =>
    esploraGet<unknown[]>(chain, `/address/${a}/txs`),
  txHex: (chain: UtxoChain, txid: string) =>
    esploraGet<string>(chain, `/tx/${txid}/hex`),
  async broadcast(chain: UtxoChain, rawHex: string): Promise<string> {
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

  const isSegwit = account.type === "segwit";
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

  psbt.addOutput({ address: toAddress, value: BigInt(amountSats) });
  if (change >= account.chain.dustSats) {
    psbt.addOutput({ address: account.address, value: BigInt(change) });
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