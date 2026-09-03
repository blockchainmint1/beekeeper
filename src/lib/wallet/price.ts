// USD price feed for all chains. Uses CoinGecko for EVM coins, mempool TXC for TXC.
// Caches results in-memory and in sessionStorage for snappy refreshes.
import { CHAIN_LIST, type ChainConfig } from "@/lib/chains";

export type PriceMap = Record<string, number>; // key = ChainId | tokenSymbol@chainId | coingeckoId

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
  ids.add("dash");
  // TXC + ISK have no CoinGecko listing; CMC fallback fills them by ticker.
  ids.add("txc");
  ids.add("isk");
  for (const c of CHAIN_LIST) {
    if (c.kind === "evm" && c.coingeckoId) ids.add(c.coingeckoId);
    if (c.kind === "evm") for (const t of c.tokens) if (t.coingeckoId) ids.add(t.coingeckoId);
    if ((c.kind === "tron" || c.kind === "solana") && c.coingeckoId) ids.add(c.coingeckoId);
  }

  const out: PriceMap = { ...previous };

  // PRIMARY: CoinMarketCap (server-side, key stays private). One call covers
  // every coin/token we track, and it doesn't rate-limit mobile networks the way
  // CoinGecko does.
  try {
    const { fetchCmcPrices } = await import("./price.functions");
    const cmc = await fetchCmcPrices({ data: { keys: [...ids] } });
    for (const [k, v] of Object.entries(cmc)) {
      if (typeof v === "number" && isFinite(v) && v > 0) out[k] = v;
    }
  } catch { /* fall through to public feeds */ }

  // CoinGecko simple/price — fills anything CMC didn't return.
  const cgMissing = [...ids].filter((k) => out[k] == null);
  if (cgMissing.length > 0) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cgMissing.join(",")}&vs_currencies=usd`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as Record<string, { usd?: number }>;
        for (const [id, v] of Object.entries(data)) {
          if (typeof v?.usd === "number") out[id] = v.usd;
        }
      }
    } catch { /* ignore */ }
  }

  // ISK / wISK price from the wISK Wrap site (on-chain Uniswap V3 wISK/USDC).
  // No CEX lists ISK, so this pool read is the canonical source and overrides CMC.
  for (const base of [
    "https://wrap.iskandercoin.com",
    "https://project--3c367caa-8e24-4dc8-88e7-68ee6b6ac8cf.lovable.app",
  ]) {
    try {
      const r = await fetch(`${base}/api/public/price`);
      if (!r.ok) continue;
      const j = (await r.json()) as { ok?: boolean; usd?: number };
      if (j?.ok && typeof j.usd === "number" && isFinite(j.usd) && j.usd > 0) {
        out["isk"] = j.usd;
        break;
      }
    } catch { /* try next */ }
  }

  // ZCU / wZCU price from the wZCU wrap site (on-chain Uniswap V3 wZCU/USDC).
  try {
    const r = await fetch("https://wzcu.zerochill.com/api/public/price");
    if (r.ok) {
      const j = (await r.json()) as { ok?: boolean; usd?: number };
      if (j?.ok && typeof j.usd === "number" && isFinite(j.usd) && j.usd > 0) {
        out["zcu"] = j.usd;
      }
    }
  } catch { /* ignore */ }

  // TXC price from its own mempool, used only when CMC has no quote. This
  // endpoint returns a single lowercase `usd` value.
  if (out["txc"] == null) {
    try {
      const r = await fetch("https://mempool.texitcoin.org/api/v1/price");
      if (r.ok) {
        const j = (await r.json()) as { usd?: number };
        if (typeof j?.usd === "number" && isFinite(j.usd) && j.usd > 0) out["txc"] = j.usd;
      }
    } catch { /* ignore */ }
  }

  // Last resort: Coinbase spot for the majors.
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
    if (chain.id === "isk") return prices["isk"] ?? null;
    if (chain.id === "btc") return prices["bitcoin"] ?? null;
    if (chain.id === "ltc") return prices["litecoin"] ?? null;
    if (chain.id === "bch") return prices["bitcoin-cash"] ?? null;
    if (chain.id === "doge") return prices["dogecoin"] ?? null;
    if (chain.id === "dash") return prices["dash"] ?? null;
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