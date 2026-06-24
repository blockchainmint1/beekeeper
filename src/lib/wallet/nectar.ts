// Nectar Pay merchant link — derives BTC/TXC/EVM xpubs and posts them to a
// merchant onboarding endpoint encoded in a QR.
import { getChain, type UtxoChain } from "@/lib/chains";
import { utxoAccountXpub, chainAccountXpub } from "./xpub";
import {
  buildLinkPayload,
  signLinkPayload,
  postLinkPayload,
  type NectarLinkRequest,
} from "./nectar-link";
import { getCachedMnemonic } from "./seed";

const LINK_KEY = "lovable-multi-wallet-nectar-link-v1";

export interface NectarPayload {
  version: 1;
  btc: { xpub: string; path: string };
  txc: { xpub: string; path: string };
  evm: { xpub: string; path: string };
}

export interface NectarLinkRecord {
  merchantId?: string;
  merchantName?: string;
  url: string;
  linkedAt: number;
}

export interface NectarQrTarget {
  url: string;
  token?: string;
}

export function buildNectarPayload(mnemonic: string): NectarPayload {
  const btc = utxoAccountXpub(mnemonic, getChain("btc") as UtxoChain);
  const txc = utxoAccountXpub(mnemonic, getChain("txc") as UtxoChain);
  const evm = chainAccountXpub(mnemonic, getChain("eth"));
  return { version: 1, btc, txc, evm };
}

/**
 * Accepts either:
 *   - a plain https URL
 *   - JSON: { nectar: "merchant-link", v: 1, url: "...", token?: "..." }
 */
export function parseNectarQr(text: string): NectarQrTarget {
  const t = text.trim();
  if (!t) throw new Error("Empty QR");
  if (t.startsWith("{")) {
    let obj: unknown;
    try {
      obj = JSON.parse(t);
    } catch {
      throw new Error("Not a valid Nectar Pay QR");
    }
    const o = obj as { nectar?: string; url?: string; token?: string };
    if (!o.url || typeof o.url !== "string") throw new Error("QR missing merchant url");
    if (!/^https:\/\//i.test(o.url)) throw new Error("Merchant url must be https");
    return { url: o.url, token: typeof o.token === "string" ? o.token : undefined };
  }
  if (!/^https:\/\//i.test(t)) throw new Error("Not a Nectar Pay QR");
  return { url: t };
}

export async function linkNectarMerchant(
  _payload: NectarPayload,
  target: NectarQrTarget,
): Promise<NectarLinkRecord> {
  const mnemonic = getCachedMnemonic();
  if (!mnemonic) throw new Error("Wallet is locked — unlock first");

  // Nectar's /wallet-link endpoint requires the signed envelope
  // { payload, signature, address }. Synthesize a minimal link request from
  // the legacy QR (plain URL, no challenge_id) using defaults.
  let from = "nectar-pay.com";
  try { from = new URL(target.url).hostname; } catch { /* keep default */ }
  const challengeId =
    (globalThis.crypto?.randomUUID?.() as string | undefined) ??
    `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const req: NectarLinkRequest = {
    v: 1,
    type: "hm-link-xpubs",
    challenge_id: challengeId,
    from,
    callback_url: target.url,
    chains: ["BTC", "TXC", "EVM"],
  };

  const { payload } = buildLinkPayload(mnemonic, req);
  const { address, signature } = await signLinkPayload(mnemonic, payload);
  const body = await postLinkPayload(target.url, { payload, signature, address });

  const record: NectarLinkRecord = {
    merchantId: body.store_id,
    merchantName: body.merchant_name,
    url: target.url,
    linkedAt: Date.now(),
  };
  saveNectarLink(record);
  return record;
}


export function loadNectarLink(): NectarLinkRecord | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LINK_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NectarLinkRecord;
  } catch {
    return null;
  }
}

export function saveNectarLink(r: NectarLinkRecord): void {
  localStorage.setItem(LINK_KEY, JSON.stringify(r));
}

export function clearNectarLink(): void {
  localStorage.removeItem(LINK_KEY);
}

export function hasNectarLink(): boolean {
  return loadNectarLink() !== null;
}
