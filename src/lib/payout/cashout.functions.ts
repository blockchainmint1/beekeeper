// Server functions for the cash-out (sell crypto → ACH credit) flow. Thin wrappers only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BankSummary, CashOutOrderRecord } from "./types";
import {
  cashOutAvailable,
  createCashOutOrder,
  reportCashOutTransfer,
  verifyPayoutBank,
} from "./cashout.server";

export const cashOutStatus = createServerFn({ method: "GET" }).handler(async () => cashOutAvailable());

export const verifyPayoutBankFn = createServerFn({ method: "POST" })
  .inputValidator((i: { publicToken: string; accountId?: string }) =>
    z
      .object({
        publicToken: z.string().trim().min(10).max(400),
        accountId: z.string().trim().max(128).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<BankSummary> => verifyPayoutBank(data.publicToken, data.accountId));

export const submitCashOutOrder = createServerFn({ method: "POST" })
  .inputValidator((i: {
    sealedRef: string;
    chainId: string;
    asset: string;
    cryptoAmount: string;
    grossUsd: number;
    acceptedDisclaimers: string[];
    refundAddress: string;
    isFirstOrder: boolean;
  }) =>
    z
      .object({
        sealedRef: z.string().min(20).max(8000),
        chainId: z.string().trim().min(2).max(24),
        asset: z.string().trim().min(2).max(24),
        cryptoAmount: z.string().trim().min(1).max(40),
        grossUsd: z.number().positive().max(1000),
        acceptedDisclaimers: z.array(z.string().max(64)).max(40),
        refundAddress: z.string().trim().min(20).max(120),
        isFirstOrder: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<CashOutOrderRecord> => createCashOutOrder(data));

export const reportCashOutTx = createServerFn({ method: "POST" })
  .inputValidator((i: { treasuryRef: string; txid: string }) =>
    z
      .object({
        treasuryRef: z.string().min(20).max(8000),
        txid: z.string().trim().min(6).max(120),
      })
      .parse(i),
  )
  .handler(async ({ data }) => reportCashOutTransfer(data));
