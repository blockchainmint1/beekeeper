/**
 * Metadata for the latest Android APK, pinned to IPFS.
 *
 * The APK is content-addressed: the CID below IS the file, so the download can
 * be served from any IPFS gateway and users can verify the SHA-256 themselves.
 * Update all four fields together when a new release is pinned.
 */
export const apkRelease = {
  version: "0.1.202609010921",
  cid: "QmPZ7HUZoLJ4dw9Ss829i3N3v2Tqe7p4RSJVcMRGZSCndA",
  fileName: "beekeeper-0.1.202609010921-release.apk",
  /** shasum -a 256 of the exact pinned file. */
  sha256: "9c47489f5f4ac1fc58d2cd2aa3b9c7dc9f6b7b33a784ffb88419423ffd660d0f",
  sizeBytes: 18675269,
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
