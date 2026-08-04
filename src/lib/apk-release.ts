/**
 * Metadata for the latest Android APK, pinned to IPFS.
 *
 * The APK is content-addressed: the CID below IS the file, so the download can
 * be served from any IPFS gateway and users can verify the SHA-256 themselves.
 * Update all four fields together when a new release is pinned.
 */
export const apkRelease = {
  version: "0.1.202608041050",
  cid: "QmNmJhf5sJ9J16nt88fveZBK2dn6wpGFkoXbC1j6guScwr",
  fileName: "beekeeper-0.1.202608041050-release.apk",
  /** shasum -a 256 of the exact pinned file. */
  sha256: "fdb0c5ca2c47d49205249ecd69fab19bfabce26066ec1a58695bfee40cce2152",
  sizeBytes: 18444706,
} as const;

/** Public IPFS gateway URL for the pinned APK. */
export function apkDownloadUrl(): string {
  return `https://gateway.pinata.cloud/ipfs/${apkRelease.cid}?filename=${apkRelease.fileName}`;
}

export function apkSizeLabel(): string {
  return `${(apkRelease.sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
