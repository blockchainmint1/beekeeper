// Multi-output sends. UTXO chains use a single transaction with many outputs.
// EVM chains run sequential transactions (one nonce-incrementing send per recipient).
import type { EvmChain, UtxoChain, Erc20Token } from "@/lib/chains";
import { esplora, type UtxoAccount } from "./utxo";
import { evmBalance, sendEvm, type EvmAccount } from "./evm";
import { erc20Transfer } from "./erc20";
import type { Address } from "viem";

export interface MultiOutputUtxo {
  address: string;
  amountSats: number;
}

/**
 * Build & sign a single UTXO transaction paying many outputs.
 * Uses the same PSBT pipeline as `buildAndSign` but with N outputs.
 */
export async function buildAndSignMultiUtxo(args: {
  account: UtxoAccount;
  outputs: MultiOutputUtxo[];
  feeRate: number;
}): Promise<{ hex: string; feeSats: number; totalSpentSats: number }> {
  await import("./buffer-polyfill");
  const [{ default: bitcoin }, eccMod, wifMod] = await Promise.all([
    import("bitcoinjs-lib").then((m) => ({ default: m })),
    import("@bitcoinerlab/secp256k1"),
    import("wif"),
  ]);
  void wifMod;
  const ecc = (eccMod as { default?: unknown }).default ?? eccMod;
  bitcoin.initEccLib(ecc as never);

  const { account, outputs, feeRate } = args;
  if (outputs.length === 0) throw new Error("No outputs");
  const utxos = (await esplora.addressUtxos(account.chain, account.address)).filter((u) => u.status.confirmed);
  if (utxos.length === 0) throw new Error("No confirmed UTXOs");

  const isSegwit = account.type === "segwit";
  const payment = isSegwit
    ? bitcoin.payments.p2wpkh({ pubkey: account.publicKey, network: account.chain.network })
    : bitcoin.payments.p2pkh({ pubkey: account.publicKey, network: account.chain.network });
  const script = payment.output!;

  const psbt = new bitcoin.Psbt({ network: account.chain.network });

  const prevHexes = isSegwit
    ? []
    : await Promise.all(utxos.map((u) => esplora.txHex(account.chain, u.txid)));

  utxos.forEach((u, i) => {
    if (isSegwit) {
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        witnessUtxo: { script, value: BigInt(u.value) },
      });
    } else {
      const hex = prevHexes[i];
      const bytes = new Uint8Array(hex.length / 2);
      for (let j = 0; j < bytes.length; j++) bytes[j] = parseInt(hex.slice(j * 2, j * 2 + 2), 16);
      psbt.addInput({ hash: u.txid, index: u.vout, nonWitnessUtxo: bytes });
    }
  });

  const inVbytes = isSegwit ? 68 : 148;
  const estVBytes = 11 + inVbytes * utxos.length + 34 * (outputs.length + 1);
  const fee = Math.max(estVBytes * feeRate, 250);

  const totalOut = outputs.reduce((s, o) => s + o.amountSats, 0);
  const totalIn = utxos.reduce((s, u) => s + u.value, 0);
  const change = totalIn - totalOut - fee;
  if (change < 0) throw new Error(`Insufficient funds. Need ${totalOut + fee}, have ${totalIn}`);

  for (const o of outputs) psbt.addOutput({ address: o.address, value: BigInt(o.amountSats) });
  if (change >= account.chain.dustSats) {
    psbt.addOutput({ address: account.address, value: BigInt(change) });
  }

  const signer = {
    publicKey: account.publicKey,
    sign: (hash: Uint8Array) => new Uint8Array((ecc as { sign: (h: Uint8Array, p: Uint8Array) => Uint8Array }).sign(hash, account.privateKey)),
  };
  for (let i = 0; i < utxos.length; i++) psbt.signInput(i, signer as never);
  psbt.finalizeAllInputs();

  return {
    hex: psbt.extractTransaction().toHex(),
    feeSats: fee,
    totalSpentSats: totalOut + fee,
  };
}

export interface EvmMultiSendRow {
  to: Address;
  amount: string; // human-readable units
}

export interface MultiSendProgress {
  index: number;
  total: number;
  to: Address;
  status: "pending" | "sent" | "failed";
  hash?: `0x${string}`;
  error?: string;
}

/**
 * Send a list of EVM transfers sequentially (native or ERC-20).
 * Calls `onProgress` after each one so the UI can render per-row state.
 */
export async function sendEvmMulti(args: {
  account: EvmAccount;
  chain: EvmChain;
  token: Erc20Token | null;
  rows: EvmMultiSendRow[];
  onProgress?: (p: MultiSendProgress) => void;
}): Promise<MultiSendProgress[]> {
  const { account, chain, token, rows, onProgress } = args;
  const results: MultiSendProgress[] = [];

  // Preflight balance check (native only — ERC-20 balances checked by transfer).
  if (!token) {
    const bal = await evmBalance(chain, account.address);
    const total = rows.reduce((s, r) => s + BigInt(Math.floor(parseFloat(r.amount) * 1e18)), 0n);
    if (bal < total) throw new Error("Insufficient native balance for total send");
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    onProgress?.({ index: i, total: rows.length, to: row.to, status: "pending" });
    try {
      let hash: `0x${string}`;
      if (token) {
        hash = await erc20Transfer({ account, token, to: row.to, amount: row.amount });
      } else {
        const wei = BigInt(Math.floor(parseFloat(row.amount) * 1e18));
        hash = await sendEvm({ account, to: row.to, amountWei: wei });
      }
      const r: MultiSendProgress = { index: i, total: rows.length, to: row.to, status: "sent", hash };
      results.push(r);
      onProgress?.(r);
    } catch (e) {
      const r: MultiSendProgress = {
        index: i,
        total: rows.length,
        to: row.to,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      };
      results.push(r);
      onProgress?.(r);
    }
  }
  return results;
}