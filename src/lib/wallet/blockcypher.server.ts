// BlockCypher-backed BTC reads. Server-only — uses BLOCKCYPHER_API token.
// Endpoints: https://www.blockcypher.com/dev/bitcoin/
import process from "node:process";

const BASE = "https://api.blockcypher.com/v1/btc/main";

function tokenParam(): string {
  const t = process.env.BLOCKCYPHER_API;
  return t ? `?token=${encodeURIComponent(t)}` : "";
}

function joinQ(url: string, extra: string): string {
  if (!extra) return url;
  return url.includes("?") ? `${url}&${extra}` : `${url}?${extra}`;
}

async function bcFetch<T>(path: string, extraQuery = ""): Promise<T> {
  const url = joinQ(`${BASE}${path}${tokenParam()}`, extraQuery);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`BlockCypher ${path} ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
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
