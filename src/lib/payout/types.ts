// Client-safe shapes shared by the cash-out server functions and the wizard.

import type { BankSummary, GateCheck } from "@/lib/topup/types";

export type { BankSummary, GateCheck };

export type CashOutStatus =
  | "awaiting_transfer"
  | "transfer_reported"
  | "paid"
  | "cancelled";

export interface CashOutOrderRecord {
  id: string;
  createdAt: number;
  status: CashOutStatus;
  /** Chain ticker the customer is selling. */
  asset: string;
  chainId: string;
  /** Amount of crypto to send, in whole units, as a string to avoid float drift. */
  cryptoAmount: string;
  /** Quote at order time — indicative only. */
  grossUsd: number;
  feeUsd: number;
  netUsd: number;
  /** Where the customer must send the crypto. */
  depositAddress: string;
  /** Short human reference; include it in support emails. */
  reference: string;
  /** Reported by the customer once they've broadcast the transfer. */
  txid?: string;
  txReportedAt?: number;
  bank: {
    institution: string | null;
    accountName: string;
    mask: string;
    subtype: string;
    routingLast4: string;
    holderNames: string[];
  };
  checks: GateCheck[];
  acceptedDisclaimers: string[];
  /** Mirror of the settlement partner's order, when VectorPay is connected. */
  partner: { orderId: string; status: string } | null;
  /** Sealed treasury payload — full ACH numbers, reopened server-side only. */
  treasuryRef: string;
}
