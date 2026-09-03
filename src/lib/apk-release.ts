/**
 * Metadata for the latest Android APK, pinned to IPFS.
 *
 * The APK is content-addressed: the CID below IS the file, so the download can
 * be served from any IPFS gateway and users can verify the SHA-256 themselves.
 * Update all four fields together when a new release is pinned.
 */
export const apkRelease = {
  version: "0.1.202609030526",
  cid: "QmRLJEJouBgAbx7RQXKw82gs5D9cKqTAzKAjGK8q1dwLwr",
  fileName: "beekeeper-0.1.202609030526-release.apk",
  /** shasum -a 256 of the exact pinned file. */
  sha256: "a9db233f9d9cb979941e81af22e582dbe0c328633c3885c27ff39ee0a1a181ce",
  sizeBytes: 18708800,
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
