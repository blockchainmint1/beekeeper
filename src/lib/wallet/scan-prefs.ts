// User-tunable HD scan depth. Controls both the gap-limit used by the UTXO
// walker and the per-chain scan ceiling floor for EVM address enumeration.
// Higher values = more derived addresses checked per refresh (slower, but
// catches funds sitting on high indexes). Default 20 matches the BIP-44
// gap-limit standard; users can dial up to 100.

import { useEffect, useState } from "react";

const KEY = "beekeeper-scan-gap-v1";
export const SCAN_GAP_DEFAULT = 20;
export const SCAN_GAP_MIN = 20;
export const SCAN_GAP_MAX = 100;

function clamp(n: number): number {
  if (!Number.isFinite(n)) return SCAN_GAP_DEFAULT;
  return Math.max(SCAN_GAP_MIN, Math.min(SCAN_GAP_MAX, Math.round(n)));
}

export function getScanGap(): number {
  if (typeof window === "undefined") return SCAN_GAP_DEFAULT;
  try {
    const v = Number(localStorage.getItem(KEY));
    return v ? clamp(v) : SCAN_GAP_DEFAULT;
  } catch {
    return SCAN_GAP_DEFAULT;
  }
}

export function setScanGap(n: number): number {
  const v = clamp(n);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, String(v));
      window.dispatchEvent(new CustomEvent("beekeeper:scan-gap", { detail: v }));
    } catch { /* ignore */ }
  }
  return v;
}

export function useScanGap(): number {
  const [gap, setGap] = useState<number>(SCAN_GAP_DEFAULT);
  useEffect(() => {
    setGap(getScanGap());
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent<number>).detail;
      if (typeof d === "number") setGap(d);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setGap(getScanGap());
    };
    window.addEventListener("beekeeper:scan-gap", onEvt as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("beekeeper:scan-gap", onEvt as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return gap;
}
