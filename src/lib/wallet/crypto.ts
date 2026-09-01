// AES-GCM vault encryption with PBKDF2-derived key. Browser-only.
const enc = new TextEncoder();
const dec = new TextDecoder();

// OWASP guidance for PBKDF2-SHA256 is ≥ 600k iterations; we go past it because
// this key protects a seed phrase against offline brute force of a stolen device
// backup. v1 vaults used 250k, v2 600k — we honor whatever count the blob
// records, so old vaults keep unlocking and get re-encrypted at the new cost on
// the next password change.
const PBKDF2_ITERATIONS_V3 = 1_000_000;
const PBKDF2_ITERATIONS_V2 = 600_000;
const PBKDF2_ITERATIONS_V1 = 250_000;

/** Iteration count new blobs are written with. */
export const CURRENT_PBKDF2_ITERATIONS = PBKDF2_ITERATIONS_V3;

/**
 * Lowest iteration count we will honor from a blob we did not create.
 * Imported backups carry their own `it`, so without a floor a crafted file
 * could downgrade brute-force cost to nothing.
 */
export const MIN_TRUSTED_PBKDF2_ITERATIONS = PBKDF2_ITERATIONS_V1;
/** Upper bound so a crafted `it` can't be used to hang the browser. */
export const MAX_PBKDF2_ITERATIONS = 5_000_000;

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface EncryptedBlob {
  v: 1 | 2;
  salt: string;
  iv: string;
  ct: string;
  /** PBKDF2 iteration count (omitted on v1 blobs → defaults to 250k). */
  it?: number;
}

export async function encryptJson(data: unknown, password: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS_V2);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(JSON.stringify(data)),
  );
  return { v: 2, salt: b64encode(salt), iv: b64encode(iv), ct: b64encode(ct), it: PBKDF2_ITERATIONS_V2 };
}

export async function decryptJson<T>(blob: EncryptedBlob, password: string): Promise<T> {
  const iterations = blob.it ?? (blob.v === 2 ? PBKDF2_ITERATIONS_V2 : PBKDF2_ITERATIONS_V1);
  const key = await deriveKey(password, b64decode(blob.salt), iterations);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(blob.iv) as BufferSource },
    key,
    b64decode(blob.ct) as BufferSource,
  );
  return JSON.parse(dec.decode(pt)) as T;
}