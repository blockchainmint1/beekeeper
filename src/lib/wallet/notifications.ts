// Client-side transaction notifications: storage, prefs, helpers.
// Detection lives in the dashboard; this module owns persistence and the React glue.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ChainConfig } from "@/lib/chains";
import type { HistoryItem } from "./history";

// ---------- Types ----------
export interface Notification {
  id: string;            // `${chainId}:${txid}`
  chainId: string;
  ticker: string;
  amount: string;        // pre-formatted display amount
  txid: string;
  url: string;
  whenSec: number;       // when the notification was created (not the tx time)
  read: boolean;
}

export interface NotifPrefs {
  inApp: boolean;
  emailEnabled: boolean;
  email: string;
  telegramEnabled: boolean;
  telegramChatId: string;
}

const NOTIFS_KEY = "bk:notifications";
const SEEN_KEY = "bk:notif-seen";       // Set<string> of `${chainId}:${txid}`
const PREFS_KEY = "bk:notif-prefs";
const MAX_NOTIFS = 50;
const MAX_SEEN = 500;

const DEFAULT_PREFS: NotifPrefs = {
  inApp: true,
  emailEnabled: false,
  email: "",
  telegramEnabled: false,
  telegramChatId: "",
};

// ---------- Storage ----------
function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

// ---------- Pub/sub (cross-component reactivity) ----------
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ---------- Notifications ----------
export function loadNotifications(): Notification[] {
  return readJson<Notification[]>(NOTIFS_KEY, []);
}

function saveNotifications(list: Notification[]) {
  writeJson(NOTIFS_KEY, list.slice(0, MAX_NOTIFS));
  emit();
}

export function addNotification(n: Notification) {
  const list = loadNotifications();
  if (list.some((x) => x.id === n.id)) return;
  saveNotifications([n, ...list]);
}

export function markAllRead() {
  const list = loadNotifications().map((n) => ({ ...n, read: true }));
  saveNotifications(list);
}

export function markRead(id: string) {
  const list = loadNotifications().map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotifications(list);
}

export function clearNotifications() {
  saveNotifications([]);
}

// ---------- Seen set (so we don't re-alert on existing txs) ----------
function loadSeen(): Set<string> {
  return new Set(readJson<string[]>(SEEN_KEY, []));
}

function saveSeen(seen: Set<string>) {
  // Cap to avoid runaway growth.
  const arr = Array.from(seen);
  if (arr.length > MAX_SEEN) arr.splice(0, arr.length - MAX_SEEN);
  writeJson(SEEN_KEY, arr);
}

export function hasSeen(id: string): boolean {
  return loadSeen().has(id);
}

export function markSeen(ids: string[]) {
  if (ids.length === 0) return;
  const seen = loadSeen();
  for (const id of ids) seen.add(id);
  saveSeen(seen);
}

// ---------- Prefs ----------
export function loadPrefs(): NotifPrefs {
  return { ...DEFAULT_PREFS, ...readJson<Partial<NotifPrefs>>(PREFS_KEY, {}) };
}

export function savePrefs(patch: Partial<NotifPrefs>) {
  const next = { ...loadPrefs(), ...patch };
  writeJson(PREFS_KEY, next);
  emit();
}

// ---------- React hooks ----------
export function useNotifications(): Notification[] {
  return useSyncExternalStore(
    subscribe,
    loadNotifications,
    () => [] as Notification[],
  );
}

export function useUnreadCount(): number {
  const list = useNotifications();
  return list.filter((n) => !n.read).length;
}

export function useNotifPrefs(): NotifPrefs {
  const [v, setV] = useState<NotifPrefs>(() => loadPrefs());
  useEffect(() => subscribe(() => setV(loadPrefs())), []);
  return v;
}

// ---------- Detection helper ----------
/**
 * Given a fresh list of recent history items for a wallet, returns the brand-new
 * incoming items the user hasn't been alerted about yet. Marks them as seen.
 *
 * On the very first call (cold start), it marks everything seen WITHOUT firing
 * — we don't want to flood the user with alerts for historical transactions.
 */
export function detectNewIncoming(
  items: Array<HistoryItem & { chain: ChainConfig }>,
): Array<HistoryItem & { chain: ChainConfig }> {
  if (items.length === 0) return [];

  const seen = loadSeen();
  const coldStart = seen.size === 0;
  const ids = items.map((it) => `${it.chain.id}:${it.txid}`);

  if (coldStart) {
    markSeen(ids);
    return [];
  }

  const fresh = items.filter((it) => {
    if (it.direction !== "in") return false;
    const id = `${it.chain.id}:${it.txid}`;
    return !seen.has(id);
  });

  markSeen(ids);
  return fresh;
}
