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
    const { postOrder, buildHandoffUrl } = await import("./handoff.server");

    const feeUsd = Math.round(data.usd * 0.01 * 100) / 100;
    const orderId = `BK-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;

    const relay = await postOrder({
      side: data.side,
      order_id: orderId,
      status: "pending",
      merchant_name: data.name,
      merchant_email: data.email,
      asset: data.asset,
      asset_amount: data.assetAmount ?? data.usd.toFixed(2),
      usd_amount: data.usd.toFixed(2),
      fee_usd: feeUsd.toFixed(2),
      occurred_at: new Date().toISOString(),
      notes: [
        `chain=${data.chain}`,
        data.address ? `address=${data.address}` : null,
        `disclaimers=${data.acceptedDisclaimers.length}`,
      ]
        .filter(Boolean)
        .join(" "),
    });

    return {
      orderId,
      feeUsd,
      registered: relay.ok,
      detail: relay.detail,
      handoffUrl: buildHandoffUrl({
        orderId,
        side: data.side,
        usd: data.usd,
        asset: data.asset,
        email: data.email,
        address: data.address ?? null,
      }),
    };
  });
