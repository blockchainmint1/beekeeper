/**
 * Metadata for the latest Android APK, pinned to IPFS.
 *
 * The APK is content-addressed: the CID below IS the file, so the download can
 * be served from any IPFS gateway and users can verify the SHA-256 themselves.
 * Update all four fields together when a new release is pinned.
 */
export const apkRelease = {
  version: "0.1.202609021154",
  cid: "QmeR7GwHsiHXFxPDpqAu8LjUufP1RhnsgQXAmToJUGxYy1",
  fileName: "beekeeper-0.1.202609021154-release.apk",
  /** shasum -a 256 of the exact pinned file. */
  sha256: "c0b69f0ba1bc6ae32f84728ada874f4eae4f486be7c3fd8cd3047942c8d4be8a",
  sizeBytes: 18697528,
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
