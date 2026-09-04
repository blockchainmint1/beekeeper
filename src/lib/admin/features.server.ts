// Server-side admin feature flags. These are read from env/secrets so they
// can be changed without touching code. The worker reads them at request time,
// so a publish is required after updating secrets for changes to take effect.
import { env } from "@/lib/server-env";

export interface AdminFeatureFlags {
  /** Top-up (VectorPay onramp) button is disabled globally. */
  topupDisabled: boolean;
  /** Cash-out (VectorPay offramp) button is disabled globally. */
  cashoutDisabled: boolean;
}

export function getAdminFeatureFlags(): AdminFeatureFlags {
  return {
    topupDisabled: isTruthy(env("ADMIN_DISABLE_TOPUP")),
    cashoutDisabled: isTruthy(env("ADMIN_DISABLE_CASHOUT")),
  };
}

function isTruthy(v: string | undefined): boolean {
  if (!v) return false;
  const normalized = v.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}
