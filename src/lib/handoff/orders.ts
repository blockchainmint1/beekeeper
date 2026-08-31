// Client-safe model for the VectorPay handoff.
//
// Beekeeper no longer runs bank linking, balance checks, or ACH itself. We only
// start a basic order (side, amount, asset, destination) and hand the customer
// off to VectorPay, who owns KYC, Plaid, ACH, pricing and settlement.

import type { ChainId } from "@/lib/chains";
import { getVaultFingerprint } from "@/lib/wallet/seed";

export type OrderSide = "buy" | "sell";

export const ORDER_MIN_USD = 25;
export const ORDER_MAX_USD = 1000;
/** Service fee on the fiat amount, in basis points (1%). Discounts live on VectorPay. */
export const ORDER_FEE_BPS = 100;

export const TRADE_DESK_URL = "https://honest.money/trade-desk";

/** Assets a buy (top-up) can be delivered in. Stablecoins only. */
export const BUY_ASSETS: { chain: ChainId; label: string; ticker: string }[] = [
  { chain: "txc", label: "TSD on TEXITcoin", ticker: "TSD" },
  { chain: "base", label: "USDC on Base", ticker: "USDC" },
];

/** Assets VectorPay buys back from you. */
export const SELL_ASSETS: { chain: ChainId; label: string; ticker: string }[] = [
  { chain: "txc", label: "TSD on TEXITcoin", ticker: "TSD" },
  { chain: "base", label: "USDC on Base", ticker: "USDC" },
];

export function assetsFor(side: OrderSide) {
  return side === "buy" ? BUY_ASSETS : SELL_ASSETS;
}

export const SUGGESTED_USD = [50, 100, 250, 1000];

export interface OrderQuote {
  usd: number;
  feeUsd: number;
  /** Buy: what the bank is debited (order + fee). Sell: what lands in the bank. */
  settlementUsd: number;
  /** Units of the stablecoin delivered (buy) or sold (sell), 1:1 pegged. */
  assetAmount: number;
}

export function quoteOrder(side: OrderSide, usd: number): OrderQuote {
  const feeUsd = Math.round(usd * (ORDER_FEE_BPS / 10_000) * 100) / 100;
  // The fee rides on top: a buyer receives the full ordered quantity and the bank
  // moves order + fee. A seller sends the full quantity and banks net of fee.
  const settlementUsd =
    side === "buy"
      ? Math.round((usd + feeUsd) * 100) / 100
      : Math.max(0, Math.round((usd - feeUsd) * 100) / 100);
  return { usd, feeUsd, settlementUsd, assetAmount: Math.round(usd * 100) / 100 };
}



export function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Checked individually; the accepted set travels with the order. */
export const HANDOFF_DISCLAIMERS: { id: string; text: string }[] = [
  {
    id: "partner_of_record",
    text:
      "My order is fulfilled by VectorPay, the licensed onramp/offramp partner and seller or buyer of " +
      "record. Beekeeper is software that starts the order and delivers to my self-custodied address.",
  },
  {
    id: "partner_kyc",
    text:
      "I will complete identity verification and bank linking on VectorPay, and my name, email, bank " +
      "details and order may be used for sanctions and anti–money-laundering screening.",
  },
  {
    id: "pricing",
    text:
      "Pricing is set when funds clear, not on this screen. The amounts shown here are estimates and may " +
      "change. Beekeeper's service fee is 1% of the order.",
  },
  {
    id: "settlement_window",
    text: "Bank settlement takes 1–3 business days. Crypto is delivered, or dollars sent, after funds clear.",
  },
  {
    id: "irreversible",
    text:
      "Blockchain transactions are final. Beekeeper cannot reverse, recall, or refund a delivered " +
      "transaction, and cannot recover funds sent to a wrong address.",
  },
  {
    id: "self_custody",
    text:
      "I hold my own keys. Beekeeper never holds my crypto and cannot restore my wallet if I lose my " +
      "recovery phrase.",
  },
  {
    id: "no_advice",
    text:
      "This is not investment advice. Crypto is volatile, is not FDIC- or SIPC-insured, and I could lose " +
      "the entire amount.",
  },
  { id: "terms", text: "I have read and accept the Beekeeper Terms of Service and Privacy Policy." },
];

export interface HandoffOrder {
  id: string;
  createdAt: number;
  side: OrderSide;
  status: "pending" | "handed_off";
  usd: number;
  feeUsd: number;
  settlementUsd: number;
  asset: string;
  chain: string;
  address: string | null;
  email: string;
  name: string;
  handoffUrl: string | null;
  /** True when the signed order was accepted by VectorPay. */
  registered: boolean;
}

const KEY = "beekeeper-handoff-orders-v1";
type Store = Record<string, HandoffOrder[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

export function listHandoffOrders(side?: OrderSide): HandoffOrder[] {
  const fp = getVaultFingerprint();
  if (!fp) return [];
  return (read()[fp] ?? [])
    .filter((o) => !side || o.side === side)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function saveHandoffOrder(order: HandoffOrder): void {
  const fp = getVaultFingerprint();
  if (!fp) return;
  const store = read();
  store[fp] = [order, ...(store[fp] ?? []).filter((o) => o.id !== order.id)].slice(0, 50);
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}
