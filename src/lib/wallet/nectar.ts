// Nectar Pay merchant link — derives BTC/TXC/EVM xpubs and posts them to a
// merchant onboarding endpoint encoded in a QR.
import { getChain, type UtxoChain } from "@/lib/chains";
import { utxoAccountXpub, chainAccountXpub } from "./xpub";
import {
  buildLinkPayload,
  signLinkPayload,
  postLinkPayload,
  fetchNectarLinkStatus,
  nectarStatusUrl,
  type NectarLinkRequest,
} from "./nectar-link";
import { getCachedMnemonic, getVaultFingerprint } from "./seed";

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
  /** Fingerprint of the seed that made this link (see seed.ts). */
  walletId?: string;
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


/**
 * Returns the merchant link only when it belongs to the seed currently loaded
 * in this browser. A link recorded by a previous wallet (wiped + fresh seed
 * import, or a record written before links were seed-scoped) is discarded, so
 * the UI never claims "linked" for a wallet Nectar has never seen.
 */
export function loadNectarLink(): NectarLinkRecord | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LINK_KEY);
  if (!raw) return null;
  let rec: NectarLinkRecord;
  try {
    rec = JSON.parse(raw) as NectarLinkRecord;
  } catch {
    return null;
  }
  const fp = getVaultFingerprint();
  if (!rec.walletId || !fp || rec.walletId !== fp) {
    localStorage.removeItem(LINK_KEY);
    return null;
  }
  return rec;
}

export function saveNectarLink(r: NectarLinkRecord): void {
  const walletId = getVaultFingerprint() ?? undefined;
  localStorage.setItem(LINK_KEY, JSON.stringify({ ...r, walletId }));
}

export function clearNectarLink(): void {
  localStorage.removeItem(LINK_KEY);
}

export function hasNectarLink(): boolean {
  return loadNectarLink() !== null;
}


/* ─────────── Cross-device link recovery ───────────
   Link state used to live only in localStorage, so restoring a seed on a new
   phone looked "unlinked". Nectar now answers a signature-gated pre-flight
   check, so we can rebuild the record from the seed alone. */

/** Host we ask when there is no locally-remembered Nectar URL. */
export const NECTAR_DEFAULT_HOST = "nectar-pay.com";

let statusProbe: Promise<NectarLinkRecord | null> | null = null;

/**
 * Restores the Nectar link record for the currently unlocked seed by asking
 * Nectar directly. Memoized per page load. Resolves null when the wallet is
 * locked, the endpoint isn't live, or the seed has never pushed xpubs.
 */
export function refreshNectarLinkFromServer(
  hostOrUrl?: string,
): Promise<NectarLinkRecord | null> {
  if (statusProbe) return statusProbe;
  statusProbe = (async () => {
    const mnemonic = getCachedMnemonic();
    if (!mnemonic) return null;
    const existing = loadNectarLink();
    if (existing) return existing;
    const target = hostOrUrl ?? NECTAR_DEFAULT_HOST;
    try {
      const status = await fetchNectarLinkStatus(mnemonic, target);
      if (!status || !status.linked) return null;
      const first = status.stores?.[0];
      const record: NectarLinkRecord = {
        merchantId: status.store_id ?? first?.store_id,
        merchantName: status.merchant_name ?? first?.merchant_name,
        url: nectarStatusUrl(target).replace(/\/status$/, ""),
        linkedAt: Date.parse(status.linked_at ?? first?.linked_at ?? "") || Date.now(),
      };
      saveNectarLink(record);
      return record;
    } catch (e) {
      // Offline / signature rejected / server error — keep local state as-is.
      console.warn("[nectar] link status check failed:", e);
      return null;
    }
  })();
  return statusProbe;
}

/** Forget the memoized probe (e.g. after switching seeds). */
export function resetNectarLinkProbe(): void {
  statusProbe = null;
}
