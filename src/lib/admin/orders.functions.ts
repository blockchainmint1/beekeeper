// Thin server-function wrapper for the admin order console.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminOrders, type AdminOrdersView } from "./orders.server";

export const fetchAdminOrders = createServerFn({ method: "POST" })
  .inputValidator((i: { key: string; kind?: "buy" | "sell"; status?: string }) =>
    z
      .object({
        key: z.string().trim().min(8).max(256),
        kind: z.enum(["buy", "sell"]).optional(),
        status: z.string().trim().max(40).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<AdminOrdersView> => adminOrders(data));
