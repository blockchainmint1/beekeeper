/**
 * Cold Storage Coin Asset ID.
 *
 * The six-character Asset ID printed on a coin's sticker is a deterministic
 * slice of the public key: the six characters after the leading network
 * character (or after `0x` on EVM). Must match the Cold Storage Coins backend
 * derivation exactly — never invent a new scheme.
 */

/** Six-character Asset ID for this address, or null when it can't be derived. */
export function assetIdForAddress(address: string): string | null {
  const a = address.trim();
  if (!a) return null;
  if (/^0x[0-9a-fA-F]{40}$/.test(a)) return a.slice(2, 8).toUpperCase();
  if (a.length < 8) return null;
  return a.slice(1, 7);
}
