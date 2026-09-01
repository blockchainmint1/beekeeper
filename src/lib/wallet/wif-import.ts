// Single-key (WIF) import + sweep.
//
// A WIF is base58check(version || 32-byte scalar || 0x01?) where the version
// byte identifies the chain. Several chains share a version byte (BTC and BCH
// both use 0x80), so we return every candidate and let the user choose.
//
// Imported keys are NEVER persisted: they are decoded in memory, swept into the
// user's own HD wallet, and dropped. That keeps our threat model unchanged —
// the encrypted seed vault stays the only secret at rest.
import type { UtxoChain } from "@/lib/chains";
import { CHAIN_LIST } from "@/lib/chains";
import { esplora, buildAndSign, type AddressType, type UtxoAccount } from "./utxo";
import { toCashAddr } from "./cashaddr";

export interface WifCandidate {
  chain: UtxoChain;
  type: AddressType;
  address: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  compressed: boolean;
}

const UTXO_CHAINS = (): UtxoChain[] =>
  CHAIN_LIST.filter((c): c is UtxoChain => c.kind === "utxo");

/**
 * Decode a WIF and return one candidate per (chain, address type) that the key
 * could belong to. Throws with a human message when the string isn't a WIF.
 */
export async function decodeWifCandidates(input: string): Promise<WifCandidate[]> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Paste or scan a private key first.");
  await import("./buffer-polyfill");
  const [{ default: bs58check }, eccMod, bitcoin] = await Promise.all([
    import("bs58check") as Promise<{ default: { decode: (s: string) => Uint8Array } }>,
    import("@bitcoinerlab/secp256k1"),
    import("bitcoinjs-lib"),
  ]);
  const ecc = ((eccMod as { default?: unknown }).default ??
    eccMod) as typeof import("@bitcoinerlab/secp256k1");

  let raw: Uint8Array;
  try {
    raw = bs58check.decode(trimmed);
  } catch {
    throw new Error("That isn't a valid private key (bad base58 checksum).");
  }
  if (raw.length !== 33 && raw.length !== 34) {
    throw new Error("That isn't a valid private key (unexpected length).");
  }
  const version = raw[0];
  const compressed = raw.length === 34;
  if (compressed && raw[33] !== 0x01) {
    throw new Error("That isn't a valid private key (bad compression flag).");
  }
  const priv = new Uint8Array(raw.slice(1, 33));
  const pub = ecc.pointFromScalar(priv, compressed);
  if (!pub) throw new Error("That private key is out of range.");
  const publicKey = new Uint8Array(pub);

  const matches = UTXO_CHAINS().filter((c) => c.network.wif === version);
  if (matches.length === 0) {
    throw new Error("This key's network prefix isn't one of the chains this wallet supports.");
  }

  const out: WifCandidate[] = [];
  for (const chain of matches) {
    // Segwit requires a compressed pubkey; BCH-family chains have no segwit.
    const types: AddressType[] =
      compressed && !chain.cashAddrPrefix && chain.id !== "doge" && chain.id !== "dash"
        ? ["segwit", "legacy"]
        : ["legacy"];
    for (const type of types) {
      try {
        const payment =
          type === "segwit"
            ? bitcoin.payments.p2wpkh({ pubkey: publicKey, network: chain.network })
            : bitcoin.payments.p2pkh({ pubkey: publicKey, network: chain.network });
        if (!payment.address) continue;
        let address = payment.address;
        if (chain.cashAddrPrefix) {
          try {
            address = toCashAddr(address);
          } catch {
            /* keep legacy form */
          }
        }
        out.push({ chain, type, address, privateKey: priv, publicKey, compressed });
      } catch {
        /* unsupported combo — skip */
      }
    }
  }
  if (out.length === 0) throw new Error("Couldn't derive any address from this key.");
  return out;
}

export interface WifBalance {
  sats: number;
  utxoCount: number;
}

/** Confirmed + unconfirmed balance and spendable UTXO count for a candidate. */
export async function wifBalance(c: WifCandidate): Promise<WifBalance> {
  const utxos = await esplora.addressUtxos(c.chain, c.address);
  const list = Array.isArray(utxos) ? utxos : [];
  return { sats: list.reduce((s, u) => s + (u.value || 0), 0), utxoCount: list.length };
}

function inputVBytes(type: AddressType): number {
  return type === "segwit" ? 68 : 148;
}

/**
 * Sweep every UTXO on the imported key into `toAddress` (the user's own HD
 * address). Fee is estimated for a single-output transaction, so no change
 * output is created and the key is left empty.
 */
export async function sweepWif(args: {
  candidate: WifCandidate;
  toAddress: string;
  feeRate: number;
}): Promise<{ txid: string; sentSats: number; feeSats: number }> {
  const { candidate, toAddress, feeRate } = args;
  const utxos = (await esplora.addressUtxos(candidate.chain, candidate.address)) || [];
  if (utxos.length === 0) throw new Error("Nothing to sweep — this key has no unspent outputs.");
  const totalIn = utxos.reduce((s, u) => s + u.value, 0);

  // Single output: 11 header + inputs + one 34-byte output. buildAndSign
  // budgets for two outputs, so amount = total − (that fee) leaves change at 0
  // and the change output is dropped (below dust).
  const estVBytes = 11 + inputVBytes(candidate.type) * utxos.length + 34 * 2;
  const fee = Math.max(Math.ceil(estVBytes * feeRate), 250);
  const amount = totalIn - fee;
  if (amount <= candidate.chain.dustSats) {
    throw new Error("Balance is too small to cover the network fee.");
  }

  const account: UtxoAccount = {
    chain: candidate.chain,
    index: 0,
    type: candidate.type,
    address: candidate.address,
    publicKey: candidate.publicKey,
    privateKey: candidate.privateKey,
  };
  const { hex, feeSats } = await buildAndSign({
    account,
    utxos,
    toAddress,
    amountSats: amount,
    feeRate,
  });
  const txid = await esplora.broadcast(candidate.chain, hex);
  return { txid, sentSats: amount, feeSats };
}
