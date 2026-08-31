/**
 * Blockchain Mint registry client (server-only).
 *
 * The six-character Asset ID printed on a Cold Storage Coin is assigned by the
 * mint — it is NOT safely derivable from a key, because one seed can back coins
 * of several chains (TXC, Iskander, BTC, EVM…). Always look it up.
 *
 *   POST {base}/v5/coin-details  { publicKey, cryptoBalance } -> coin record | 404
 *
 * A 404 means that public key is not in the mint registry.
 */

// api.blockchainmint.com 307-redirects here; call the canonical host directly.
const DEFAULT_BASE = "https://admin.coldstoragecoins.com/api";
const TIMEOUT_MS = 12_000;

function baseUrl(): string {
  return (process.env["BM_REGISTRY_URL"] || DEFAULT_BASE).replace(/\/+$/, "");
}

export interface RegistryCoin {
  assetId: string | null;
  publicKey: string;
  blockchainCode: string | null;
  blockchainName: string | null;
  cryptoCurrency: string | null;
}

export type RegistryLookup =
  | { found: true; coin: RegistryCoin }
  | { found: false; reason: "not_found" }
  | { found: false; reason: "unavailable"; error: string };

/** Look up a manufactured coin by one of its public keys (addresses). */
export async function lookupCoinDetails(publicKey: string): Promise<RegistryLookup> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl()}/v5/coin-details`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey, cryptoBalance: "" }),
      signal: ac.signal,
    });
    const json = (await res.json().catch(() => null)) as
      | { coin?: Record<string, unknown>; message?: string }
      | null;

    if (res.status === 404) return { found: false, reason: "not_found" };
    if (!res.ok) {
      return {
        found: false,
        reason: "unavailable",
        error: String(json?.message ?? `Registry error ${res.status}`),
      };
    }
    const c = json?.coin;
    const key = typeof c?.["publicKey"] === "string" ? (c["publicKey"] as string) : null;
    if (!c || !key) return { found: false, reason: "not_found" };

    const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return {
      found: true,
      coin: {
        assetId: s(c["assetId"]),
        publicKey: key,
        blockchainCode: s(c["blockchainCode"]),
        blockchainName: s(c["blockchainName"]),
        cryptoCurrency: s(c["cryptoCurrency"]),
      },
    };
  } catch (e) {
    return { found: false, reason: "unavailable", error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/** Try each candidate address in order; returns the first registry hit. */
export async function lookupCoinByAddresses(addresses: string[]): Promise<RegistryLookup> {
  let last: RegistryLookup = { found: false, reason: "not_found" };
  for (const addr of addresses) {
    if (!addr) continue;
    const r = await lookupCoinDetails(addr);
    if (r.found) return r;
    if (r.reason === "unavailable") last = r;
  }
  return last;
}
