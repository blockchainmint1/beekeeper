// Hydrates the Zero Chill chain config from server-side settings.
//
// ZCHL ships with sensible defaults so the app renders before the fetch lands;
// once the server answers we patch the chain id and explorer links in place so
// every consumer (send, sweep, history links) uses the operator's real node.
import { ZCHL } from "./index";
import type { ZcuPublicConfig } from "./zcu.functions";

let started = false;
let cached: ZcuPublicConfig | null = null;

export function zcuRuntimeConfig(): ZcuPublicConfig | null {
  return cached;
}

/** True when the server has a ZCU node configured (unknown → assume yes). */
export function zcuConfigured(): boolean {
  return cached ? cached.configured : true;
}

export async function hydrateZcu(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const { zcuConfig } = await import("./zcu.functions");
    const cfg = (await zcuConfig()) as ZcuPublicConfig;
    cached = cfg;
    if (cfg.chainId) {
      (ZCHL as { evmChainId: number }).evmChainId = cfg.chainId;
    }
    if (cfg.explorer) {
      const base = cfg.explorer;
      (ZCHL as { explorerTx: (h: string) => string }).explorerTx = (h) => `${base}/tx/${h}`;
      (ZCHL as { explorerAddr: (a: string) => string }).explorerAddr = (a) =>
        `${base}/address/${a}`;
    }
  } catch {
    // Non-fatal: keep the built-in defaults.
  }
}
