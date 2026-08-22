// Client-safe shapes shared by the top-up server functions and the wizard.

export interface BankSummary {
  institution: string | null;
  accountName: string;
  mask: string;
  subtype: string;
  routingLast4: string;
  availableBalance: number | null;
  currency: string;
  holderNames: string[];
  /** Opaque, server-sealed record: access token + full ACH numbers. Never readable on device. */
  sealedRef: string;
  linkedAt: number;
}

export type GateStatus = "pass" | "warn" | "fail";

export interface GateCheck {
  id: string;
  label: string;
  status: GateStatus;
  detail: string;
}

export interface TopUpConfidence {
  ok: boolean;
  checks: GateCheck[];
  signalDecision: "allow" | "review" | "decline" | "unavailable";
}

export interface TopUpOrderRecord {
  id: string;
  createdAt: number;
  status: "pending_review" | "submitted" | "declined";
  usd: number;
  feeUsd: number;
  totalDebitUsd: number;
  asset: string;
  destinationAddress: string;
  bank: {
    institution: string | null;
    accountName: string;
    mask: string;
    subtype: string;
    routingLast4: string;
    holderNames: string[];
    availableBalance: number | null;
  };
  confidence: TopUpConfidence;
  acceptedDisclaimers: string[];
  /** Sealed treasury payload — full ACH numbers, reopened server-side only. */
  treasuryRef: string;
}
