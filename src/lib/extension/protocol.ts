// Shared wire protocol between the Nectar browser extension
// and the wallet web app. Imported by wallet routes; a copy is also
// shipped inside the extension bundle via scripts/build-extension.sh.

export const EXT_PROTOCOL_VERSION = 1 as const;

/** Origins the wallet app trusts to send `chrome.runtime.sendMessage` to. */
export const WALLET_ORIGINS = [
  "https://wallet.honest.money",
  "https://honest-money-wallet.lovable.app",
  "http://localhost:8080",
] as const;

export type ExtChainKind = "evm" | "utxo";

export type ExtRequestKind =
  | "getAddress"   // return {address, chain}
  | "getXpub"      // return {xpub, path}
  | "signMessage"  // sign arbitrary text
  | "signLogin"    // QR/SIWE-style login (host-signed nonce)
  | "signTx";      // sign a raw tx (payload chain-specific)

export interface ExtRequest {
  v: typeof EXT_PROTOCOL_VERSION;
  id: string;            // uuid
  kind: ExtRequestKind;
  chain?: string;        // chain id; omit = use active
  origin: string;        // requesting dapp origin
  payload?: unknown;     // kind-specific
  createdAt: number;
}

export interface ExtResponse {
  v: typeof EXT_PROTOCOL_VERSION;
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

export function encodeRequest(req: ExtRequest): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(req))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeRequest(s: string): ExtRequest {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const json = decodeURIComponent(escape(atob(b64)));
  const parsed = JSON.parse(json) as ExtRequest;
  if (parsed.v !== EXT_PROTOCOL_VERSION) throw new Error("Unsupported protocol version");
  if (!parsed.id || !parsed.kind || !parsed.origin) throw new Error("Malformed request");
  return parsed;
}

export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}