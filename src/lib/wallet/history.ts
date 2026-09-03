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

async function fetchUtxoTxs(chain: UtxoChain, address: string): Promise<UtxoEsploraTx[] | HistoryItem[]> {
  // TXC/ISK: dedicated Esplora indexers, fetched server-side.
  let txs: UtxoEsploraTx[] | null = null;
  if (chain.id === "txc" || chain.id === "isk") {
    const { mempoolAddressTxs } = await import("./mempool.functions");
    const idx = await mempoolAddressTxs({ data: { chainId: chain.id, address } });
    if (idx) txs = idx as unknown as UtxoEsploraTx[];
  }
  if (!txs) {
    // NowNodes Blockbook is the primary indexer wherever it's available.
    const { nownodesHistoryOrNull } = await import("./nownodes");
    const nn = await nownodesHistoryOrNull(chain, address);
    if (nn) return nn;
    if (chain.api === "blockchair") {
      const { blockchairHistory } = await import("./blockchair");
      return blockchairHistory(chain, address);
    }
    const res = await fetch(`${chain.apiBase}/address/${address}/txs`);
    if (!res.ok) throw new Error(`${chain.ticker} history ${res.status}`);
    const payload = (await res.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new Error(`${chain.ticker} history returned an invalid response`);
    }
    txs = payload as UtxoEsploraTx[];
  }
  if (!Array.isArray(txs)) {
    throw new Error(`${chain.ticker} history is temporarily unavailable`);
  }
  return txs;
}

function isHistoryItems(v: UtxoEsploraTx[] | HistoryItem[]): v is HistoryItem[] {
  return v.length > 0 && (v[0] as HistoryItem).direction !== undefined;
}

function mapEsploraTx(chain: UtxoChain, tx: UtxoEsploraTx, owned: Set<string>): HistoryItem {
  const inSelf = tx.vin.reduce(
    (s, v) =>
      s + (v.prevout?.scriptpubkey_address && owned.has(v.prevout.scriptpubkey_address) ? v.prevout.value : 0),
    0,
  );
  const outSelf = tx.vout.reduce(
    (s, v) => s + (v.scriptpubkey_address && owned.has(v.scriptpubkey_address) ? v.value : 0),
    0,
  );
  const delta = outSelf - inSelf;
  const direction: HistoryItem["direction"] = delta > 0 ? "in" : delta < 0 ? "out" : "self";
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
}

export async function fetchUtxoHistory(chain: UtxoChain, address: string): Promise<HistoryItem[]> {
  return fetchUtxoHistoryMulti(chain, [address]);
}

/** History across every HD address the wallet owns on this chain. */
export async function fetchUtxoHistoryMulti(
  chain: UtxoChain,
  addresses: string[],
): Promise<HistoryItem[]> {
  const owned = new Set(addresses.filter(Boolean));
  if (owned.size === 0) return [];
  const list = [...owned];
  const raw = new Map<string, UtxoEsploraTx>();
  const ready: HistoryItem[] = [];
  let lastError: unknown = null;
  let ok = 0;

  const CONCURRENCY = 4;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const slice = list.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (addr) => {
        try {
          const res = await fetchUtxoTxs(chain, addr);
          ok++;
          if (isHistoryItems(res)) {
            for (const item of res) if (!ready.some((r) => r.txid === item.txid)) ready.push(item);
          } else {
            for (const tx of res) if (!raw.has(tx.txid)) raw.set(tx.txid, tx);
          }
        } catch (err) {
          lastError = err;
        }
      }),
    );
  }

  if (ok === 0) {
    throw lastError instanceof Error
      ? lastError
      : new Error(`${chain.ticker} history is temporarily unavailable`);
  }

  const items = [...raw.values()].map((tx) => mapEsploraTx(chain, tx, owned)).concat(ready);
  items.sort((a, b) => (b.whenSec ?? Number.MAX_SAFE_INTEGER) - (a.whenSec ?? Number.MAX_SAFE_INTEGER));
  return items;
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

/** Like `fetchHistory`, but UTXO chains aggregate across every owned HD address. */
export async function fetchHistoryMulti(
  chain: ChainConfig,
  addresses: string[],
): Promise<HistoryItem[]> {
  if (chain.kind === "utxo") return fetchUtxoHistoryMulti(chain as UtxoChain, addresses);
  const first = addresses.find(Boolean);
  if (!first) return [];
  return fetchHistory(chain, first);
}


export function hasNativeHistory(chain: ChainConfig): boolean {
  if (chain.kind === "utxo" || chain.kind === "tron" || chain.kind === "solana") return true;
  // EVM chains covered by Alchemy get in-app history too.
  return chain.kind === "evm" && ["eth", "bsc", "base", "polygon"].includes(chain.id);
}