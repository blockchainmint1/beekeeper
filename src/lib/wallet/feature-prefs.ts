// Opt-in feature toggles. Small, localStorage-backed, and readable from
// anywhere via the useFeature() hook.
import { useCallback, useEffect, useState } from "react";

export type FeatureId = "swap" | "confirmLast4";

const KEY = "beekeeper-feature-prefs-v1";
const EVENT = "beekeeper:features-changed";

const DEFAULTS: Record<FeatureId, boolean> = {
  swap: false,
  confirmLast4: true,
};

type Prefs = Partial<Record<FeatureId, boolean>>;

function read(): Prefs {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Prefs;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getFeature(id: FeatureId): boolean {
  const v = read()[id];
  return v === undefined ? DEFAULTS[id] : v;
}

export function setFeature(id: FeatureId, on: boolean): void {
  if (typeof localStorage === "undefined") return;
  const next = { ...read(), [id]: on };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage disabled */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Reactive feature flag: [value, setValue]. */
export function useFeature(id: FeatureId): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(DEFAULTS[id]);

  useEffect(() => {
    const sync = () => setOn(getFeature(id));
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [id]);

  const set = useCallback(
    (next: boolean) => {
      setFeature(id, next);
      setOn(next);
    },
    [id],
  );

  return [on, set];
}
