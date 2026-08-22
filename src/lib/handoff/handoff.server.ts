// Server-only: post a signed order to VectorPay's Beekeeper webhook. VectorPay
// returns the checkout_url the customer is redirected to (they own KYC, Plaid,
// bank verification, risk gating and settlement).
//
// Contract (from VectorPay):
//   POST <VECTORPAY_ORDER_WEBHOOK_URL>
//   X-Beekeeper-Signature: sha256=<hex HMAC-SHA256 of the exact raw JSON body>
//   X-Partner-Name: Beekeeper
//   keyed with BEEKEEPER_WEBHOOK_SECRET
//   201 new order / 200 idempotent replay on the same `reference`.
import { env } from "@/lib/server-env";

export interface BeekeeperOrderPayload {
  side: "buy" | "sell";
  /** Our order id — VectorPay's idempotency key. */
  reference: string;
  account_ref: string;
  customer_name: string;
  customer_email: string;
  asset: string;
  chain: string;
  destination_address?: string;
  usd_amount: string;
  asset_amount?: string;
  rate?: string;
  /** Beekeeper's service fee, taken out of usd_amount. */
  fee_bps?: number;
  fee_usd?: string;
  /** Where VectorPay sends the customer after checkout completes / is cancelled. */
  return_url?: string;
  cancel_url?: string;
}

const DEFAULT_WEBHOOK_URL = "https://vector-pay.com/api/public/beekeeper";

function webhookUrl(): string {
  return env("VECTORPAY_ORDER_WEBHOOK_URL") || DEFAULT_WEBHOOK_URL;
}

/** Shared HMAC key. Accepts either name the secret may be stored under. */
function webhookSecret(): string | undefined {
  const raw = env("BEEKEEPER_WEBHOOK_SECRET") || env("VECTORPAY_WEBHOOK");
  return raw ? raw.trim() : undefined;
}

export function handoffConfigured(): boolean {
  return Boolean(webhookUrl() && webhookSecret());
}

export function cashoutDepositAddress(chain: string): string | null {
  const raw = env("CASHOUT_DEPOSIT_ADDRESSES");
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    const addr = map[chain];
    return typeof addr === "string" && addr.length > 0 ? addr : null;
  } catch {
    return null;
  }
}


export async function sign(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

export interface RelayResult {
  ok: boolean;
  detail: string;
  checkoutUrl: string | null;
}

/** Sends the order and returns VectorPay's checkout URL when accepted. */
export async function postOrder(payload: BeekeeperOrderPayload): Promise<RelayResult> {
  const url = webhookUrl();
  const secret = webhookSecret();
  if (!url || !secret)
    return { ok: false, detail: "Order relay isn't configured yet.", checkoutUrl: null };

  // Sign the EXACT bytes we send.
  const body = JSON.stringify(payload);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beekeeper-signature": await sign(body, secret),
        "x-partner-name": "Beekeeper",
      },
      body,
    });
  } catch (e) {
    console.error("[handoff] order relay unreachable", e);
    return { ok: false, detail: "Could not reach the order system.", checkoutUrl: null };
  }

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    console.error("[handoff] order rejected", res.status, text.slice(0, 400));
    const detail =
      res.status === 401
        ? "Order signature rejected."
        : res.status === 503
          ? "The order system isn't accepting orders yet."
          : `Order was rejected (HTTP ${res.status}).`;
    return { ok: false, detail, checkoutUrl: null };
  }

  let checkoutUrl: string | null = null;
  try {
    const json = JSON.parse(text) as { checkout_url?: string };
    if (typeof json.checkout_url === "string" && /^https?:\/\//.test(json.checkout_url)) {
      checkoutUrl = json.checkout_url;
    }
  } catch {
    /* fall through — order accepted but no usable checkout URL */
  }

  return {
    ok: true,
    detail: checkoutUrl
      ? res.status === 200
        ? "Order already on file."
        : "Order recorded."
      : "Order recorded, but no checkout link was returned.",
    checkoutUrl,
  };
}

