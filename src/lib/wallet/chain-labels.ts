// User-supplied nicknames for wallet cards ("Store float", "Cold BTC", …).
// Falls back to the chain's own name when unset.
import { useEffect, useState } from "react";
import type { ChainId } from "@/lib/chains";

const KEY = "beekeeper-chain-labels";
export const CHAIN_LABEL_EVENT = "beekeeper:chain-labels-changed";

type LabelMap = Partial<Record<ChainId, string>>;

function read(): LabelMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LabelMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(map: LabelMap) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage disabled */
  }
  window.dispatchEvent(new Event(CHAIN_LABEL_EVENT));
}

export function getChainLabel(id: ChainId, fallback: string): string {
  const v = read()[id];
  return v && v.trim() ? v : fallback;
}

export function setChainLabel(id: ChainId, label: string): void {
  const map = read();
  const clean = label.trim().slice(0, 24);
  if (clean) map[id] = clean;
  else delete map[id];
  write(map);
}

/** Bumps on every rename so consumers re-read labels. */
export function useChainLabelVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const h = () => setV((n) => n + 1);
    window.addEventListener(CHAIN_LABEL_EVENT, h);
    return () => window.removeEventListener(CHAIN_LABEL_EVENT, h);
  }, []);
  return v;
}
