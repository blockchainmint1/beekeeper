// Bitcoin Cash address helpers — thin wrappers around bchaddrjs.
// Used to (a) display addresses in CashAddr form, (b) normalize incoming
// addresses (CashAddr or legacy) to legacy P2PKH before feeding bitcoinjs-lib.
import bchaddr from "bchaddrjs";

/** Convert any BCH address (legacy, CashAddr with or without prefix) to legacy "1…". */
export function toLegacyBch(addr: string): string {
  const trimmed = addr.trim();
  if (!trimmed) throw new Error("Empty address");
  // bchaddrjs requires the prefix on CashAddr inputs.
  const normalized = /:/.test(trimmed) ? trimmed : (isCashAddrLike(trimmed) ? `bitcoincash:${trimmed}` : trimmed);
  return bchaddr.toLegacyAddress(normalized);
}

/** Convert any BCH address to CashAddr form (with the "bitcoincash:" prefix). */
export function toCashAddr(addr: string): string {
  const trimmed = addr.trim();
  if (!trimmed) throw new Error("Empty address");
  if (/:/.test(trimmed)) return bchaddr.toCashAddress(trimmed);
  if (isCashAddrLike(trimmed)) return bchaddr.toCashAddress(`bitcoincash:${trimmed}`);
  return bchaddr.toCashAddress(trimmed);
}

export function isCashAddrLike(addr: string): boolean {
  return /^[qp][a-z0-9]{30,}$/i.test(addr);
}

export function isValidBchAddress(addr: string): boolean {
  try {
    toLegacyBch(addr);
    return true;
  } catch {
    return false;
  }
}