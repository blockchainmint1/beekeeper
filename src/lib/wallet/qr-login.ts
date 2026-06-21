// QR login protocol — websites display a JSON envelope; the wallet signs
// a canonical message with the active chain's key and POSTs to the callback.
import type { ChainConfig } from "@/lib/chains";
import { evmSignMessage, utxoSignMessage } from "./signing";
import { deriveUtxoAccount } from "./utxo";
import { deriveEvmAccount } from "./evm";

export interface QrLoginRequest {
  v: 1;
  type: "hm-login";
  origin: string;
  nonce: string;
  callback: string;
  statement?: string;
  expiresAt?: number;
  chain?: string; // optional preferred chain id
}

export function parseQrLogin(raw: string): QrLoginRequest {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("QR is not valid login JSON");
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
  return o as QrLoginRequest;
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

export interface QrLoginResult {
  chain: string;
  address: string;
  message: string;
  signature: string;
  nonce: string;
}

export async function signQrLogin(args: {
  mnemonic: string;
  chain: ChainConfig;
  request: QrLoginRequest;
}): Promise<QrLoginResult> {
  const { mnemonic, chain, request } = args;
  let address: string;
  let message: string;
  let signature: string;
  if (chain.kind === "evm") {
    const acct = deriveEvmAccount(mnemonic, chain, 0);
    address = acct.address;
    message = buildLoginMessage(request, address, chain);
    const { signature: sig } = await evmSignMessage({ mnemonic, chain, message });
    signature = sig;
  } else {
    const acct = await deriveUtxoAccount(mnemonic, chain, 0, chain.defaultAddressType);
    address = acct.address;
    message = buildLoginMessage(request, address, chain);
    signature = await utxoSignMessage({ mnemonic, chain, message, type: chain.defaultAddressType });
  }
  return { chain: chain.id, address, message, signature, nonce: request.nonce };
}

export async function postQrLogin(callback: string, result: QrLoginResult): Promise<void> {
  const res = await fetch(callback, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Callback failed (${res.status})`);
  }
}