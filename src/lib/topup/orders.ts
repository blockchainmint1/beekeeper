// Local receipt log for ACH top-up orders, scoped to the vault fingerprint so a
// wipe + fresh seed never inherits another wallet's orders.
import { getVaultFingerprint } from "@/lib/wallet/seed";
import type { TopUpOrderRecord } from "./types";

const KEY = "beekeeper-topup-orders-v1";

type Store = Record<string, TopUpOrderRecord[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

export function listTopUpOrders(): TopUpOrderRecord[] {
  const fp = getVaultFingerprint();
  if (!fp) return [];
  return (read()[fp] ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

export function saveTopUpOrder(order: TopUpOrderRecord): void {
  const fp = getVaultFingerprint();
  if (!fp) return;
  const store = read();
  store[fp] = [order, ...(store[fp] ?? [])].slice(0, 50);
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function hasCompletedTopUp(): boolean {
  return listTopUpOrders().length > 0;
}
