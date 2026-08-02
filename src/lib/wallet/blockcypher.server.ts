// BlockCypher-backed BTC reads. Server-only — uses BLOCKCYPHER_API token.
// Endpoints: https://www.blockcypher.com/dev/bitcoin/
import { env } from "../server-env";

const BASE = "https://api.blockcypher.com/v1/btc/main";

function tokenParam(): string {
  const t = env("BLOCKCYPHER_API");
  return t ? `?token=${encodeURIComponent(t)}` : "";
}

function joinQ(url: string, extra: string): string {
  if (!extra) return url;
  return url.includes("?") ? `${url}&${extra}` : `${url}?${extra}`;
}

// BlockCypher's free tier is ~3 req/s / 100 req/hr. Serialize calls with a
// minimum spacing, retry 429s with backoff, and cache responses briefly so an
// HD scan of many addresses doesn't blow the limit.
const MIN_INTERVAL_MS = 400;
const CACHE_TTL_MS = 60_000;
let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;
const cache = new Map<string, { at: number; value: unknown }>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function rawFetch<T>(url: string, path: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`BlockCypher ${path} ${res.status}: ${body.slice(0, 200)}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function bcFetch<T>(path: string, extraQuery = ""): Promise<T> {
  const url = joinQ(`${BASE}${path}${tokenParam()}`, extraQuery);
  const key = `${path}|${extraQuery}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;

  const run = chain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastAt);
    if (wait > 0) await sleep(wait);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const value = await rawFetch<T>(url, path);
        lastAt = Date.now();
        cache.set(key, { at: Date.now(), value });
        return value;
      } catch (e) {
        lastErr = e;
        lastAt = Date.now();
        const status = (e as { status?: number }).status;
        if (status !== 429 && status !== 503) break;
        await sleep(800 * 2 ** attempt);
      }
    }
    throw lastErr;
  });
  chain = run.catch(() => {});
  return run as Promise<T>;
}


export interface BcBalance {
  address: string;
  balance: number;
  unconfirmed_balance: number;
  total_received: number;
  total_sent: number;
  n_tx: number;
  unconfirmed_n_tx: number;
}

export async function bcAddressBalance(address: string): Promise<BcBalance> {
  return bcFetch<BcBalance>(`/addrs/${address}/balance`);
}
