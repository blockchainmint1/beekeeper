import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const startSchema = z.object({
  side: z.enum(["buy", "sell"]),
  usd: z.number().min(25).max(1000),
  asset: z.string().min(1).max(12),
  chain: z.string().min(1).max(16),
  assetAmount: z.string().max(32).optional(),
  address: z.string().max(120).nullable().optional(),
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  acceptedDisclaimers: z.array(z.string().max(64)).max(32),
});

export const handoffStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { handoffConfigured } = await import("./handoff.server");
  return { available: handoffConfigured() };
});

export const startHandoffOrder = createServerFn({ method: "POST" })
  .inputValidator((input) => startSchema.parse(input))
  .handler(async ({ data }) => {
    const { postOrder } = await import("./handoff.server");

    const feeUsd = Math.round(data.usd * 0.01 * 100) / 100;
    const orderId = `BK-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;

    const relay = await postOrder({
      side: data.side,
      reference: orderId,
      account_ref: data.email.toLowerCase(),
      customer_name: data.name,
      customer_email: data.email,
      asset: data.asset,
      chain: data.chain,
      ...(data.address ? { destination_address: data.address } : {}),
      usd_amount: data.usd.toFixed(2),
      ...(data.assetAmount ? { asset_amount: data.assetAmount } : {}),
    });

    return {
      orderId,
      feeUsd,
      registered: relay.ok,
      detail: relay.detail,
      handoffUrl: relay.checkoutUrl,
    };
  });

