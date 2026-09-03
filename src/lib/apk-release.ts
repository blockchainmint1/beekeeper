/**
 * Metadata for the latest Android APK, pinned to IPFS.
 *
 * The APK is content-addressed: the CID below IS the file, so the download can
 * be served from any IPFS gateway and users can verify the SHA-256 themselves.
 * Update all four fields together when a new release is pinned.
 */
export const apkRelease = {
  version: "0.1.202609030255",
  cid: "QmRbegqTrPf12ZsNkZkaRJQxQqBQRGi4hJzXN3SL9cw2Zm",
  fileName: "beekeeper-0.1.202609030255-release.apk",
  /** shasum -a 256 of the exact pinned file. */
  sha256: "f3df430d81c8850e0d1e6e1170f12e02caaa493d83e8f684dd6d262c5899f314",
  sizeBytes: 18706956,
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
