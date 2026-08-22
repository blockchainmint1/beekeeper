// Server-only: post a signed order to VectorPay's Beekeeper webhook and build
// the customer handoff URL.
//
// Contract (from VectorPay):
//   POST <VECTORPAY_ORDER_WEBHOOK_URL>
//   X-Beekeeper-Signature: sha256=<hex HMAC-SHA256 of the exact raw JSON body>
//   keyed with BEEKEEPER_WEBHOOK_SECRET
// Re-posting the same order_id updates the existing row (pending -> completed).
import { createHmac } from "node:crypto";
import { env } from "@/lib/server-env";

export interface BeekeeperOrderPayload {
  side: "buy" | "sell";
  order_id: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  merchant_name: string;
  merchant_email: string;
  asset: string;
  asset_amount: string;
  usd_amount: string;
  rate?: string;
  fee_usd: string;
  occurred_at: string;
  notes?: string;
}

function webhookUrl(): string | undefined {
  return env("VECTORPAY_ORDER_WEBHOOK_URL");
}

export function handoffConfigured(): boolean {
  return Boolean(webhookUrl() && env("BEEKEEPER_WEBHOOK_SECRET"));
}

export function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** Sends the order. Returns whether VectorPay accepted it plus any detail. */
export async function postOrder(
  payload: BeekeeperOrderPayload,
): Promise<{ ok: boolean; detail: string }> {
  const url = webhookUrl();
  const secret = env("BEEKEEPER_WEBHOOK_SECRET");
  if (!url || !secret) return { ok: false, detail: "Order relay isn't configured yet." };

  // Sign the EXACT bytes we send.
  const body = JSON.stringify(payload);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beekeeper-signature": sign(body, secret),
      },
      body,
    });
  } catch (e) {
    console.error("[handoff] order relay unreachable", e);
    return { ok: false, detail: "Could not reach the order system." };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[handoff] order rejected", res.status, text.slice(0, 400));
    const detail =
      res.status === 401
        ? "Order signature rejected."
        : res.status === 503
          ? "The order system isn't accepting orders yet."
          : `Order was rejected (HTTP ${res.status}).`;
    return { ok: false, detail };
  }
  return { ok: true, detail: "Order recorded." };
}

/**
 * Where the customer finishes: VectorPay collects identity, bank link (Plaid)
 * and payment. We only pass the order reference and contact hints.
 */
export function buildHandoffUrl(params: {
  orderId: string;
  side: "buy" | "sell";
  usd: number;
  asset: string;
  email: string;
  address: string | null;
}): string | null {
  const base = env("VECTORPAY_CHECKOUT_URL");
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("order_id", params.orderId);
  url.searchParams.set("side", params.side);
  url.searchParams.set("usd", params.usd.toFixed(2));
  url.searchParams.set("asset", params.asset);
  url.searchParams.set("email", params.email);
  if (params.address) url.searchParams.set("address", params.address);
  url.searchParams.set("source", "beekeeper");
  return url.toString();
}
