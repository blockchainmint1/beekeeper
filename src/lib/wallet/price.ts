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
  ids.add("bitcoin");
  ids.add("litecoin");
  ids.add("bitcoin-cash");
  ids.add("dogecoin");
  // TXC + ISK have no CoinGecko listing; CMC fallback fills them by ticker.
  ids.add("txc");
  ids.add("isk");
  for (const c of CHAIN_LIST) {
    if (c.kind === "evm" && c.coingeckoId) ids.add(c.coingeckoId);
    if (c.kind === "evm") for (const t of c.tokens) if (t.coingeckoId) ids.add(t.coingeckoId);
    if ((c.kind === "tron" || c.kind === "solana") && c.coingeckoId) ids.add(c.coingeckoId);
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

  // Fallback price feed: Coinbase spot (no auth, no rate-limit for reasonable use).
  // CoinGecko frequently 429s from mobile networks and residential IPs; without
  // this fallback USDT/USDC/ETH would be valued at $0 in the dashboard total.
  const missing: Array<{ cg: string; pair: string }> = [];
  if (out["tether"] == null)     missing.push({ cg: "tether",     pair: "USDT-USD" });
  if (out["usd-coin"] == null)   missing.push({ cg: "usd-coin",   pair: "USDC-USD" });
  if (out["ethereum"] == null)   missing.push({ cg: "ethereum",   pair: "ETH-USD"  });
  if (out["binancecoin"] == null) missing.push({ cg: "binancecoin", pair: "BNB-USD" });
  if (out["bitcoin"] == null)    missing.push({ cg: "bitcoin",    pair: "BTC-USD"  });
  await Promise.all(
    missing.map(async ({ cg, pair }) => {
      try {
        const r = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`);
        if (!r.ok) return;
        const j = (await r.json()) as { data?: { amount?: string } };
        const px = j.data?.amount ? parseFloat(j.data.amount) : NaN;
        if (isFinite(px) && px > 0) out[cg] = px;
      } catch { /* ignore */ }
    }),
  );

  // CoinMarketCap fallback for anything still missing after CoinGecko + Coinbase.
  // Runs server-side (CMC_API key stays private) and covers coins Coinbase doesn't
  // list (POL, TRX, DAI, ISK, etc.).
  const stillMissing = [...ids].filter((k) => out[k] == null);
  if (stillMissing.length > 0) {
    try {
      const { fetchCmcPrices } = await import("./price.functions");
      const cmc = await fetchCmcPrices({ data: { keys: stillMissing } });
      for (const [k, v] of Object.entries(cmc)) {
        if (typeof v === "number" && isFinite(v) && v > 0) out[k] = v;
      }
    } catch { /* ignore */ }
  }

  // Ultimate stablecoin safety net: pin to $1 if every feed failed. USDT/USDC
  // depegs are rare enough that showing "$1" beats showing "$0" for a merchant
  // sitting on thousands of stables.
  if (out["tether"] == null)   out["tether"]   = 1;
  if (out["usd-coin"] == null) out["usd-coin"] = 1;

  saveCache(out);
  return out;
}


export function priceForChain(prices: PriceMap, chain: ChainConfig): number | null {
  if (chain.kind === "utxo") {
    if (chain.id === "txc") return prices["txc"] ?? null;
    if (chain.id === "btc") return prices["bitcoin"] ?? null;
    if (chain.id === "ltc") return prices["litecoin"] ?? null;
    if (chain.id === "bch") return prices["bitcoin-cash"] ?? null;
    return null;
  }
  if (chain.kind === "evm") {
    return chain.coingeckoId ? (prices[chain.coingeckoId] ?? null) : null;
  }
  // tron / solana
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