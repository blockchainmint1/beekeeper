// Lightweight transaction history. UTXO via esplora; EVM falls back to an explorer link.
import type { ChainConfig, UtxoChain } from "@/lib/chains";

export interface HistoryItem {
  txid: string;
  direction: "in" | "out" | "self";
  amount: string;           // pre-formatted display amount (no ticker)
  ticker: string;
  whenSec: number | null;   // unix seconds
  confirmed: boolean;
  url: string;
  raw?: unknown;
}

interface UtxoEsploraTx {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: { prevout?: { scriptpubkey_address?: string; value: number } }[];
  vout: { scriptpubkey_address?: string; value: number }[];
}

export async function fetchUtxoHistory(chain: UtxoChain, address: string): Promise<HistoryItem[]> {
  const res = await fetch(`${chain.apiBase}/address/${address}/txs`);
  if (!res.ok) throw new Error(`${chain.ticker} history ${res.status}`);
  const txs = (await res.json()) as UtxoEsploraTx[];
  return txs.map((tx) => {
    const inSelf = tx.vin.reduce(
      (s, v) => s + (v.prevout?.scriptpubkey_address === address ? v.prevout.value : 0),
      0,
    );
    const outSelf = tx.vout.reduce(
      (s, v) => s + (v.scriptpubkey_address === address ? v.value : 0),
      0,
    );
    const delta = outSelf - inSelf;
    const direction: HistoryItem["direction"] =
      delta > 0 ? "in" : delta < 0 ? "out" : "self";
    const amount = (Math.abs(delta) / 10 ** chain.decimals).toLocaleString(undefined, {
      maximumFractionDigits: 8,
    });
    return {
      txid: tx.txid,
      direction,
      amount,
      ticker: chain.ticker,
      whenSec: tx.status.block_time ?? null,
      confirmed: tx.status.confirmed,
      url: chain.explorerTx(tx.txid),
      raw: tx,
    };
  });
}

export function explorerHistoryUrl(chain: ChainConfig, address: string): string {
  return chain.explorerAddr(address);
}

/** Unified history fetcher — dispatches per chain kind. */
export async function fetchHistory(chain: ChainConfig, address: string): Promise<HistoryItem[]> {
  if (chain.kind === "utxo") {
    return fetchUtxoHistory(chain, address);
  }
  if (chain.kind === "tron") {
    const { fetchTronHistory } = await import("./tron");
    return fetchTronHistory(chain, address);
  }
  if (chain.kind === "solana") {
    const { fetchSolanaHistory } = await import("./solana");
    return fetchSolanaHistory(chain, address);
  }
  // EVM: Alchemy alchemy_getAssetTransfers via same-origin proxy for the
  // chains we've provisioned. Non-Alchemy EVM chains still punt to explorer.
  const { isAlchemyEvm, fetchEvmHistory } = await import("./evm-history");
  if (isAlchemyEvm(chain.id)) {
    return fetchEvmHistory(chain, address);
  }
  return [];
}

export function hasNativeHistory(chain: ChainConfig): boolean {
  if (chain.kind === "utxo" || chain.kind === "tron" || chain.kind === "solana") return true;
  // EVM chains covered by Alchemy get in-app history too.
  return chain.kind === "evm" && ["eth", "bsc", "base", "polygon"].includes(chain.id);
}