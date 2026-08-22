// Server-only Plaid client for the ACH top-up flow.
//
// Nothing here may ever run in the browser: it holds PLAID_SECRET and it is the
// only place raw bank account / routing numbers exist. The device receives a
// masked summary plus a sealed (AES-256-GCM) record that only this server can
// reopen for manual treasury entry.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { env } from "@/lib/server-env";

const HOSTS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

function plaidEnv(): string {
  const e = (env("PLAID_ENV") || "sandbox").toLowerCase();
  return HOSTS[e] ? e : "sandbox";
}

function creds(): { clientId: string; secret: string } {
  const clientId = env("PLAID_CLIENT_ID");
  const secret = env("PLAID_SECRET");
  if (!clientId || !secret) {
    throw new Error("Bank linking isn't configured yet. Please try again later.");
  }
  return { clientId, secret };
}

export function plaidConfigured(): boolean {
  return Boolean(env("PLAID_CLIENT_ID") && env("PLAID_SECRET"));
}

type PlaidError = { error_code?: string; error_message?: string; display_message?: string };

async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { clientId, secret } = creds();
  let res: Response;
  try {
    res = await fetch(`${HOSTS[plaidEnv()]}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, secret, ...body }),
    });
  } catch {
    throw new Error("Couldn't reach the bank verification service. Try again in a moment.");
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("The bank verification service returned an unexpected response.");
  }
  if (!res.ok) {
    const e = json as PlaidError;
    console.error(`Plaid ${path} ${res.status}: ${e.error_code ?? ""} ${e.error_message ?? text}`);
    throw new Error(
      e.display_message ||
        (e.error_code === "ITEM_LOGIN_REQUIRED"
          ? "Your bank needs you to sign in again. Re-link the account and retry."
          : "Your bank couldn't be verified right now. Please try a different account or try again later."),
    );
  }
  return json as T;
}

/* ─── Sealed bank record ─────────────────────────────────────────────
   Full account/routing numbers plus the Plaid access token are encrypted
   with TOPUP_RECORD_SECRET and travel with the order as an opaque string.
   Treasury reopens them server-side when the ACH debit is entered. */

function sealKey(): Buffer {
  const raw = env("TOPUP_RECORD_SECRET");
  if (!raw) throw new Error("Top-up isn't fully configured yet. Please try again later.");
  const buf = Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : createHash("sha256").update(raw).digest();
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", sealKey(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function unseal<T>(stored: string): T {
  const buf = Buffer.from(stored, "base64");
  const d = createDecipheriv("aes-256-gcm", sealKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8"),
  ) as T;
}

/* ─── Plaid calls ─────────────────────────────────────────────── */

export function createLinkToken(clientUserId: string, redirectUri?: string) {
  return plaid<{ link_token: string; expiration: string }>("/link/token/create", {
    client_name: "Beekeeper",
    language: "en",
    country_codes: ["US"],
    user: { client_user_id: clientUserId },
    products: ["auth"],
    optional_products: ["identity"],
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
  });
}

export function exchangePublicToken(publicToken: string) {
  return plaid<{ access_token: string; item_id: string }>("/item/public_token/exchange", {
    public_token: publicToken,
  });
}

interface AuthAccount {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  subtype?: string | null;
  type?: string | null;
  balances?: { available?: number | null; current?: number | null; iso_currency_code?: string | null };
}

export function authGet(accessToken: string) {
  return plaid<{
    accounts: AuthAccount[];
    numbers: { ach: { account_id: string; account: string; routing: string; wire_routing?: string | null }[] };
    item: { institution_id?: string | null };
  }>("/auth/get", { access_token: accessToken });
}

export function balanceGet(accessToken: string, accountId: string) {
  return plaid<{ accounts: AuthAccount[] }>("/accounts/balance/get", {
    access_token: accessToken,
    options: { account_ids: [accountId] },
  });
}

export async function identityGet(accessToken: string, accountId: string) {
  try {
    const r = await plaid<{
      accounts: { account_id: string; owners: { names: string[] }[] }[];
    }>("/identity/get", { access_token: accessToken, options: { account_ids: [accountId] } });
    const acct = r.accounts.find((a) => a.account_id === accountId);
    return acct?.owners.flatMap((o) => o.names) ?? [];
  } catch {
    // Identity may not be enabled on the account; the gate degrades instead of failing.
    return [];
  }
}

export async function institutionName(institutionId?: string | null) {
  if (!institutionId) return null;
  try {
    const r = await plaid<{ institution: { name: string } }>("/institutions/get_by_id", {
      institution_id: institutionId,
      country_codes: ["US"],
    });
    return r.institution.name;
  } catch {
    return null;
  }
}

export interface SignalResult {
  scoreCustomerInitiated: number | null;
  scoreBankInitiated: number | null;
  decision: "allow" | "review" | "decline" | "unavailable";
  reason?: string;
}

/** Plaid Signal: ACH return-risk scoring. Degrades to "unavailable" if not enabled. */
export async function signalEvaluate(args: {
  accessToken: string;
  accountId: string;
  clientTransactionId: string;
  amount: number;
}): Promise<SignalResult> {
  try {
    const r = await plaid<{
      scores?: {
        customer_initiated_return_risk?: { score?: number };
        bank_initiated_return_risk?: { score?: number };
      };
    }>("/signal/evaluate", {
      access_token: args.accessToken,
      account_id: args.accountId,
      client_transaction_id: args.clientTransactionId.slice(0, 36),
      amount: args.amount,
      user_present: true,
    });
    const ci = r.scores?.customer_initiated_return_risk?.score ?? null;
    const bi = r.scores?.bank_initiated_return_risk?.score ?? null;
    const worst = Math.max(ci ?? 0, bi ?? 0);
    // Plaid scores run 1–99; higher = more likely to be returned.
    const decision = ci === null && bi === null ? "unavailable" : worst >= 80 ? "decline" : worst >= 60 ? "review" : "allow";
    return { scoreCustomerInitiated: ci, scoreBankInitiated: bi, decision };
  } catch (e) {
    return {
      scoreCustomerInitiated: null,
      scoreBankInitiated: null,
      decision: "unavailable",
      reason: e instanceof Error ? e.message : undefined,
    };
  }
}
