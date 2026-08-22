// Client-safe constants for the cash-out (sell crypto → ACH credit) flow.
// The mirror image of src/lib/topup: crypto in, dollars out.

import type { ChainId } from "@/lib/chains";

export const CASHOUT_MIN_USD = 25;
/** Self-serve ceiling per order. Bigger tickets go to the trade desk. */
export const CASHOUT_MAX_USD = 1000;
/** First cash-out on a freshly linked bank account is capped tighter. */
export const CASHOUT_FIRST_ORDER_MAX_USD = 250;
/** Service fee on the gross sale, in basis points, plus a flat ACH credit cost. */
export const CASHOUT_FEE_BPS = 199;
export const CASHOUT_FEE_FLAT_USD = 1;

export const TRADE_DESK_URL = "https://honest.money/trade-desk";

/** Assets we can buy back from you. */
export const CASHOUT_ASSETS: { chain: ChainId; label: string }[] = [
  { chain: "txc", label: "TEXITcoin (TXC)" },
  { chain: "btc", label: "Bitcoin (BTC)" },
  { chain: "eth", label: "Ethereum (ETH)" },
  { chain: "base", label: "Base (ETH)" },
];

export interface CashOutQuote {
  /** Gross USD value of the crypto you send. */
  grossUsd: number;
  feeUsd: number;
  /** What lands in the bank account. */
  netUsd: number;
}

export function quoteCashOut(grossUsd: number): CashOutQuote {
  const feeUsd =
    Math.round((grossUsd * (CASHOUT_FEE_BPS / 10_000) + CASHOUT_FEE_FLAT_USD) * 100) / 100;
  return {
    grossUsd,
    feeUsd,
    netUsd: Math.max(0, Math.round((grossUsd - feeUsd) * 100) / 100),
  };
}

export function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Each box is checked individually; the accepted set is stored with the order. */
export const CASHOUT_DISCLAIMERS: { id: string; text: string }[] = [
  {
    id: "sale_order",
    text:
      "I am selling crypto. I am placing a sell order at the price quoted when my transfer confirms " +
      "on-chain — not the estimate shown on this screen.",
  },
  {
    id: "send_first",
    text:
      "I understand the crypto leaves my wallet first. Dollars are only sent to my bank after my " +
      "transfer has enough on-chain confirmations.",
  },
  {
    id: "exact_address",
    text:
      "I will send only the asset shown, on the network shown, to the settlement address shown. Sending " +
      "the wrong asset or the wrong network can permanently destroy the funds.",
  },
  {
    id: "irreversible",
    text:
      "Blockchain transfers are final. Once I send, the transfer cannot be recalled, reversed, or " +
      "cancelled by me or by Beekeeper.",
  },
  {
    id: "ach_credit",
    text:
      "I authorize an ACH credit to the bank account I linked, and I confirm I am an authorized signer " +
      "on that account. Payouts settle in 1–3 business days after confirmation.",
  },
  {
    id: "bank_mismatch",
    text:
      "If my bank rejects the credit or the account details are wrong, the payout is returned and I may " +
      "be charged a returned-payment fee. Beekeeper does not re-send crypto in place of a failed payout.",
  },
  {
    id: "manual_review",
    text:
      "Cash-outs are reviewed before payout. Large, unusual, or high-risk transfers may be held, may " +
      "require extra identity documents, or may be returned in crypto minus network fees.",
  },
  {
    id: "tax",
    text:
      "Selling crypto may be a taxable event. I am responsible for my own reporting, and my payout may " +
      "be reported to tax authorities where required.",
  },
  {
    id: "kyc_aml",
    text:
      "My name, bank details, wallet addresses, and transfer may be shared with our settlement and " +
      "banking partners for identity verification, sanctions screening, and anti–money-laundering checks.",
  },
  {
    id: "no_advice",
    text: "This is not investment or tax advice, and Beekeeper is not a bank. Prices move; I accept that risk.",
  },
  {
    id: "terms",
    text: "I have read and accept the Beekeeper Terms of Service and Privacy Policy.",
  },
];
