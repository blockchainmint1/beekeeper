// Privacy toggle — masks every fiat/native amount in the UI without touching
// any of the underlying data. Ported from the HME Mobile wallet.
import { useEffect, useState } from "react";

const KEY = "beekeeper-hide-balances";
export const HIDE_BALANCES_EVENT = "beekeeper:hide-balances-changed";

export function getHideBalances(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setHideBalances(v: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* storage disabled */
  }
  window.dispatchEvent(new Event(HIDE_BALANCES_EVENT));
}

export function toggleHideBalances(): void {
  setHideBalances(!getHideBalances());
}

/** Reactive read. Starts `false` so SSR/hydration always agree. */
export function useHideBalances(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const sync = () => setHidden(getHideBalances());
    sync();
    window.addEventListener(HIDE_BALANCES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(HIDE_BALANCES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return hidden;
}

/** Replace a rendered amount with dots when balances are hidden. */
export function maskAmount(text: string, hidden: boolean): string {
  return hidden ? "••••" : text;
}
