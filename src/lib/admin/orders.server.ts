// Server-only admin console backing logic. Read-only: VectorPay is the system of
// record, we just mirror its order list for the treasury/ops view.
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/server-env";
import {
  listOrders,
  syncOrderStatus,
  vectorPayConfigured,
  type VectorPayOrder,
} from "@/lib/vectorpay/client.server";
import { ORDER_FEE_BPS as TOPUP_FEE_BPS } from "@/lib/handoff/orders";

export function assertAdmin(key: string): void {
  const expected = env("ADMIN_CONSOLE_KEY");
  if (!expected) throw new Error("The admin console isn't configured yet.");
  const a = createHash("sha256").update(key).digest();
  const b = createHash("sha256").update(expected).digest();
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Wrong admin key.");
}

export interface AdminOrdersView {
  partnerConfigured: boolean;
  standardFeeBps: number;
  feeOverrides: { accountRef: string; bps: number }[];
  orders: VectorPayOrder[];
  note: string | null;
}

export interface AdminOrderActionResult {
  ok: boolean;
  order: VectorPayOrder | null;
  error: string | null;
}

export async function adminOrders(input: {
  key: string;
  kind?: "buy" | "sell";
  status?: string;
  accountRef?: string;
}): Promise<AdminOrdersView> {
  assertAdmin(input.key);

  const overrides: { accountRef: string; bps: number }[] = [];
  const raw = env("VECTORPAY_FEE_OVERRIDES");
  if (raw) {
    try {
      for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, number>)) {
        if (typeof v === "number") overrides.push({ accountRef: k, bps: Math.round(v) });
      }
    } catch {
      /* surfaced as a note below */
    }
  }

  let orders: VectorPayOrder[] = [];
  let note: string | null = null;
  if (!vectorPayConfigured()) {
    note =
      "VectorPay isn't connected yet, so there are no partner orders to show. Orders placed now are sealed locally and logged server-side.";
  } else {
    try {
      const r = await listOrders({
        kind: input.kind,
        status: input.status,
        accountRef: input.accountRef,
        limit: 100,
      });
      orders = r.orders;
    } catch (e) {
      note = e instanceof Error ? e.message : "Couldn't load orders from the partner.";
    }
  }

  return {
    partnerConfigured: vectorPayConfigured(),
    standardFeeBps: TOPUP_FEE_BPS,
    feeOverrides: overrides,
    orders,
    note,
  };
}

export async function adminRefreshOrder(input: {
  key: string;
  partnerOrderId: string;
}): Promise<AdminOrderActionResult> {
  assertAdmin(input.key);
  if (!vectorPayConfigured()) {
    return { ok: false, order: null, error: "VectorPay isn't connected." };
  }
  try {
    const order = await syncOrderStatus(input.partnerOrderId);
    return { ok: Boolean(order), order, error: order ? null : "Order not found." };
  } catch (e) {
    return { ok: false, order: null, error: e instanceof Error ? e.message : "Refresh failed." };
  }
}
