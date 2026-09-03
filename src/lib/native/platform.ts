/**
 * Tiny wrappers around @capacitor/core so the web build never hard-depends on
 * a native runtime. `isNative()` is false in the browser / Lovable preview;
 * native-only code paths must guard on it.
 */
import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): "ios" | "android" | "web" {
  try {
    const p = Capacitor.getPlatform();
    if (p === "ios" || p === "android") return p;
  } catch {
    /* noop */
  }
  return "web";
}

/** The package version installed on the device, not a value baked into JS. */
export async function installedAppVersion(fallback: string): Promise<string> {
  if (!isNative()) return fallback;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    // Older Beekeeper workflows stamped every shell as Capacitor's default
    // 1.0.0 even though the bundled release metadata was correct.
    if (!info.version || (info.version === "1.0.0" && fallback !== "1.0.0")) {
      return fallback;
    }
    return info.version;
  } catch {
    return fallback;
  }
}
