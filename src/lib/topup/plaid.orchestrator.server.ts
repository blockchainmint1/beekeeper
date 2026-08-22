// Server-only orchestration for the ACH top-up: bank verification, the
// confidence gate, and the sealed treasury record that backs manual ACH entry.
import { randomUUID } from "node:crypto";
import {
  authGet,
  balanceGet,
  createLinkToken,
  exchangePublicToken,
  identityGet,
  institutionName,
  plaidConfigured,
  seal,
  signalEvaluate,
} from "./plaid.server";
import type { BankSummary, GateCheck, TopUpConfidence, TopUpOrderRecord } from "./types";
import {
  TOPUP_BALANCE_BUFFER_USD,
  TOPUP_FIRST_ORDER_MAX_USD,
  TOPUP_MAX_USD,
  TOPUP_MIN_USD,
  quoteTopUp,
} from "./packages";
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

export function topUpAvailable(): { available: boolean; env: string } {
  return {
    available: plaidConfigured() && Boolean(env("TOPUP_RECORD_SECRET")),
    env: (env("PLAID_ENV") || "sandbox").toLowerCase(),
  };
}

export async function startBankLink(clientUserId: string, redirectUri?: string) {
  const r = await createLinkToken(clientUserId, redirectUri);
  return { linkToken: r.link_token, expiration: r.expiration };
}

export async function verifyBank(publicToken: string, accountId?: string): Promise<BankSummary> {
  const { access_token: accessToken, item_id: itemId } = await exchangePublicToken(publicToken);
  const auth = await authGet(accessToken);

  const ach = accountId
    ? auth.numbers.ach.find((n) => n.account_id === accountId)
    : auth.numbers.ach[0];
  if (!ach) {
    throw new Error(
      "That account can't be debited by ACH. Pick a US checking or savings account and try again.",
    );
  }
  const account = auth.accounts.find((a) => a.account_id === ach.account_id);
  const subtype = (account?.subtype ?? "").toLowerCase();
  if (subtype && !["checking", "savings"].includes(subtype)) {
    throw new Error("Only checking or savings accounts can be used. Please pick another account.");
  }

  const [holderNames, institution] = await Promise.all([
    identityGet(accessToken, ach.account_id),
    institutionName(auth.item.institution_id),
  ]);

  const sealed: SealedBank = {
    accessToken,
    itemId,
    accountId: ach.account_id,
    account: ach.account,
    routing: ach.routing,
    institution,
    accountName: account?.official_name || account?.name || "Bank account",
    mask: account?.mask || ach.account.slice(-4),
    subtype: subtype || "checking",
    holderNames,
  };

  return {
    institution,
    accountName: sealed.accountName,
    mask: sealed.mask,
    subtype: sealed.subtype,
    routingLast4: ach.routing.slice(-4),
    availableBalance: account?.balances?.available ?? account?.balances?.current ?? null,
    currency: account?.balances?.iso_currency_code || "USD",
    holderNames,
    sealedRef: seal(sealed),
    linkedAt: Date.now(),
  };
}

export async function placeTopUpOrder(input: {
  sealedRef: string;
  usd: number;
  asset: string;
  destinationAddress: string;
  acceptedDisclaimers: string[];
  isFirstOrder: boolean;
}): Promise<TopUpOrderRecord> {
  const { unseal } = await import("./plaid.server");
  let bank: SealedBank;
  try {
    bank = unseal<SealedBank>(input.sealedRef);
  } catch {
    throw new Error("Your bank link expired. Please link the account again.");
  }

  const quote = quoteTopUp(input.usd);
  const checks: GateCheck[] = [];

  // Amount rules
  const cap = input.isFirstOrder ? TOPUP_FIRST_ORDER_MAX_USD : TOPUP_MAX_USD;
  if (input.usd < TOPUP_MIN_USD || input.usd > cap) {
    throw new Error(
      input.usd > cap
        ? `First orders are capped at $${TOPUP_FIRST_ORDER_MAX_USD}. Contact the trade desk for more.`
        : `Orders must be between $${TOPUP_MIN_USD} and $${TOPUP_MAX_USD}.`,
    );
  }
  checks.push({
    id: "amount",
    label: "Order within limits",
    status: "pass",
    detail: `$${quote.totalDebitUsd.toFixed(2)} total debit, under the $${cap} cap.`,
  });

  // Account type
  checks.push({
    id: "account_type",
    label: "ACH-debitable account",
    status: ["checking", "savings"].includes(bank.subtype) ? "pass" : "warn",
    detail: `${bank.subtype || "unknown"} •••• ${bank.mask}, routing •••• ${bank.routing.slice(-4)}`,
  });

  // Fresh balance at submit time (never the link-time snapshot)
  let available: number | null = null;
  try {
    const b = await balanceGet(bank.accessToken, bank.accountId);
    const a = b.accounts.find((x) => x.account_id === bank.accountId);
    available = a?.balances?.available ?? a?.balances?.current ?? null;
  } catch {
    available = null;
  }
  const needed = quote.totalDebitUsd + TOPUP_BALANCE_BUFFER_USD;
  if (available === null) {
    checks.push({
      id: "balance",
      label: "Sufficient funds",
      status: "warn",
      detail: "Your bank didn't return a live balance. The order goes to manual review.",
    });
  } else if (available < needed) {
    checks.push({
      id: "balance",
      label: "Sufficient funds",
      status: "fail",
      detail: `Available balance is below the $${needed.toFixed(2)} required (order + $${TOPUP_BALANCE_BUFFER_USD} buffer).`,
    });
  } else {
    checks.push({
      id: "balance",
      label: "Sufficient funds",
      status: "pass",
      detail: `Live balance covers the $${quote.totalDebitUsd.toFixed(2)} debit plus buffer.`,
    });
  }

  // Ownership
  checks.push({
    id: "identity",
    label: "Account ownership",
    status: bank.holderNames.length > 0 ? "pass" : "warn",
    detail:
      bank.holderNames.length > 0
        ? `Held by ${bank.holderNames.join(", ")}.`
        : "Your bank didn't share an account holder name. Manual name match required.",
  });

  // Return-risk scoring
  const orderId = randomUUID();
  const signal = await signalEvaluate({
    accessToken: bank.accessToken,
    accountId: bank.accountId,
    clientTransactionId: orderId.replace(/-/g, "").slice(0, 32),
    amount: quote.totalDebitUsd,
  });
  checks.push({
    id: "signal",
    label: "ACH return risk",
    status: signal.decision === "allow" ? "pass" : signal.decision === "decline" ? "fail" : "warn",
    detail:
      signal.decision === "unavailable"
        ? "Risk scoring unavailable — the order goes to manual review."
        : `Risk decision: ${signal.decision}${
            signal.scoreCustomerInitiated !== null ? ` (score ${signal.scoreCustomerInitiated})` : ""
          }.`,
  });

  // Disclaimers
  checks.push({
    id: "disclaimers",
    label: "Authorizations accepted",
    status: input.acceptedDisclaimers.length > 0 ? "pass" : "fail",
    detail: `${input.acceptedDisclaimers.length} acknowledgements recorded.`,
  });

  const failed = checks.filter((c) => c.status === "fail");
  const confidence: TopUpConfidence = {
    ok: failed.length === 0,
    checks,
    signalDecision: signal.decision,
  };

  if (failed.length > 0) {
    throw new Error(failed.map((f) => f.detail).join(" "));
  }

  const record: TopUpOrderRecord = {
    id: orderId,
    createdAt: Date.now(),
    status: "pending_review",
    usd: quote.usd,
    feeUsd: quote.feeUsd,
    totalDebitUsd: quote.totalDebitUsd,
    asset: input.asset,
    destinationAddress: input.destinationAddress,
    bank: {
      institution: bank.institution,
      accountName: bank.accountName,
      mask: bank.mask,
      subtype: bank.subtype,
      routingLast4: bank.routing.slice(-4),
      holderNames: bank.holderNames,
      availableBalance: available,
    },
    confidence,
    acceptedDisclaimers: input.acceptedDisclaimers,
    // Reopened by treasury only: full ACH numbers + Plaid item for the debit.
    treasuryRef: seal({
      orderId,
      accessToken: bank.accessToken,
      itemId: bank.itemId,
      accountId: bank.accountId,
      account: bank.account,
      routing: bank.routing,
      holderNames: bank.holderNames,
      amount: quote.totalDebitUsd,
      signal,
      acceptedDisclaimers: input.acceptedDisclaimers,
      acceptedAt: Date.now(),
    }),
  };

  // Treasury queue: logged server-side until the onramp partner API is live.
  console.info(
    `[topup] order ${orderId} $${quote.totalDebitUsd.toFixed(2)} ${input.asset} → ${input.destinationAddress} ` +
      `bank ${bank.institution ?? "?"} ••••${bank.mask} signal=${signal.decision}`,
  );

  return record;
}
