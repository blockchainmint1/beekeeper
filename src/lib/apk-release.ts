/**
 * Metadata for the latest Android APK, pinned to IPFS.
 *
 * The APK is content-addressed: the CID below IS the file, so the download can
 * be served from any IPFS gateway and users can verify the SHA-256 themselves.
 * Update all four fields together when a new release is pinned.
 */
export const apkRelease = {
  version: "0.1.202609011326",
  cid: "QmaeismkZaq84zDYye4vsuBdfLeWexQXh8PMySCaUYyqK1",
  fileName: "beekeeper-0.1.202609011326-release.apk",
  /** shasum -a 256 of the exact pinned file. */
  sha256: "04c00b40afae309cec4da0f77238492baca9813050964b97fe5cc6d194c2705e",
  sizeBytes: 18691265,
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
