// Public server function exposing admin feature flags.
// No authentication required — these are read-only kill-switches used by the UI.
import { createServerFn } from "@tanstack/react-start";
import { getAdminFeatureFlags } from "./features.server";

export const getAdminFeatureStatus = createServerFn({ method: "GET" }).handler(async () => {
  return getAdminFeatureFlags();
});
