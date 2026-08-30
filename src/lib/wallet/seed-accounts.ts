/* ─── Multi-seed vault registry ───
   Beekeeper stores one *active* encrypted vault (see ./seed) so every derivation
   path in the app keeps working untouched. This module keeps a registry of all
   the seeds the user has added and swaps the active vault blob when they switch.

   Each entry keeps its own encrypted blob, so seeds can have different
   passwords. Switching locks the wallet: the new seed must be unlocked. */
import { encryptJson, decryptJson, type EncryptedBlob } from "./crypto";
import {
  loadVault,
  saveVault,
  clearCachedMnemonic,
  isValidMnemonic,
  vaultFingerprint,
  type VaultPayload,
} from "./seed";

const REGISTRY_KEY = "beekeeper-seed-accounts-v1";
const FP_KEY = "lovable-multi-wallet-vault-fp-v1";
const NECTAR_LINK_KEY = "lovable-multi-wallet-nectar-link-v1";

export interface SeedAccount {
  id: string;
  label: string;
  /** First 16 hex chars of sha256(mnemonic) — safe to store, not reversible. */
  fingerprint: string;
  blob: EncryptedBlob;
  createdAt: number;
}

interface Registry {
  accounts: SeedAccount[];
  activeId: string | null;
}

const EMPTY: Registry = { accounts: [], activeId: null };

function read(): Registry {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Registry;
    if (!parsed || !Array.isArray(parsed.accounts)) return EMPTY;
    return { accounts: parsed.accounts, activeId: parsed.activeId ?? null };
  } catch {
    return EMPTY;
  }
}

function write(reg: Registry): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Adopts a pre-existing single vault into the registry the first time. */
export function ensureRegistry(): Registry {
  if (typeof window === "undefined") return EMPTY;
  const reg = read();
  const existing = loadVault();
  if (reg.accounts.length === 0 && existing) {
    const id = newId();
    const adopted: Registry = {
      accounts: [
        {
          id,
          label: "Queen seed",
          fingerprint: localStorage.getItem(FP_KEY) ?? "",
          blob: existing,
          createdAt: Date.now(),
        },
      ],
      activeId: id,
    };
    write(adopted);
    return adopted;
  }
  return reg;
}

export function listSeedAccounts(): SeedAccount[] {
  return ensureRegistry().accounts;
}

export function getActiveSeedAccountId(): string | null {
  return ensureRegistry().activeId;
}

export function getActiveSeedAccount(): SeedAccount | null {
  const reg = ensureRegistry();
  return reg.accounts.find((a) => a.id === reg.activeId) ?? null;
}

/** Keeps the registry copy of the active blob in step with the live vault
 *  (e.g. after a password change re-encrypts it). */
export function syncActiveBlob(): void {
  const reg = ensureRegistry();
  const blob = loadVault();
  if (!blob || !reg.activeId) return;
  const next = reg.accounts.map((a) =>
    a.id === reg.activeId ? { ...a, blob } : a,
  );
  write({ ...reg, accounts: next });
}

/** Records the fingerprint of the active seed once it has been unlocked. */
export function noteActiveFingerprint(mnemonic: string): void {
  const reg = ensureRegistry();
  if (!reg.activeId) return;
  const fp = vaultFingerprint(mnemonic);
  const next = reg.accounts.map((a) =>
    a.id === reg.activeId ? { ...a, fingerprint: fp } : a,
  );
  write({ ...reg, accounts: next });
}

export interface AddSeedInput {
  mnemonic: string;
  password: string;
  label?: string;
}

/** Encrypts and stores an extra seed. Does not switch to it. */
export async function addSeedAccount({
  mnemonic,
  password,
  label,
}: AddSeedInput): Promise<SeedAccount> {
  const clean = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
  if (!isValidMnemonic(clean)) throw new Error("That recovery phrase isn't valid");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const reg = ensureRegistry();
  const fingerprint = vaultFingerprint(clean);
  if (reg.accounts.some((a) => a.fingerprint === fingerprint)) {
    throw new Error("That seed is already in this wallet");
  }

  const blob = await encryptJson(
    { mnemonic: clean, createdAt: Date.now() },
    password,
  );
  const account: SeedAccount = {
    id: newId(),
    label: label?.trim() || `Seed ${reg.accounts.length + 1}`,
    fingerprint,
    blob,
    createdAt: Date.now(),
  };
  write({ accounts: [...reg.accounts, account], activeId: reg.activeId ?? account.id });
  if (!reg.activeId) saveVault(blob);
  return account;
}

export function renameSeedAccount(id: string, label: string): void {
  const reg = ensureRegistry();
  const next = reg.accounts.map((a) =>
    a.id === id ? { ...a, label: label.trim() || a.label } : a,
  );
  write({ ...reg, accounts: next });
}

/**
 * Makes `id` the active vault. The wallet locks afterwards — the caller should
 * send the user to the unlock screen.
 */
export function switchSeedAccount(id: string): void {
  const reg = ensureRegistry();
  const target = reg.accounts.find((a) => a.id === id);
  if (!target) throw new Error("Seed not found");
  syncActiveBlob();
  const after = read();
  write({ ...after, activeId: id });
  saveVault(target.blob);
  // Seed-scoped state must not leak across the switch.
  clearCachedMnemonic();
  localStorage.removeItem(FP_KEY);
  localStorage.removeItem(NECTAR_LINK_KEY);
}

/** Removes a stored seed. Cannot remove the last one — use the danger zone. */
export function removeSeedAccount(id: string): void {
  const reg = ensureRegistry();
  if (reg.accounts.length <= 1) {
    throw new Error("This is your only seed — use Danger zone to erase the wallet");
  }
  const remaining = reg.accounts.filter((a) => a.id !== id);
  const wasActive = reg.activeId === id;
  write({ accounts: remaining, activeId: wasActive ? remaining[0].id : reg.activeId });
  if (wasActive) {
    saveVault(remaining[0].blob);
    clearCachedMnemonic();
    localStorage.removeItem(FP_KEY);
    localStorage.removeItem(NECTAR_LINK_KEY);
  }
}

/** Verifies a password unlocks a stored seed without switching to it. */
export async function peekSeedAccount(id: string, password: string): Promise<string> {
  const account = ensureRegistry().accounts.find((a) => a.id === id);
  if (!account) throw new Error("Seed not found");
  const payload = await decryptJson<VaultPayload>(account.blob, password);
  return payload.mnemonic;
}

export function wipeSeedRegistry(): void {
  try {
    localStorage.removeItem(REGISTRY_KEY);
  } catch {
    /* ignore */
  }
}
