import { useEffect, useState } from "react";
import type { ChainId } from "@/lib/chains";

const KEY = "quad-wallet-visible-chains";
const DEFAULT: ChainId[] = ["txc", "btc", "ltc", "bch", "isk", "eth", "sol", "trx", "zchl"];

function read(): ChainId[] {
  if (typeof localStorage === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as ChainId[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function write(ids: ChainId[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event("visible-chains-changed"));
}

export function getVisibleChainIds(): ChainId[] {
  return read();
}

export function setVisibleChainIds(ids: ChainId[]): void {
  write(ids);
}

export function toggleChainVisible(id: ChainId): void {
  const cur = read();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  // never let the user hide every chain
  write(next.length ? next : [id]);
}

export function useVisibleChainIds(): ChainId[] {
  const [ids, setIds] = useState<ChainId[]>(() => read());
  useEffect(() => {
    const sync = () => setIds(read());
    window.addEventListener("visible-chains-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("visible-chains-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return ids;
}