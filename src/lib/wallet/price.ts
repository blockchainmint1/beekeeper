// USD price feed for all chains. Uses CoinGecko for EVM coins, mempool TXC for TXC.
// Caches results in-memory and in sessionStorage for snappy refreshes.
import { CHAIN_LIST, type ChainConfig } from "@/lib/chains";

type PriceMap = Record<string, number>; // key = ChainId | tokenSymbol@chainId | coingeckoId

const CACHE_KEY = "lovable-wallet-prices-v1";
const TTL_MS = 90_000;

type CacheEntry = { at: number; data: PriceMap };
let memCache: CacheEntry | null = null;

function loadCache(): CacheEntry | null {
  if (memCache && Date.now() - memCache.at < TTL_MS) return memCache;
  if (typeof window === "undefined") return memCache;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return memCache;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.at < TTL_MS) {
      memCache = parsed;
      return parsed;
    }
  } catch { /* ignore */ }
  return memCache;
}

function saveCache(data: PriceMap) {
  memCache = { at: Date.now(), data };
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(memCache));
  } catch { /* ignore */ }
}

/** Fetch a USD price snapshot for every chain + token coingeckoId we know about. */
export async function fetchAllPrices(): Promise<PriceMap> {
  const cachedHit = loadCache();
  if (cachedHit) return cachedHit.data;
  const previous: PriceMap = memCache?.data ?? {};

  const ids = new Set<string>();
  for (const c of CHAIN_LIST) {
    if (c.kind === "evm" && c.coingeckoId) ids.add(c.coingeckoId);
    if (c.kind === "evm") for (const t of c.tokens) if (t.coingeckoId) ids.add(t.coingeckoId);
  }

  const out: PriceMap = { ...previous };

  // CoinGecko simple/price.
  if (ids.size > 0) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${[...ids].join(",")}&vs_currencies=usd`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as Record<string, { usd?: number }>;
        for (const [id, v] of Object.entries(data)) {
          if (typeof v?.usd === "number") out[id] = v.usd;
        }
      }
    } catch { /* ignore */ }
  }

  // TXC price from its own mempool.
  try {
    const r = await fetch("https://mempool.texitcoin.org/api/v1/prices");
    if (r.ok) {
      const j = (await r.json()) as { USD?: number };
      if (typeof j?.USD === "number") out["txc"] = j.USD;
    }
  } catch { /* ignore */ }

  saveCache(out);
  return out;
}

export function priceForChain(prices: PriceMap, chain: ChainConfig): number | null {
  if (chain.kind === "utxo") {
    if (chain.id === "txc") return prices["txc"] ?? null;
    return null;
  }
  return chain.coingeckoId ? (prices[chain.coingeckoId] ?? null) : null;
}

export function priceForCoingeckoId(prices: PriceMap, id?: string): number | null {
  return id ? (prices[id] ?? null) : null;
}

export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !isFinite(usd)) return "—";
  const abs = Math.abs(usd);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return `$${usd.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}