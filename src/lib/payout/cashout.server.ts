// Server-only orchestration for cash-outs (sell crypto → ACH credit).
//
// Bank verification reuses the Plaid client from the top-up flow. The only extra
// server state is the settlement deposit address per chain, which comes from the
// CASHOUT_DEPOSIT_ADDRESSES secret (JSON map of chain id → address).
import { randomUUID } from "node:crypto";
import { plaidConfigured, seal } from "@/lib/topup/plaid.server";
import { verifyBank } from "@/lib/topup/plaid.orchestrator.server";
import type { BankSummary, CashOutOrderRecord, GateCheck } from "./types";
import {
  CASHOUT_FIRST_ORDER_MAX_USD,
  CASHOUT_MAX_USD,
  CASHOUT_MIN_USD,
  quoteCashOut,
} from "./cashout";
import { env } from "@/lib/server-env";

interface SealedBank {
  accessToken: string;
  itemId: string;
  accountId: string;
  account: string;
  routing: string;
  institution: string | null;
  accountName: string;
  mask: string;
  subtype: string;
  holderNames: string[];
}

function depositAddresses(): Record<string, string> {
  const raw = env("CASHOUT_DEPOSIT_ADDRESSES");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) out[k.toLowerCase()] = v.trim();
    }
    return out;
  } catch {
    console.error("[cashout] CASHOUT_DEPOSIT_ADDRESSES is not valid JSON");
    return {};
  }
}

export function cashOutAvailable(): {
  available: boolean;
  env: string;
  chains: string[];
} {
  const chains = Object.keys(depositAddresses());
  return {
    available:
      plaidConfigured() && Boolean(env("TOPUP_RECORD_SECRET")) && chains.length > 0,
    env: (env("PLAID_ENV") || "sandbox").toLowerCase(),
    chains,
  };
}

/** Payout account verification: same Plaid checks as a debit, different direction. */
export function verifyPayoutBank(publicToken: string, accountId?: string): Promise<BankSummary> {
  return verifyBank(publicToken, accountId);
}

export async function createCashOutOrder(input: {
  sealedRef: string;
  chainId: string;
  asset: string;
  cryptoAmount: string;
  grossUsd: number;
  acceptedDisclaimers: string[];
  refundAddress: string;
  isFirstOrder: boolean;
}): Promise<CashOutOrderRecord> {
  const { unseal } = await import("@/lib/topup/plaid.server");
  let bank: SealedBank;
  try {
    bank = unseal<SealedBank>(input.sealedRef);
  } catch {
    throw new Error("Your bank link expired. Please link the account again.");
  }

  const address = depositAddresses()[input.chainId.toLowerCase()];
  if (!address) {
    throw new Error(
      `Cash-outs aren't open for ${input.asset} yet. Pick another asset or contact the trade desk.`,
    );
  }

  const cap = input.isFirstOrder ? CASHOUT_FIRST_ORDER_MAX_USD : CASHOUT_MAX_USD;
  if (input.grossUsd < CASHOUT_MIN_USD || input.grossUsd > cap) {
    throw new Error(
      input.grossUsd > cap
        ? `Cash-outs are capped at $${cap} per order. Contact the trade desk for more.`
        : `Cash-outs must be at least $${CASHOUT_MIN_USD}.`,
    );
  }

  const quote = quoteCashOut(input.grossUsd);
  const orderId = randomUUID();
  const reference = `CO-${orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  const checks: GateCheck[] = [
    {
      id: "amount",
      label: "Order within limits",
      status: "pass",
      detail: `~$${quote.grossUsd.toFixed(2)} gross, under the $${cap} cap.`,
    },
    {
      id: "account_type",
      label: "ACH-creditable account",
      status: ["checking", "savings"].includes(bank.subtype) ? "pass" : "warn",
      detail: `${bank.subtype || "unknown"} •••• ${bank.mask}, routing •••• ${bank.routing.slice(-4)}`,
    },
    {
      id: "identity",
      label: "Account ownership",
      status: bank.holderNames.length > 0 ? "pass" : "warn",
      detail:
        bank.holderNames.length > 0
          ? `Held by ${bank.holderNames.join(", ")}.`
          : "Your bank didn't share an account holder name. Manual name match required.",
    },
    {
      id: "disclaimers",
      label: "Authorizations accepted",
      status: input.acceptedDisclaimers.length > 0 ? "pass" : "fail",
      detail: `${input.acceptedDisclaimers.length} acknowledgements recorded.`,
    },
    {
      id: "settlement",
      label: "Settlement address issued",
      status: "pass",
      detail: `Send ${input.cryptoAmount} ${input.asset} on ${input.chainId.toUpperCase()} only.`,
    },
  ];

  const failed = checks.filter((c) => c.status === "fail");
  if (failed.length > 0) throw new Error(failed.map((f) => f.detail).join(" "));

  const record: CashOutOrderRecord = {
    id: orderId,
    createdAt: Date.now(),
    status: "awaiting_transfer",
    asset: input.asset,
    chainId: input.chainId,
    cryptoAmount: input.cryptoAmount,
    grossUsd: quote.grossUsd,
    feeUsd: quote.feeUsd,
    netUsd: quote.netUsd,
    depositAddress: address,
    reference,
    bank: {
      institution: bank.institution,
      accountName: bank.accountName,
      mask: bank.mask,
      subtype: bank.subtype,
      routingLast4: bank.routing.slice(-4),
      holderNames: bank.holderNames,
    },
    checks,
    acceptedDisclaimers: input.acceptedDisclaimers,
    treasuryRef: seal({
      orderId,
      reference,
      direction: "payout",
      accessToken: bank.accessToken,
      itemId: bank.itemId,
      accountId: bank.accountId,
      account: bank.account,
      routing: bank.routing,
      holderNames: bank.holderNames,
      asset: input.asset,
      chainId: input.chainId,
      cryptoAmount: input.cryptoAmount,
      depositAddress: address,
      refundAddress: input.refundAddress,
      grossUsd: quote.grossUsd,
      feeUsd: quote.feeUsd,
      netUsd: quote.netUsd,
      acceptedDisclaimers: input.acceptedDisclaimers,
      acceptedAt: Date.now(),
    }),
  };

  // Treasury queue: logged server-side until the settlement partner API is live.
  console.info(
    `[cashout] order ${reference} sell ${input.cryptoAmount} ${input.asset} (${input.chainId}) ` +
      `→ pay $${quote.netUsd.toFixed(2)} to ${bank.institution ?? "?"} ••••${bank.mask}`,
  );

  return record;
}

/** Customer reports the on-chain transfer so treasury can match it to the order. */
export async function reportCashOutTransfer(input: {
  treasuryRef: string;
  txid: string;
}): Promise<{ ok: true; reference: string }> {
  const { unseal } = await import("@/lib/topup/plaid.server");
  let payload: { reference?: string; asset?: string; cryptoAmount?: string };
  try {
    payload = unseal<{ reference?: string; asset?: string; cryptoAmount?: string }>(input.treasuryRef);
  } catch {
    throw new Error("We couldn't match that order. Contact support with your reference code.");
  }
  console.info(
    `[cashout] transfer reported for ${payload.reference ?? "?"}: ${input.txid} ` +
      `(${payload.cryptoAmount ?? "?"} ${payload.asset ?? "?"})`,
  );
  return { ok: true, reference: payload.reference ?? "" };
}
