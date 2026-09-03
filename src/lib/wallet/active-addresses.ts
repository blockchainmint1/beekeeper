// Remembers the HD addresses a balance scan found active, per vault + chain, so
// history views can aggregate transactions across the whole wallet instead of
// only the index-0 address. Purely a cache of public addresses — no key material.

const PREFIX = "bk-active-addrs-v1";
const MAX = 120;

function key(seedKey: string, chainId: string) {
  return `${PREFIX}:${seedKey}:${chainId}`;
}

export function rememberActiveAddresses(
  seedKey: string,
  chainId: string,
  addresses: string[],
): void {
  if (typeof window === "undefined" || !seedKey) return;
  try {
    const unique = [...new Set(addresses.filter(Boolean))].slice(0, MAX);
    if (unique.length === 0) return;
    localStorage.setItem(key(seedKey, chainId), JSON.stringify(unique));
  } catch { /* ignore */ }
}

export function getActiveAddresses(seedKey: string, chainId: string): string[] {
  if (typeof window === "undefined" || !seedKey) return [];
  try {
    const raw = localStorage.getItem(key(seedKey, chainId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === "string") : [];
  } catch {
    return [];
  }
}

/** Addresses to fetch history for: everything a scan saw, plus the shown address. */
export function historyAddresses(
  seedKey: string,
  chainId: string,
  primary: string | null | undefined,
): string[] {
  const set = new Set<string>();
  if (primary) set.add(primary);
  for (const a of getActiveAddresses(seedKey, chainId)) set.add(a);
  return [...set].slice(0, MAX);
}
