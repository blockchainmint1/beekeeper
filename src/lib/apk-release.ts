/**
 * Metadata for the latest Android APK, pinned to IPFS.
 *
 * The APK is content-addressed: the CID below IS the file, so the download can
 * be served from any IPFS gateway and users can verify the SHA-256 themselves.
 * Update all four fields together when a new release is pinned.
 */
export const apkRelease = {
  version: "0.1.202609030714",
  cid: "QmQEe1rdchxvnJGZSm8YxXHkPXfUZfn12md6zeS8ZgK7mj",
  fileName: "beekeeper-0.1.202609030714-release.apk",
  /** shasum -a 256 of the exact pinned file. */
  sha256: "648054dcf9d58b7452d3a5a5e6b87bc6d8e5e5cb8a14138fd075a9bdfb55615c",
  sizeBytes: 18712421,
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
