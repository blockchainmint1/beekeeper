// Esplora-compatible indexer ("mempool") access for TXC and ISK.
// The base origins live in the TXC_MEMPOOL / ISK_MEMPOOL secrets so we can
// re-point them without a code change. These indexers are dramatically faster
// than the node RPC path for address balances, UTXOs and transaction history.

const TIMEOUT_MS = 12_000;

function clean(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s.replace(/\/+$/, "") : null;
}

/** Returns the `/api` root for a chain's indexer, or null when unconfigured. */
export function mempoolApiBase(chainId: string): string | null {
  const raw =
    chainId === "txc"
      ? clean(process.env["TXC_MEMPOOL"])
      : chainId === "isk"
        ? clean(process.env["ISK_MEMPOOL"])
        : chainId === "zcu" || chainId === "zchl"
          ? clean(process.env["ZCU_MEMPOOL"])
          : null;
  if (!raw) return null;
  return /\/api$/.test(raw) ? raw : `${raw}/api`;
}

export async function mempoolGet<T>(chainId: string, path: string): Promise<T> {
  const base = mempoolApiBase(chainId);
  if (!base) throw new Error("indexer not configured");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json, text/plain" },
    });
    if (!res.ok) throw new Error(`indexer ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) throw new Error("indexer returned html");
    return (ct.includes("application/json") ? await res.json() : await res.text()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function mempoolPost(chainId: string, path: string, body: string): Promise<string> {
  const base = mempoolApiBase(chainId);
  if (!base) throw new Error("indexer not configured");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "text/plain" },
      body,
    });
    const text = (await res.text()).trim();
    if (!res.ok) throw new Error(`indexer ${res.status}`);
    return text;
  } finally {
    clearTimeout(t);
  }
}
