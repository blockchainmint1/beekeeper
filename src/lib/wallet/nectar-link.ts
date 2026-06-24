// Nectar Pay "link xpubs" protocol — v1.
//
// Goal: hand a merchant's Nectar Pay dashboard the receive-side extended public
// keys (xpubs/zpubs) for every chain they accept, with a signature the server
// can verify so it knows the keys came from the wallet holding the seed.
//
// ─── Signing primitive (what Nectar implements on its side) ────────────────
//   curve:       secp256k1
//   address:     TXC mainnet legacy P2PKH (base58check, version byte 0x42)
//                derived at m/44'/696969'/0'/0/0
//   message:     UTF-8 bytes of `canonicalJson(payload)` — keys sorted
//                recursively, no whitespace, RFC 8259 strings
//   signature:   BIP-137 Bitcoin signed-message format (compact recoverable,
//                65 bytes), base64-encoded
//   prefix:      "TEXITcoin Signed Message:\n"
//   verify:      `bitcoinjs-message.verify(canonical, txcAddress, sigB64,
//                "TEXITcoin Signed Message:\n", true)`
//
// ─── Wire format ───────────────────────────────────────────────────────────
// Wallet receives either an https URL or a JSON envelope (QR or deep link):
//
//   JSON envelope (preferred — self-describing, works in any web/PWA wallet):
//     {
//       "v": 1,
//       "type": "hm-link-xpubs",
//       "challenge_id": "<uuid>",
//       "from":         "nectar-pay.com",
//       "callback_url": "https://nectar-pay.com/api/public/v1/wallet-link",
//       "chains":       ["BTC","TXC","EVM","LTC","BCH","TRX"],
//       "exp":          1735689600
//     }
//
//   URL form (legacy / native-app friendly — accepted but discouraged):
//     <scheme>://link-xpubs?id=<uuid>&cb=<callback>&chains=BTC,EVM,...
//                          &from=<domain>&exp=<unix>
//
// Wallet POSTs to `callback_url`:
//
//   { "payload": <signed object>, "signature": "<base64>", "address": "<TXC>" }
//
// where `signed object` is:
//
//   {
//     "v": 1,
//     "type": "hm-link-xpubs",
//     "challenge_id": "<uuid>",
//     "from":         "nectar-pay.com",
//     "callback_url": "https://nectar-pay.com/api/public/v1/wallet-link",
//     "chains":       ["BTC","TXC","EVM","LTC","BCH","TRX"],
//     "xpubs":        { "BTC": "zpub6...", "TXC": "xpub6...", ... },
//     "exp":          1735689600,
//     "issued_at":    "2026-06-24T18:32:01.234Z"
//   }
//
// Nectar SHOULD respond with `{ ok: true, store_id, merchant_name, chains_linked }`.

import { CHAINS, getChain, type ChainConfig, type ChainId, type UtxoChain } from "@/lib/chains";
import { utxoAccountXpub, chainAccountXpub } from "./xpub";
import { deriveUtxoAccount } from "./utxo";
import { utxoSignMessage } from "./signing";

// Stable order — used by canonicalJson and by Nectar's verifier.
export const NECTAR_CHAINS = ["BTC", "TXC", "EVM", "LTC", "BCH", "TRX", "DOGE"] as const;
export type NectarChainKey = (typeof NECTAR_CHAINS)[number];

/** Maps a Nectar chain key to the wallet's local ChainConfig id, or null when
 *  the wallet doesn't yet support derivation for that chain. */
export const NECTAR_TO_LOCAL: Record<NectarChainKey, ChainId | null> = {
  BTC: "btc",
  TXC: "txc",
  EVM: "eth",
  LTC: "ltc",
  BCH: "bch",
  TRX: "trx",
  DOGE: null, // not configured yet — wallet will report it as unsupported
};

export interface NectarLinkRequest {
  v: 1;
  type: "hm-link-xpubs";
  challenge_id: string;
  from: string;
  callback_url: string;
  chains: NectarChainKey[];
  exp?: number;
}

export interface NectarLinkSignedPayload {
  v: 1;
  type: "hm-link-xpubs";
  challenge_id: string;
  from: string;
  callback_url: string;
  chains: NectarChainKey[];
  xpubs: Partial<Record<NectarChainKey, string>>;
  exp: number;
  issued_at: string;
}

export interface NectarLinkResponse {
  ok?: boolean;
  store_id?: string;
  merchant_name?: string;
  chains_linked?: NectarChainKey[];
}

/* ─────────────────────────────── Parsing ─────────────────────────────── */

function normalizeChains(raw: unknown): NectarChainKey[] {
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  const out: NectarChainKey[] = [];
  for (const c of arr) {
    if (typeof c !== "string") continue;
    const key = c.trim().toUpperCase();
    if ((NECTAR_CHAINS as readonly string[]).includes(key)) {
      out.push(key as NectarChainKey);
    }
  }
  if (out.length === 0) throw new Error("No supported chains requested");
  return Array.from(new Set(out));
}

function assertHttps(url: string, field: string): void {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error(`Invalid ${field}`); }
  if (u.protocol !== "https:") throw new Error(`${field} must be https`);
}

/** Try to parse the raw QR text as a Nectar link-xpubs request. Throws if it
 *  is not a recognized link-xpubs payload (caller can then try other formats). */
export function parseNectarLinkRequest(raw: string): NectarLinkRequest {
  const t = raw.trim();
  if (!t) throw new Error("Empty QR");

  // URL form: <scheme>://link-xpubs?...  or  https://<host>/.../link-xpubs?...
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(t);
  if (looksLikeUrl) {
    let url: URL;
    try { url = new URL(t); } catch { throw new Error("Invalid link URL"); }
    const isLinkXpubs =
      url.host === "link-xpubs" /* <scheme>://link-xpubs */ ||
      /\/link-xpubs\/?$/i.test(url.pathname);
    if (!isLinkXpubs) throw new Error("Not a link-xpubs URL");
    const id = url.searchParams.get("id");
    const cb = url.searchParams.get("cb") ?? url.searchParams.get("callback_url");
    const chainsParam = url.searchParams.get("chains");
    const from = url.searchParams.get("from") ?? url.hostname;
    const expRaw = url.searchParams.get("exp");
    if (!id || !cb || !chainsParam) {
      throw new Error("link-xpubs URL missing id, cb, or chains");
    }
    assertHttps(cb, "callback_url");
    return {
      v: 1,
      type: "hm-link-xpubs",
      challenge_id: id,
      from,
      callback_url: cb,
      chains: normalizeChains(chainsParam),
      exp: expRaw ? Number(expRaw) : undefined,
    };
  }

  // JSON envelope form
  if (!t.startsWith("{")) throw new Error("Not a link-xpubs payload");
  let obj: unknown;
  try { obj = JSON.parse(t); } catch { throw new Error("Invalid JSON"); }
  const o = obj as Partial<NectarLinkRequest> & { cb?: string };
  if (o.v !== 1 || o.type !== "hm-link-xpubs") {
    throw new Error("Not a link-xpubs payload");
  }
  const callback = o.callback_url ?? o.cb;
  if (typeof o.challenge_id !== "string" || !o.challenge_id) {
    throw new Error("Missing challenge_id");
  }
  if (typeof o.from !== "string" || !o.from) throw new Error("Missing from");
  if (typeof callback !== "string") throw new Error("Missing callback_url");
  assertHttps(callback, "callback_url");
  const chains = normalizeChains(o.chains);
  const exp = typeof o.exp === "number" ? o.exp : undefined;
  if (exp && exp * 1000 < Date.now()) throw new Error("Link request expired");
  return {
    v: 1,
    type: "hm-link-xpubs",
    challenge_id: o.challenge_id,
    from: o.from,
    callback_url: callback,
    chains,
    exp,
  };
}

/* ─────────────────────────── Payload + signing ─────────────────────────── */

/** Deterministic JSON serializer: recursively sorts object keys, no whitespace.
 *  Arrays preserve order. Used as the exact byte sequence we sign. */
export function canonicalJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) throw new Error("Cycle in payload");
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = walk((v as Record<string, unknown>)[k]);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

/** Per-chain xpub the merchant should watch. Throws if the chain isn't
 *  supported by this wallet build. */
function deriveXpubFor(mnemonic: string, key: NectarChainKey): string {
  const localId = NECTAR_TO_LOCAL[key];
  if (!localId) throw new Error(`${key} not yet supported by this wallet`);
  const chain = getChain(localId);
  if (chain.kind === "utxo") {
    return utxoAccountXpub(mnemonic, chain as UtxoChain).xpub;
  }
  return chainAccountXpub(mnemonic, chain as ChainConfig).xpub;
}

export interface BuiltPayload {
  payload: NectarLinkSignedPayload;
  /** Chains the wallet could not derive — surfaced to user in the consent UI
   *  and reported back via the response. */
  unsupported: NectarChainKey[];
}

export function buildLinkPayload(mnemonic: string, req: NectarLinkRequest): BuiltPayload {
  const xpubs: Partial<Record<NectarChainKey, string>> = {};
  const unsupported: NectarChainKey[] = [];
  for (const key of req.chains) {
    try {
      xpubs[key] = deriveXpubFor(mnemonic, key);
    } catch {
      unsupported.push(key);
    }
  }
  const supported = req.chains.filter((c) => !unsupported.includes(c));
  if (supported.length === 0) {
    throw new Error("No requested chains are supported by this wallet");
  }
  const exp = req.exp ?? Math.floor(Date.now() / 1000) + 5 * 60;
  return {
    payload: {
      v: 1,
      type: "hm-link-xpubs",
      challenge_id: req.challenge_id,
      from: req.from,
      callback_url: req.callback_url,
      chains: supported,
      xpubs,
      exp,
      issued_at: new Date().toISOString(),
    },
    unsupported,
  };
}

/** Signs the canonical JSON of `payload` with the TXC primary key. Returns the
 *  TXC P2PKH address (base58) and a base64 BIP-137 signature. */
export async function signLinkPayload(
  mnemonic: string,
  payload: NectarLinkSignedPayload,
): Promise<{ address: string; signature: string; canonical: string }> {
  const txc = CHAINS.txc as UtxoChain;
  // Legacy P2PKH at m/44'/696969'/0'/0/0 — matches what Nectar's verifier expects.
  const acct = await deriveUtxoAccount(mnemonic, txc, 0, "legacy");
  const canonical = canonicalJson(payload);
  const signature = await utxoSignMessage({
    mnemonic,
    chain: txc,
    index: 0,
    type: "legacy",
    message: canonical,
  });
  return { address: acct.address, signature, canonical };
}

/* ─────────────────────────── Network ─────────────────────────── */

export async function postLinkPayload(
  callbackUrl: string,
  body: { payload: NectarLinkSignedPayload; signature: string; address: string },
): Promise<NectarLinkResponse> {
  const res = await fetch(callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Link failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string; message?: string };
      msg = j.error || j.message || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  try {
    return (await res.json()) as NectarLinkResponse;
  } catch {
    return { ok: true };
  }
}

/* ─────────────────────────── Safety helpers ─────────────────────────── */

/** Returns true when `callback_url` belongs to the same registrable domain as
 *  `from` (exact host or subdomain). Used by the consent screen to flag
 *  cross-origin callbacks (likely phishing). */
export function callbackMatchesOrigin(from: string, callbackUrl: string): boolean {
  try {
    const cb = new URL(callbackUrl);
    const fromHost = from.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    const cbHost = cb.hostname.toLowerCase();
    return cbHost === fromHost || cbHost.endsWith(`.${fromHost}`);
  } catch {
    return false;
  }
}
