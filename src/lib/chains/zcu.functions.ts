// Public (non-secret) Zero Chill config, read from server env at call time.
//
// The RPC URL and credentials stay server-side (see routes/api.public.rpc.zcu);
// only the chain id, explorer base, and optional mempool/blockbook base are
// exposed so the client can label links and sign with the right chain id.
import { createServerFn } from "@tanstack/react-start";

export interface ZcuPublicConfig {
  configured: boolean;
  chainId: number | null;
  explorer: string | null;
  mempool: string | null;
}

function clean(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

export const zcuConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<ZcuPublicConfig> => {
    const { env } = await import("@/lib/server-env");
    const rawId = env("ZCU_CHAIN_ID");
    const parsed = rawId ? Number(rawId) : NaN;
    return {
      configured: !!env("ZCU_RPC_URL"),
      chainId: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
      explorer: clean(env("ZCU_EXPLORER")),
      mempool: clean(env("ZCU_MEMPOOL")),
    };
  },
);
