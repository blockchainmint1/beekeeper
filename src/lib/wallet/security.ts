// Client-side security preferences + helpers.
// All settings live in localStorage. None of this leaves the browser.
import { useEffect, useSyncExternalStore } from "react";

const KEY = "lovable-multi-wallet-security-v1";
const KNOWN_ADDRS_KEY = "lovable-multi-wallet-known-addrs-v1";

export interface SecurityPrefs {
  autoLockMinutes: number; // 0 = disabled
  lockOnHidden: boolean; // lock when tab hidden for > 60s
  antiPhishingPhrase: string; // shown on unlock screen
  clipboardClearSeconds: number; // 0 = never clear
  firstSendWarning: boolean; // warn before first send to a new address
}

const DEFAULTS: SecurityPrefs = {
  autoLockMinutes: 5,
  lockOnHidden: true,
  antiPhishingPhrase: "",
  clipboardClearSeconds: 30,
  firstSendWarning: true,
};

function read(): SecurityPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

const listeners = new Set<() => void>();
let cache: SecurityPrefs | null = null;

function snapshot(): SecurityPrefs {
  if (!cache) cache = read();
  return cache;
}

export function getSecurityPrefs(): SecurityPrefs {
  return snapshot();
}

export function setSecurityPrefs(patch: Partial<SecurityPrefs>): void {
  const next = { ...snapshot(), ...patch };
  cache = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function useSecurityPrefs(): SecurityPrefs {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    snapshot,
    () => DEFAULTS,
  );
}

/* ─── Known address book (for first-send warnings) ─── */

function readKnown(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KNOWN_ADDRS_KEY) ?? "[]") as string[]; }
  catch { return []; }
}

export function isKnownAddress(addr: string): boolean {
  return readKnown().includes(addr.trim().toLowerCase());
}

export function rememberAddress(addr: string): void {
  const set = new Set(readKnown());
  set.add(addr.trim().toLowerCase());
  localStorage.setItem(KNOWN_ADDRS_KEY, JSON.stringify([...set]));
}

/* ─── Secure clipboard ─── */

/**
 * Copy text to the clipboard, optionally clearing it after N seconds.
 * Falls back gracefully if the clipboard API isn't available.
 */
export async function secureCopy(text: string, clearAfterSeconds?: number): Promise<void> {
  const seconds = clearAfterSeconds ?? snapshot().clipboardClearSeconds;
  await navigator.clipboard.writeText(text);
  if (seconds > 0) {
    setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === text) {
          await navigator.clipboard.writeText("");
        }
      } catch {
        // Permission may be denied for readText — try to overwrite anyway after the delay
        try { await navigator.clipboard.writeText(""); } catch { /* give up silently */ }
      }
    }, seconds * 1000);
  }
}

/* ─── Idle lock hook ─── */

/**
 * Calls `onIdle` after `minutes` of no user activity, and (if enabled) after
 * the tab has been hidden for >60s. Activity = mousemove, keydown, click,
 * touchstart, scroll. Pass `minutes = 0` to disable idle locking.
 */
export function useIdleLock(onIdle: () => void): void {
  const prefs = useSecurityPrefs();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const minutes = prefs.autoLockMinutes;
    const lockOnHidden = prefs.lockOnHidden;
    if (minutes <= 0 && !lockOnHidden) return;

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

    function clearIdle() { if (idleTimer) clearTimeout(idleTimer); idleTimer = null; }
    function resetIdle() {
      clearIdle();
      if (minutes > 0) {
        idleTimer = setTimeout(() => onIdle(), minutes * 60_000);
      }
    }

    function handleVisibility() {
      if (!lockOnHidden) return;
      if (document.hidden) {
        hiddenTimer = setTimeout(() => onIdle(), 60_000);
      } else if (hiddenTimer) {
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
        resetIdle();
      }
    }

    const events: (keyof DocumentEventMap)[] = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => document.addEventListener(e, resetIdle, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibility);
    resetIdle();

    return () => {
      events.forEach((e) => document.removeEventListener(e, resetIdle));
      document.removeEventListener("visibilitychange", handleVisibility);
      clearIdle();
      if (hiddenTimer) clearTimeout(hiddenTimer);
    };
  }, [prefs.autoLockMinutes, prefs.lockOnHidden, onIdle]);
}