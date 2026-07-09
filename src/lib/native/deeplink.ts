/**
 * Deep-link listener stub. Ready for future beekeeper:// or Nectar tap-to-pay
 * URL schemes. On web (Lovable preview) the listener is a no-op.
 */
import type { AnyRouter } from "@tanstack/react-router";
import { isNative } from "./platform";

export async function registerDeepLinkListener(_router: AnyRouter): Promise<() => void> {
  if (!isNative()) return () => {};
  try {
    const { App } = await import("@capacitor/app");
    const sub = await App.addListener("appUrlOpen", (event) => {
      // Wire routes here when we define a scheme. For now just log.
      // eslint-disable-next-line no-console
      console.info("[deeplink]", event.url);
    });
    return () => { sub.remove().catch(() => {}); };
  } catch {
    return () => {};
  }
}
