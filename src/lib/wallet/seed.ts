// Single BIP39 mnemonic vault. Encrypted with the user's password and
// persisted in localStorage. Powers TXC, ISK, and EVM derivation.
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  encryptJson,
  decryptJson,
  MIN_TRUSTED_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  type EncryptedBlob,
} from "./crypto";

/** Shortest password we'll encrypt a seed under. */
export const MIN_PASSWORD_LENGTH = 8;

function assertStrongEnough(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

const VAULT_KEY = "lovable-multi-wallet-vault-v1";
const SESSION_KEY = "lovable-multi-wallet-session-v1";
const FP_KEY = "lovable-multi-wallet-vault-fp-v1";
// Kept in sync with LINK_KEY in ./nectar (imported literally to avoid a cycle).
const NECTAR_LINK_KEY = "lovable-multi-wallet-nectar-link-v1";

export interface VaultPayload {
  mnemonic: string;
  createdAt: number;
}

/* ─── Vault fingerprint ───
   A non-reversible id for "which seed is this?", so per-wallet state (e.g. the
   Nectar Pay merchant link) can't leak across a wipe + fresh seed import. */

export function vaultFingerprint(mnemonic: string): string {
  const bytes = sha256(new TextEncoder().encode(mnemonic.trim().toLowerCase()));
  return Array.from(bytes.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getVaultFingerprint(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(FP_KEY);
}

export function rememberVaultFingerprint(mnemonic: string): void {
  try {
    localStorage.setItem(FP_KEY, vaultFingerprint(mnemonic));
  } catch {
    /* ignore */
  }
}

export function loadVault(): EncryptedBlob | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EncryptedBlob;
  } catch {
    return null;
  }
}

export function saveVault(blob: EncryptedBlob): void {
  localStorage.setItem(VAULT_KEY, JSON.stringify(blob));
}

export function wipeVault(): void {
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(FP_KEY);
  // Merchant links belong to the seed that made them.
  localStorage.removeItem(NECTAR_LINK_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function hasVault(): boolean {
  return loadVault() !== null;
}


// In-memory unlocked mnemonic (persisted to sessionStorage so a reload while
// the tab is open keeps the wallet unlocked).
export function cacheMnemonic(mnemonic: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, mnemonic);
  } catch {
    /* ignore */
  }
}

export function getCachedMnemonic(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SESSION_KEY);
}

export function clearCachedMnemonic(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function createMnemonic(strength: 128 | 256 = 128): string {
  return generateMnemonic(wordlist, strength);
}

export function isValidMnemonic(m: string): boolean {
  return validateMnemonic(m.trim().toLowerCase(), wordlist);
}

export async function createVault(mnemonic: string, password: string): Promise<void> {
  assertStrongEnough(password);
  const blob = await encryptJson(
    { mnemonic, createdAt: Date.now() },
    password,
  );
  saveVault(blob);
  rememberVaultFingerprint(mnemonic);
  cacheMnemonic(mnemonic);
}

export async function unlockVault(password: string): Promise<string> {
  const blob = loadVault();
  if (!blob) throw new Error("No wallet found");
  const payload = await decryptJson<VaultPayload>(blob, password);
  rememberVaultFingerprint(payload.mnemonic);
  cacheMnemonic(payload.mnemonic);
  return payload.mnemonic;

}

/** Re-encrypts the existing vault under a new password. */
export async function changePassword(current: string, next: string): Promise<void> {
  assertStrongEnough(next);
  const blob = loadVault();
  if (!blob) throw new Error("No wallet found");
  const payload = await decryptJson<VaultPayload>(blob, current);
  const reencrypted = await encryptJson(payload, next);
  saveVault(reencrypted);
}

/** Returns the encrypted vault as a downloadable JSON string. */
export function exportVaultJson(): string | null {
  const blob = loadVault();
  return blob ? JSON.stringify(blob, null, 2) : null;
}

/** Trigger a browser download of the encrypted vault JSON. */
export function downloadVaultBackup(filename = `wallet-backup-${new Date().toISOString().slice(0, 10)}.json`): boolean {
  const json = exportVaultJson();
  if (!json) return false;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markVaultBackedUp();
  return true;
}

const BACKUP_KEY = "quad-wallet-backed-up";

/** Record that the user has downloaded an encrypted backup at least once. */
export function markVaultBackedUp(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(BACKUP_KEY, new Date().toISOString());
}

/** Returns ISO timestamp of the last backup download, or null if never. */
export function getLastBackupAt(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(BACKUP_KEY);
}

export function isVaultBackedUp(): boolean {
  return getLastBackupAt() !== null;
}

/** Import an encrypted vault JSON and replace the current one (password still required to unlock). */
export function importVaultBlob(json: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid backup file (not JSON)");
  }
  const blob = parsed as Partial<EncryptedBlob>;
  if (!blob || typeof blob !== "object" || !blob.ct || !blob.iv || !blob.salt) {
    throw new Error("Backup file is missing required fields");
  }
  if (blob.v !== undefined && blob.v !== 1 && blob.v !== 2) {
    throw new Error("Unsupported backup version");
  }
  // A backup carries its own PBKDF2 iteration count. Refuse anything that
  // would weaken key stretching (or that would hang the browser).
  if (blob.it !== undefined) {
    if (
      typeof blob.it !== "number" ||
      !Number.isFinite(blob.it) ||
      blob.it < MIN_TRUSTED_PBKDF2_ITERATIONS ||
      blob.it > MAX_PBKDF2_ITERATIONS
    ) {
      throw new Error("Backup file has unsafe encryption settings — refusing to import");
    }
  }
  saveVault(blob as EncryptedBlob);
  // Unknown seed until it's unlocked — drop any seed-scoped state.
  localStorage.removeItem(FP_KEY);

}

export function mnemonicToSeed(mnemonic: string, passphrase = ""): Uint8Array {
  return mnemonicToSeedSync(mnemonic.trim().toLowerCase(), passphrase);
}