// Single BIP39 mnemonic vault. Encrypted with the user's passphrase and
// persisted in localStorage. Powers TXC, ISK, and EVM derivation.
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { encryptJson, decryptJson, type EncryptedBlob } from "./crypto";

const VAULT_KEY = "lovable-multi-wallet-vault-v1";
const SESSION_KEY = "lovable-multi-wallet-session-v1";

export interface VaultPayload {
  mnemonic: string;
  createdAt: number;
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

export async function createVault(mnemonic: string, passphrase: string): Promise<void> {
  const blob = await encryptJson(
    { mnemonic, createdAt: Date.now() },
    passphrase,
  );
  saveVault(blob);
  cacheMnemonic(mnemonic);
}

export async function unlockVault(passphrase: string): Promise<string> {
  const blob = loadVault();
  if (!blob) throw new Error("No wallet found");
  const payload = await decryptJson<VaultPayload>(blob, passphrase);
  cacheMnemonic(payload.mnemonic);
  return payload.mnemonic;
}

/** Re-encrypts the existing vault under a new passphrase. */
export async function changePassphrase(current: string, next: string): Promise<void> {
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

/** Import an encrypted vault JSON and replace the current one (passphrase still required to unlock). */
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
  saveVault(blob as EncryptedBlob);
}

export function mnemonicToSeed(mnemonic: string, passphrase = ""): Uint8Array {
  return mnemonicToSeedSync(mnemonic.trim().toLowerCase(), passphrase);
}