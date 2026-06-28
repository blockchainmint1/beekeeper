// Per-chain HD high-water-mark. Tracks the highest derivation index we've
// ever observed activity on, so subsequent scans always cover at least that
// far even when many newer addresses are still empty.
//
// Pair this with a generous gap-limit: scan floor = max(watermark + gap, base).
// If a merchant suddenly bursts from 5/day to 200/hour the watermark climbs
// organically; if they sit at 1–2/day we just walk a few extra empties.

const KEY = "lovable-multi-wallet-hd-watermark-v1";

export type HdBranch = "recv" | "evm"; // utxo receive/change collapsed under "recv"

interface Store {
  // `${chainId}:${branch}` -> highest used index
  [k: string]: number;
}

function load(): Store {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store; } catch { return {}; }
}
function save(s: Store): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function getWatermark(chainId: string, branch: HdBranch = "recv"): number {
  return load()[`${chainId}:${branch}`] ?? -1;
}

/** Update only if `index` exceeds the stored value. Returns the new mark. */
export function bumpWatermark(chainId: string, index: number, branch: HdBranch = "recv"): number {
  const s = load();
  const k = `${chainId}:${branch}`;
  const cur = s[k] ?? -1;
  if (index > cur) {
    s[k] = index;
    save(s);
    return index;
  }
  return cur;
}

/** Recommended scan ceiling: watermark + gap, clamped to a sane floor. */
export function scanCeiling(chainId: string, gap: number, floor = 20, branch: HdBranch = "recv"): number {
  const wm = getWatermark(chainId, branch);
  return Math.max(floor, wm + 1 + gap);
}
