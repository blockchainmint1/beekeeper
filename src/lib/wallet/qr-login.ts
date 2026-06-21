// QR login protocol — websites display a JSON envelope; the wallet signs
// a canonical message with the active chain's key and POSTs to the callback.
import type { ChainConfig } from "@/lib/chains";
import { evmSignMessage, utxoSignMessage } from "./signing";
import { deriveUtxoAccount } from "./utxo";
import { deriveEvmAccount } from "./evm";
import { deriveTronAccount, tronSignMessage } from "./tron";
import { deriveSolanaAccount, solanaSignMessage } from "./solana";

/**
 * Two protocols supported:
 *
 * 1. **Deep-link** (CoinFlow / payHME style):
 *      <scheme>://login?id=<uuid>&nonce=<hex>&cb=<callbackUrl>[&msg=<base64url>]
 *    - If `msg` is present, that's the exact text to sign.
 *    - Else the wallet GETs `${cb}?id=${id}` expecting `{message: string}`.
 *    - Wallet POSTs `{id, address, signature}` to `cb`.
 *
 * 2. **JSON envelope** (self-contained):
 *      {v:1, type:"hm-login", origin, nonce, callback, statement?, expiresAt?}
 *    - Wallet builds the canonical message itself.
 *    - Wallet POSTs `{chain, address, message, signature, nonce}` to `callback`.
 */

export interface QrLoginDeepLink {
  protocol: "deep-link";
  scheme: string;
  id: string;
  nonce: string;
  callback: string;
  inlineMessage?: string;
}

export interface QrLoginRequest {
  protocol: "envelope";
  v: 1;
  type: "hm-login";
  origin: string;
  nonce: string;
  callback: string;
  statement?: string;
  expiresAt?: number;
  chain?: string; // optional preferred chain id
}

export type ParsedQrLogin = QrLoginDeepLink | QrLoginRequest;

function decodeBase64Url(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  if (typeof atob === "function") return decodeURIComponent(escape(atob(b64)));
  return Buffer.from(b64, "base64").toString("utf8");
}

export function parseQrLogin(raw: string): ParsedQrLogin {
  const trimmed = raw.trim();

  // Deep-link form: scheme://login?...
  if (/^[a-z][a-z0-9+.-]*:\/\/login\?/i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Invalid login URL");
    }
    const id = url.searchParams.get("id");
    const nonce = url.searchParams.get("nonce");
    const cb = url.searchParams.get("cb");
    const msg = url.searchParams.get("msg");
    if (!id || !nonce || !cb) throw new Error("Missing id/nonce/cb in login URL");
    try { new URL(cb); } catch { throw new Error("Invalid callback URL"); }
    return {
      protocol: "deep-link",
      scheme: url.protocol.replace(/:$/, ""),
      id,
      nonce,
      callback: cb,
      inlineMessage: msg ? decodeBase64Url(msg) : undefined,
    };
  }

  // JSON envelope form
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    throw new Error("QR is not a recognized login format");
  }
  if (!obj || typeof obj !== "object") throw new Error("Invalid payload");
  const o = obj as Partial<QrLoginRequest>;
  if (o.v !== 1 || o.type !== "hm-login") throw new Error("Unsupported QR type");
  if (typeof o.origin !== "string" || typeof o.nonce !== "string" || typeof o.callback !== "string") {
    throw new Error("Missing origin/nonce/callback");
  }
  try { new URL(o.callback); } catch { throw new Error("Invalid callback URL"); }
  if (o.expiresAt && typeof o.expiresAt === "number" && o.expiresAt < Date.now()) {
    throw new Error("Login request expired");
  }
  return { ...(o as QrLoginRequest), protocol: "envelope" };
}

export function buildLoginMessage(req: QrLoginRequest, address: string, chain: ChainConfig): string {
  const lines = [
    `${req.origin} wants you to sign in with your ${chain.ticker} wallet.`,
    "",
    `Address: ${address}`,
    `Chain: ${chain.name} (${chain.id})`,
  ];
  if (req.statement) {
    lines.push("", `Statement: ${req.statement}`);
  }
  lines.push("", `Nonce: ${req.nonce}`, `Issued: ${new Date().toISOString()}`);
  return lines.join("\n");
}

/** Fetch the server-canonical message for a deep-link challenge. */
export async function fetchDeepLinkMessage(link: QrLoginDeepLink): Promise<string> {
  if (link.inlineMessage) return link.inlineMessage;
  const url = new URL(link.callback);
  url.searchParams.set("id", link.id);
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(`Could not fetch message (${res.status})`);
  const data = (await res.json()) as { message?: string };
  if (!data.message) throw new Error("Server did not return a message to sign");
  return data.message;
}

export interface SignedEnvelope {
  protocol: "envelope";
  chain: string;
  address: string;
  message: string;
  signature: string;
  nonce: string;
}
export interface SignedDeepLink {
  protocol: "deep-link";
  id: string;
  address: string;
  message: string;
  signature: string;
}
export type QrLoginResult = SignedEnvelope | SignedDeepLink;

export async function signQrLogin(args: {
  mnemonic: string;
  chain: ChainConfig;
  request: ParsedQrLogin;
  message: string;
}): Promise<QrLoginResult> {
  const { mnemonic, chain, request, message } = args;
  let address: string;
  let signature: string;
  if (chain.kind === "evm") {
    const acct = deriveEvmAccount(mnemonic, chain, 0);
    address = acct.address;
    const { signature: sig } = await evmSignMessage({ mnemonic, chain, message });
    signature = sig;
  } else if (chain.kind === "tron") {
    const acct = deriveTronAccount(mnemonic, chain, 0);
    address = acct.address;
    signature = tronSignMessage(acct, message);
  } else if (chain.kind === "solana") {
    const acct = deriveSolanaAccount(mnemonic, chain, 0);
    address = acct.address;
    signature = solanaSignMessage(acct, message);
  } else {
    const acct = await deriveUtxoAccount(mnemonic, chain, 0, chain.defaultAddressType);
    address = acct.address;
    signature = await utxoSignMessage({ mnemonic, chain, message, type: chain.defaultAddressType });
  }
  if (request.protocol === "deep-link") {
    return { protocol: "deep-link", id: request.id, address, message, signature };
  }
  return { protocol: "envelope", chain: chain.id, address, message, signature, nonce: request.nonce };
}

export async function postQrLogin(callback: string, result: QrLoginResult): Promise<void> {
  const body =
    result.protocol === "deep-link"
      ? { id: result.id, address: result.address, signature: result.signature, message: result.message }
      : {
          chain: result.chain,
          address: result.address,
          message: result.message,
          signature: result.signature,
          nonce: result.nonce,
        };
  const res = await fetch(callback, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Callback failed (${res.status})`);
  }
}