// APK download redirect. Keeps the dedicated Pinata gateway host (PINATA_GW)
// on the server and falls back to the shared public gateway if unset.

import { apkRelease } from "@/lib/apk-release";
import { env } from "@/lib/server-env";
import { createFileRoute } from "@tanstack/react-router";

function gatewayHost(): string {
  const raw = (env("PINATA_GW") || "").trim();
  if (!raw) return "gateway.pinata.cloud";
  // Accept a bare host or a full URL.
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).host;
  } catch {
    return "gateway.pinata.cloud";
  }
}

export const Route = createFileRoute("/api/public/apk")({
  server: {
    handlers: {
      GET: () => {
        const url = `https://${gatewayHost()}/ipfs/${apkRelease.cid}?filename=${apkRelease.fileName}`;
        return new Response(null, {
          status: 302,
          headers: { location: url, "cache-control": "no-store" },
        });
      },
    },
  },
});
