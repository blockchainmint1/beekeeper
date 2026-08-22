// Client-safe constants and types for the ACH top-up (buy crypto) flow.
// Pricing/limits live here so the wizard and the server agree on the rules.

import type { ChainId } from "@/lib/chains";

/** Hard ceiling for a self-serve order. Above this we hand off to the trade desk. */
export const TOPUP_MAX_USD = 1000;
export const TOPUP_MIN_USD = 25;
/** First order on a freshly linked bank account is capped tighter. */
export const TOPUP_FIRST_ORDER_MAX_USD = 250;
/** Buffer required on top of the order total in the bank's available balance. */
export const TOPUP_BALANCE_BUFFER_USD = 10;
/**
 * Service fee charged on the fiat amount, in basis points. 1% standard; some
 * accounts get a discounted tier, which is applied server-side per order.
 */
export const TOPUP_FEE_BPS = 100;
export const TOPUP_FEE_FLAT_USD = 0;

export const TRADE_DESK_URL = "https://honest.money/trade-desk";

export interface TopUpPackage {
  id: string;
  usd: number;
  label: string;
  blurb: string;
  popular?: boolean;
}

export const TOPUP_PACKAGES: TopUpPackage[] = [
  { id: "starter", usd: 50, label: "Starter", blurb: "Dip a toe in" },
  { id: "worker", usd: 100, label: "Worker Bee", blurb: "Most common first order", popular: true },
  { id: "forager", usd: 250, label: "Forager", blurb: "Room to move" },
  { id: "hive", usd: 1000, label: "Full Hive", blurb: "Self-serve maximum" },
];

/**
 * Assets a top-up can be delivered in. Stablecoins only: `chain` decides which
 * wallet address the delivery goes to, `ticker` is the asset we owe.
 */
export const TOPUP_ASSETS: { chain: ChainId; label: string; ticker: string }[] = [
  { chain: "txc", label: "TSD on TEXITcoin", ticker: "TSD" },
  { chain: "base", label: "USDC on Base", ticker: "USDC" },
];

export interface TopUpQuote {
  usd: number;
  feeUsd: number;
  totalDebitUsd: number;
}

export function quoteTopUpWithBps(usd: number, bps: number): TopUpQuote {
  const feeUsd = Math.round((usd * (bps / 10_000) + TOPUP_FEE_FLAT_USD) * 100) / 100;
  return { usd, feeUsd, totalDebitUsd: Math.round((usd + feeUsd) * 100) / 100 };
}

export function quoteTopUp(usd: number): TopUpQuote {
  return quoteTopUpWithBps(usd, TOPUP_FEE_BPS);
}

export function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Each box must be checked individually; the set is stored with the order. */
export const TOPUP_DISCLAIMERS: { id: string; text: string }[] = [
  {
    id: "ach_authorization",
    text:
      "I authorize a one-time ACH debit from the bank account I just linked for the total shown, " +
      "and I confirm I am an authorized signer on that account. I may revoke this authorization only " +
      "before the debit is submitted, by contacting support.",
  },
  {
    id: "nsf",
    text:
      "If the debit is returned for insufficient funds or any other reason, I am responsible for a " +
      "returned-payment fee and any resulting negative balance.",
  },
  {
    id: "settlement_window",
    text:
      "ACH settlement takes 1–3 business days. My crypto is delivered after the funds clear, not at " +
      "the moment I place the order.",
  },
  {
    id: "volatility",
    text:
      "Crypto prices move. The amount of crypto I receive is priced when the funds clear, so it may be " +
      "more or less than the estimate shown today.",
  },
  {
    id: "irreversible",
    text:
      "Blockchain transactions are final and irreversible. Beekeeper cannot reverse, recall, or refund a " +
      "delivered transaction, and cannot recover funds sent to a wrong address.",
  },
  {
    id: "self_custody",
    text:
      "I hold my own keys. Beekeeper never holds my crypto and cannot restore my wallet if I lose my " +
      "recovery phrase — including the crypto bought through this order.",
  },
  {
    id: "seller_of_record",
    text:
      "The crypto is sold to me by our licensed onramp partner, who is the seller of record. Beekeeper is " +
      "software that presents the order and delivers it to my self-custodied address.",
  },
  {
    id: "kyc_aml",
    text:
      "My name, bank account details, and order may be shared with the onramp partner and its banking " +
      "providers for identity verification, sanctions screening, and anti–money-laundering compliance.",
  },
  {
    id: "no_advice",
    text:
      "This is not investment advice. Crypto is volatile, is not FDIC- or SIPC-insured, and I could lose " +
      "the entire amount.",
  },
  {
    id: "terms",
    text: "I have read and accept the Beekeeper Terms of Service and Privacy Policy.",
  },
];
