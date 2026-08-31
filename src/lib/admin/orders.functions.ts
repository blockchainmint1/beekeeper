// Thin server-function wrapper for the admin order console.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminOrders, adminRefreshOrder, type AdminOrdersView, type AdminOrderActionResult } from "./orders.server";

export const fetchAdminOrders = createServerFn({ method: "POST" })
  .inputValidator((i: { key: string; kind?: "buy" | "sell"; status?: string; accountRef?: string }) =>
    z
      .object({
        key: z.string().trim().min(8).max(256),
        kind: z.enum(["buy", "sell"]).optional(),
        status: z.string().trim().max(40).optional(),
        accountRef: z.string().trim().max(256).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<AdminOrdersView> => adminOrders(data));

export const refreshAdminOrder = createServerFn({ method: "POST" })
  .inputValidator((i: { key: string; partnerOrderId: string }) =>
    z
      .object({
        key: z.string().trim().min(8).max(256),
        partnerOrderId: z.string().trim().min(1).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<AdminOrderActionResult> => adminRefreshOrder(data));
