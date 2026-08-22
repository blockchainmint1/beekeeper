// Local receipt log for cash-out orders, scoped to the vault fingerprint.
import { getVaultFingerprint } from "@/lib/wallet/seed";
import type { CashOutOrderRecord } from "./types";

const KEY = "beekeeper-cashout-orders-v1";

type Store = Record<string, CashOutOrderRecord[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function listCashOutOrders(): CashOutOrderRecord[] {
  const fp = getVaultFingerprint();
  if (!fp) return [];
  return (read()[fp] ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

export function saveCashOutOrder(order: CashOutOrderRecord): void {
  const fp = getVaultFingerprint();
  if (!fp) return;
  const store = read();
  store[fp] = [order, ...(store[fp] ?? []).filter((o) => o.id !== order.id)].slice(0, 50);
  write(store);
}

export function hasCompletedCashOut(): boolean {
  return listCashOutOrders().some((o) => o.status !== "cancelled");
}
