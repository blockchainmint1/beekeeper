import { useQuery } from "@tanstack/react-query";
import { getAdminFeatureStatus } from "./features.functions";

const KEY = "beekeeper-admin-features-override-v1";

type LocalOverride = {
  topupDisabled?: boolean;
  cashoutDisabled?: boolean;
};

function readLocal(): LocalOverride {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LocalOverride;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeLocalOverride(next: LocalOverride): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage disabled */
  }
}

export interface AdminFeatureStatus {
  /** Globally disabled from the server-side env flag. */
  globalTopupDisabled: boolean;
  /** Globally disabled from the server-side env flag. */
  globalCashoutDisabled: boolean;
  /** Locally disabled from this browser's admin override. */
  localTopupDisabled: boolean;
  /** Locally disabled from this browser's admin override. */
  localCashoutDisabled: boolean;
  /** Effective value used by the UI (global OR local). */
  topupDisabled: boolean;
  /** Effective value used by the UI (global OR local). */
  cashoutDisabled: boolean;
}

export function useAdminFeatureStatus() {
  const query = useQuery({
    queryKey: ["admin-feature-status"],
    queryFn: () => getAdminFeatureStatus(),

    staleTime: 30_000,
  });

  const local = readLocal();
  const globalTopupDisabled = query.data?.topupDisabled ?? false;
  const globalCashoutDisabled = query.data?.cashoutDisabled ?? false;

  return {
    ...query,
    status: {
      globalTopupDisabled,
      globalCashoutDisabled,
      localTopupDisabled: local.topupDisabled ?? false,
      localCashoutDisabled: local.cashoutDisabled ?? false,
      topupDisabled: globalTopupDisabled || (local.topupDisabled ?? false),
      cashoutDisabled: globalCashoutDisabled || (local.cashoutDisabled ?? false),
    } satisfies AdminFeatureStatus,
  };
}
