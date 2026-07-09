/**
 * Biometric unlock for Beekeeper.
 *
 * Design:
 *  - The wallet is always encrypted on disk with the user's password (see
 *    src/lib/wallet/crypto.ts + seed.ts). That never changes.
 *  - When the user opts in to Face ID / fingerprint unlock, we store the
 *    plaintext password in the platform secure store (iOS Keychain, Android
 *    Keystore) via @aparajita/capacitor-secure-storage.
 *  - To retrieve it we first call BiometricAuth.authenticate() — the user has
 *    to pass Face ID / Touch ID / fingerprint before we read the password
 *    back and feed it into the normal unlockVault() flow.
 *  - The password is always still required as a recovery fallback and for
 *    sensitive actions (revealing the seed phrase).
 *
 * On the web (Lovable preview, browser) all of this is a no-op:
 * `isBiometricAvailable()` returns false and `enableBiometric()` throws.
 */
import { isNative } from "./platform";

const SECURE_KEY = "beekeeper.bio.password.v1";
const FLAG_KEY = "beekeeper.bio.enabled.v1";

export interface BiometricStatus {
  available: boolean;
  enabled: boolean;
}

async function loadPlugins() {
  if (!isNative()) return null;
  const [{ BiometricAuth }, { SecureStorage }] = await Promise.all([
    import("@aparajita/capacitor-biometric-auth"),
    import("@aparajita/capacitor-secure-storage"),
  ]);
  return { BiometricAuth, SecureStorage };
}

export async function isBiometricAvailable(): Promise<boolean> {
  const plugins = await loadPlugins();
  if (!plugins) return false;
  try {
    const info = await plugins.BiometricAuth.checkBiometry();
    return info.isAvailable === true;
  } catch {
    return false;
  }
}

let cachedFlag: boolean | null = null;

async function readFlag(): Promise<boolean> {
  if (cachedFlag !== null) return cachedFlag;
  const plugins = await loadPlugins();
  if (!plugins) { cachedFlag = false; return false; }
  try {
    const v = await plugins.SecureStorage.get(FLAG_KEY, true, false).catch(() => null);
    cachedFlag = v === "1";
    return cachedFlag;
  } catch {
    cachedFlag = false;
    return false;
  }
}

export function isBiometricEnabledSync(): boolean {
  return cachedFlag === true;
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  const available = await isBiometricAvailable();
  const enabled = available ? await readFlag() : false;
  return { available, enabled };
}

/**
 * Store the wallet password in the OS secure store so the user can unlock
 * with biometrics on the next launch. Requires the caller to already have a
 * verified password.
 */
export async function enableBiometric(password: string): Promise<void> {
  const plugins = await loadPlugins();
  if (!plugins) throw new Error("Biometric unlock is only available on the mobile app.");
  await plugins.BiometricAuth.authenticate({
    reason: "Enable Face ID / fingerprint unlock for Beekeeper",
    cancelTitle: "Cancel",
    allowDeviceCredential: false,
    iosFallbackTitle: "Use Passcode",
    androidTitle: "Enable biometric unlock",
    androidSubtitle: "Confirm your identity to enable biometric unlock",
  });
  await plugins.SecureStorage.set(SECURE_KEY, password, true, false);
  await plugins.SecureStorage.set(FLAG_KEY, "1", true, false);
  cachedFlag = true;
}

export async function disableBiometric(): Promise<void> {
  const plugins = await loadPlugins();
  if (plugins) {
    try { await plugins.SecureStorage.remove(SECURE_KEY); } catch { /* ignore */ }
    try { await plugins.SecureStorage.remove(FLAG_KEY); } catch { /* ignore */ }
  }
  cachedFlag = false;
}

/**
 * Prompt for biometrics and return the stored password on success.
 * Returns null if the user cancels or biometrics is not enabled.
 */
export async function unlockWithBiometric(): Promise<string | null> {
  const plugins = await loadPlugins();
  if (!plugins) return null;
  const enabled = await readFlag();
  if (!enabled) return null;
  try {
    await plugins.BiometricAuth.authenticate({
      reason: "Unlock your Beekeeper wallet",
      cancelTitle: "Use password",
      allowDeviceCredential: false,
      iosFallbackTitle: "Use Passcode",
      androidTitle: "Unlock wallet",
      androidSubtitle: "Confirm your identity",
    });
    const pw = await plugins.SecureStorage.get(SECURE_KEY, true, false);
    return typeof pw === "string" ? pw : null;
  } catch {
    return null;
  }
}
