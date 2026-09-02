/**
 * Metadata for the latest Android APK, pinned to IPFS.
 *
 * The APK is content-addressed: the CID below IS the file, so the download can
 * be served from any IPFS gateway and users can verify the SHA-256 themselves.
 * Update all four fields together when a new release is pinned.
 */
export const apkRelease = {
  version: "0.1.202609021351",
  cid: "bafybeidby5be5xmq4xo6keje74a2zbz4d6xr3nyjndst5vtb7aeiqcsl4i",
  fileName: "beekeeper-0.1.202609021351-release.apk",
  /** shasum -a 256 of the exact pinned file. */
  sha256: "b80c1d3a5763b37ec9a6c0aba57005b58c5c098389ee05058747a3575d0ee40f",
  sizeBytes: 18703098,
} as const;

/**
 * Download URL for the pinned APK. Points at our own redirect endpoint so the
 * dedicated Pinata gateway host stays server-side (see routes/api.public.apk).
 */
export function apkDownloadUrl(): string {
  return "https://beekeeper.money/api/public/apk";
}


export function apkSizeLabel(): string {
  return `${(apkRelease.sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
