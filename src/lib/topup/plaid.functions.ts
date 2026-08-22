// Server functions for the ACH top-up flow. Thin wrappers only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BankSummary, TopUpOrderRecord } from "./types";
import { verifyBank, placeTopUpOrder, startBankLink, topUpAvailable } from "./plaid.orchestrator.server";

export const topUpStatus = createServerFn({ method: "GET" }).handler(async () => topUpAvailable());

export const createTopUpLinkToken = createServerFn({ method: "POST" })
  .inputValidator((i: { clientUserId: string; redirectUri?: string }) =>
    z
      .object({ clientUserId: z.string().trim().min(4).max(128), redirectUri: z.string().url().optional() })
      .parse(i),
  )
  .handler(async ({ data }) => startBankLink(data.clientUserId, data.redirectUri));

export const verifyTopUpBank = createServerFn({ method: "POST" })
  .inputValidator((i: { publicToken: string; accountId?: string }) =>
    z.object({ publicToken: z.string().trim().min(10).max(400), accountId: z.string().trim().max(128).optional() }).parse(i),
  )
  .handler(async ({ data }): Promise<BankSummary> => verifyBank(data.publicToken, data.accountId));

export const submitTopUpOrder = createServerFn({ method: "POST" })
  .inputValidator((i: {
    sealedRef: string;
    usd: number;
    asset: string;
    destinationAddress: string;
    acceptedDisclaimers: string[];
    isFirstOrder: boolean;
  }) =>
    z
      .object({
        sealedRef: z.string().min(20).max(8000),
        usd: z.number().positive().max(1000),
        asset: z.string().trim().min(2).max(24),
        destinationAddress: z.string().trim().min(20).max(120),
        acceptedDisclaimers: z.array(z.string().max(64)).max(40),
        isFirstOrder: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<TopUpOrderRecord> => placeTopUpOrder(data));
