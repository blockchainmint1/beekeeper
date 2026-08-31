// Server-only VectorPay adapter.
//
// VectorPay is the system of record for onramp/offramp orders: they originate the
// ACH, sell/buy the crypto, and own the order lifecycle. Beekeeper only presents
// the order, records the authorizations, and mirrors the partner's status.
//
// Everything here degrades gracefully: if VectorPay isn't configured, the local
// flow still works and orders stay in "local" mode (sealed treasury records only).
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/server-env";

export interface VectorPayOrder {
  id: string;
  reference: string | null;
  externalId: string | null;
  kind: "buy" | "sell";
  status: string;
  asset: string;
  chain: string | null;
  usd: number;
  feeUsd: number | null;
  netUsd: number | null;
  cryptoAmount: string | null;
  destinationAddress: string | null;
  depositAddress: string | null;
  txid: string | null;
  bankMask: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function base(): string | undefined {
  const b = env("VECTORPAY_API_BASE");
  return b ? b.replace(/\/+$/, "") : undefined;
}

export function vectorPayConfigured(): boolean {
  return Boolean(base() && env("VECTORPAY_API_KEY"));
}

async function vp<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const b = base();
  const key = env("VECTORPAY_API_KEY");
  if (!b || !key) throw new Error("VectorPay isn't configured.");

  const url = new URL(`${b}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "x-vectorpay-source": "beekeeper",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error("Couldn't reach the order partner. Try again in a moment.");
  }
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("The order partner returned an unexpected response.");
  }
  if (!res.ok) {
    const e = json as { message?: string; error?: string; detail?: string };
    console.error(`[vectorpay] ${path} ${res.status}: ${e.error ?? e.message ?? e.detail ?? text.slice(0, 300)}`);
    throw new Error(e.message || e.error || e.detail || "The order partner rejected this order.");
  }
  return json as T;
}

function normalize(raw: Record<string, unknown>, fallbackKind: "buy" | "sell"): VectorPayOrder {
  const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const kind = (s(raw["kind"]) as "buy" | "sell") ?? fallbackKind;
  return {
    id: s(raw["id"]) ?? s(raw["order_id"]) ?? "",
    reference: s(raw["reference"]),
    externalId: s(raw["external_id"]) ?? s(raw["externalId"]),
    kind,
    status: s(raw["status"]) ?? "pending",
    asset: s(raw["asset"]) ?? "",
    chain: s(raw["chain"]),
    usd: n(raw["usd"]) ?? n(raw["amount_usd"]) ?? 0,
    feeUsd: n(raw["fee_usd"]) ?? n(raw["feeUsd"]),
    netUsd: n(raw["net_usd"]) ?? n(raw["netUsd"]),
    cryptoAmount: s(raw["crypto_amount"]) ?? s(raw["cryptoAmount"]),
    destinationAddress: s(raw["destination_address"]) ?? s(raw["destinationAddress"]),
    depositAddress: s(raw["deposit_address"]) ?? s(raw["depositAddress"]),
    txid: s(raw["txid"]) ?? s(raw["tx_id"]) ?? s(raw["transaction_id"]),
    bankMask: s(raw["bank_mask"]) ?? s(raw["bankMask"]),
    createdAt: s(raw["created_at"]) ?? s(raw["createdAt"]),
    updatedAt: s(raw["updated_at"]) ?? s(raw["updatedAt"]),
  };
}

/**
 * Fee in basis points for this buyer. VectorPay owns per-account discount tiers;
 * VECTORPAY_FEE_OVERRIDES (JSON: accountRef → bps) is a local escape hatch.
 */
export async function resolveFeeBps(accountRef: string, fallbackBps: number): Promise<number> {
  const raw = env("VECTORPAY_FEE_OVERRIDES");
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, number>;
      const hit = map[accountRef];
      if (typeof hit === "number" && hit >= 0 && hit <= 1000) return Math.round(hit);
    } catch {
      console.error("[vectorpay] VECTORPAY_FEE_OVERRIDES is not valid JSON");
    }
  }
  if (!vectorPayConfigured()) return fallbackBps;
  try {
    const r = await vp<{ fee_bps?: number; feeBps?: number }>(
      `/v1/accounts/${encodeURIComponent(accountRef)}/fees`,
    );
    const bps = typeof r.fee_bps === "number" ? r.fee_bps : typeof r.feeBps === "number" ? r.feeBps : null;
    if (bps !== null && bps >= 0 && bps <= 1000) return Math.round(bps);
  } catch {
    /* partner unreachable — standard pricing */
  }
  return fallbackBps;
}

export async function createBuyOrder(input: {
  externalId: string;
  accountRef: string;
  usd: number;
  feeUsd: number;
  totalDebitUsd: number;
  asset: string;
  chain: string;
  destinationAddress: string;
  bank: { institution: string | null; mask: string; routingLast4: string; holderNames: string[] };
  acceptedDisclaimers: string[];
  riskDecision: string;
}): Promise<VectorPayOrder | null> {
  if (!vectorPayConfigured()) return null;
  const raw = await vp<Record<string, unknown>>("/v1/orders/buy", {
    method: "POST",
    body: {
      external_id: input.externalId,
      account_ref: input.accountRef,
      amount_usd: input.usd,
      fee_usd: input.feeUsd,
      debit_usd: input.totalDebitUsd,
      asset: input.asset,
      chain: input.chain,
      destination_address: input.destinationAddress,
      bank: {
        institution: input.bank.institution,
        mask: input.bank.mask,
        routing_last4: input.bank.routingLast4,
        holder_names: input.bank.holderNames,
      },
      accepted_disclaimers: input.acceptedDisclaimers,
      risk_decision: input.riskDecision,
    },
  });
  return normalize(raw, "buy");
}

export async function createSellOrder(input: {
  externalId: string;
  accountRef: string;
  reference: string;
  asset: string;
  chain: string;
  cryptoAmount: string;
  grossUsd: number;
  feeUsd: number;
  netUsd: number;
  depositAddress: string;
  refundAddress: string;
  bank: { institution: string | null; mask: string; routingLast4: string; holderNames: string[] };
  acceptedDisclaimers: string[];
}): Promise<VectorPayOrder | null> {
  if (!vectorPayConfigured()) return null;
  const raw = await vp<Record<string, unknown>>("/v1/orders/sell", {
    method: "POST",
    body: {
      external_id: input.externalId,
      account_ref: input.accountRef,
      reference: input.reference,
      asset: input.asset,
      chain: input.chain,
      crypto_amount: input.cryptoAmount,
      gross_usd: input.grossUsd,
      fee_usd: input.feeUsd,
      net_usd: input.netUsd,
      deposit_address: input.depositAddress,
      refund_address: input.refundAddress,
      bank: {
        institution: input.bank.institution,
        mask: input.bank.mask,
        routing_last4: input.bank.routingLast4,
        holder_names: input.bank.holderNames,
      },
      accepted_disclaimers: input.acceptedDisclaimers,
    },
  });
  return normalize(raw, "sell");
}

/** Bind the customer's on-chain transfer to an existing sell order. */
export async function reportSellTransfer(
  partnerOrderId: string,
  txid: string,
): Promise<VectorPayOrder | null> {
  if (!vectorPayConfigured()) return null;
  const raw = await vp<Record<string, unknown>>(
    `/v1/orders/sell/${encodeURIComponent(partnerOrderId)}/transfer`,
    { method: "POST", body: { txid } },
  );
  return normalize(raw, "sell");
}

export async function getOrder(partnerOrderId: string): Promise<VectorPayOrder | null> {
  if (!vectorPayConfigured()) return null;
  const raw = await vp<Record<string, unknown>>(`/v1/orders/${encodeURIComponent(partnerOrderId)}`);
  return normalize(raw, "buy");
}

export async function syncOrderStatus(partnerOrderId: string): Promise<VectorPayOrder | null> {
  return getOrder(partnerOrderId);
}

export async function listOrders(query: {
  kind?: "buy" | "sell";
  status?: string;
  accountRef?: string;
  limit?: number;
}): Promise<{ orders: VectorPayOrder[]; configured: boolean }> {
  if (!vectorPayConfigured()) return { orders: [], configured: false };
  const r = await vp<{ orders?: Record<string, unknown>[]; data?: Record<string, unknown>[] }>(
    "/v1/orders",
    {
      query: {
        kind: query.kind,
        status: query.status,
        account_ref: query.accountRef,
        limit: String(Math.min(Math.max(query.limit ?? 50, 1), 200)),
      },
    },
  );
  const rows = r.orders ?? r.data ?? [];
  return { orders: rows.map((row) => normalize(row, "buy")), configured: true };
}

/** HMAC-SHA256 over the raw body, hex digest, as sent in x-vectorpay-signature. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = env("VECTORPAY_WEBHOOK_SECRET");
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature.replace(/^sha256=/, ""), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface VectorPayWebhookEvent {
  event_id: string;
  type: string;
  created_at: string;
  order?: VectorPayOrder;
}

export function parseWebhookEvent(body: string): VectorPayWebhookEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const orderRaw = p["order"] as Record<string, unknown> | undefined;
  const kind = (orderRaw?.["kind"] as "buy" | "sell") ?? "buy";
  return {
    event_id: typeof p["event_id"] === "string" ? p["event_id"] : "",
    type: typeof p["type"] === "string" ? p["type"] : "",
    created_at: typeof p["created_at"] === "string" ? p["created_at"] : new Date().toISOString(),
    order: orderRaw ? normalize(orderRaw, kind) : undefined,
  };
}
