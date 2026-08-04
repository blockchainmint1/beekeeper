// NowNodes Blockbook adapter (server-only).
//
// One API key covers Blockbook indexers for every major UTXO chain, so this is
// our primary provider whenever NOWNODES_API_KEY is present. Blockbook v2 REST:
//   GET  /api/v2/address/{addr}?details=basic|txs
//   GET  /api/v2/utxo/{addr}
//   GET  /api/v2/tx/{txid}
//   GET  /api/v2/sendtx/{rawhex}
import { env } from "@/lib/server-env";

/** chain id → NowNodes Blockbook host. */
export const NOWNODES_BOOKS: Record<string, string> = {
  btc: "btcbook.nownodes.io",
  ltc: "ltcbook.nownodes.io",
  bch: "bchbook.nownodes.io",
  doge: "dogebook.nownodes.io",
  dash: "dashbook.nownodes.io",
};

export function nownodesEnabled(): boolean {
  return !!env("NOWNODES_API_KEY");
}

export function nownodesHost(chainId: string): string | null {
  return NOWNODES_BOOKS[chainId] ?? null;
}

async function nnGet<T>(chainId: string, path: string): Promise<T> {
  const key = env("NOWNODES_API_KEY");
  if (!key) throw new Error("NOWNODES_API_KEY is not configured");
  const host = nownodesHost(chainId);
  if (!host) throw new Error(`NowNodes: no Blockbook host for ${chainId}`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`https://${host}/api/v2${path}`, {
      headers: { "api-key": key, accept: "application/json" },
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`NowNodes ${chainId} ${path} ${res.status}: ${text.slice(0, 160)}`);
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(t);
  }
}

export interface BbAddress {
  address: string;
  balance: string;
  totalReceived?: string;
  totalSent?: string;
  unconfirmedBalance?: string;
  unconfirmedTxs?: number;
  txs?: number;
  transactions?: BbTx[];
}

export interface BbTx {
  txid: string;
  blockHeight: number;
  blockTime?: number;
  confirmations: number;
  hex?: string;
  vin: { addresses?: string[]; value?: string; isAddress?: boolean }[];
  vout: { addresses?: string[]; value?: string; isAddress?: boolean }[];
}

export interface BbUtxo {
  txid: string;
  vout: number;
  value: string;
  height?: number;
  confirmations: number;
}

const n = (v: string | undefined) => Number(v ?? "0") || 0;

export async function nnAddress(chainId: string, address: string): Promise<BbAddress> {
  return nnGet<BbAddress>(chainId, `/address/${encodeURIComponent(address)}?details=basic`);
}

/** Esplora-shaped address stats. */
export async function nnAddressInfoShaped(chainId: string, address: string) {
  const a = await nnAddress(chainId, address);
  const unconfirmed = n(a.unconfirmedBalance);
  const unconfirmedTxs = a.unconfirmedTxs ?? 0;
  return {
    address,
    chain_stats: {
      funded_txo_sum: n(a.totalReceived),
      spent_txo_sum: n(a.totalSent),
      tx_count: Math.max(0, (a.txs ?? 0) - unconfirmedTxs),
    },
    mempool_stats: {
      funded_txo_sum: unconfirmed > 0 ? unconfirmed : 0,
      spent_txo_sum: unconfirmed < 0 ? -unconfirmed : 0,
      tx_count: unconfirmedTxs,
    },
  };
}

export async function nnUtxosShaped(chainId: string, address: string) {
  const utxos = await nnGet<BbUtxo[]>(chainId, `/utxo/${encodeURIComponent(address)}`);
  return utxos.map((u) => ({
    txid: u.txid,
    vout: u.vout,
    value: n(u.value),
    status: {
      confirmed: u.confirmations > 0,
      block_height: u.height && u.height > 0 ? u.height : undefined,
    },
  }));
}

export async function nnTxs(chainId: string, address: string, pageSize = 25): Promise<BbTx[]> {
  const a = await nnGet<BbAddress>(
    chainId,
    `/address/${encodeURIComponent(address)}?details=txs&pageSize=${pageSize}`,
  );
  return a.transactions ?? [];
}

export async function nnTxHex(chainId: string, txid: string): Promise<string> {
  const tx = await nnGet<BbTx>(chainId, `/tx/${encodeURIComponent(txid)}`);
  if (!tx.hex) throw new Error("NowNodes: raw tx unavailable");
  return tx.hex;
}

export async function nnBroadcast(chainId: string, rawHex: string): Promise<string> {
  const out = await nnGet<{ result?: string; error?: { message?: string } }>(
    chainId,
    `/sendtx/${rawHex}`,
  );
  if (out.error?.message) throw new Error(out.error.message);
  if (!out.result) throw new Error("NowNodes: broadcast returned no txid");
  return out.result;
}
