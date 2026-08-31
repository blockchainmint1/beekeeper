/**
 * Metadata for the latest Android APK, pinned to IPFS.
 *
 * The APK is content-addressed: the CID below IS the file, so the download can
 * be served from any IPFS gateway and users can verify the SHA-256 themselves.
 * Update all four fields together when a new release is pinned.
 */
export const apkRelease = {
  version: "0.1.202608310501",
  cid: "QmYQX98XqkpxZGF7hgGBnU1dH8VmJvEnWX7YU2KSmEeTfa",
  fileName: "beekeeper-0.1.202608310501-release.apk",
  /** shasum -a 256 of the exact pinned file. */
  sha256: "c28e2089a2256637a0c58997aa39d814ce2488a0030222b73c9880a10e77e6f6",
  sizeBytes: 18674465,
} as const;

/** Public IPFS gateway URL for the pinned APK. */
export function apkDownloadUrl(): string {
  return `https://gateway.pinata.cloud/ipfs/${apkRelease.cid}?filename=${apkRelease.fileName}`;
}

export function apkSizeLabel(): string {
  return `${(apkRelease.sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
