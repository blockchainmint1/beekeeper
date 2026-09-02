// APK download. Keeps the dedicated Pinata gateway host (PINATA_GW) on the
// server and falls back to the shared public gateway if unset.
//
// This proxies rather than redirects on purpose: IPFS gateways serve the APK as
// application/zip (or octet-stream), and Chrome then renames the download to
// "...apk.zip", which Android refuses to install. Streaming it back ourselves
// lets us pin the correct Android package MIME type + Content-Disposition
// filename so the file lands on disk as a real .apk.

import { apkRelease } from "@/lib/apk-release";
import { env } from "@/lib/server-env";
import { createFileRoute } from "@tanstack/react-router";

const APK_MIME = "application/vnd.android.package-archive";

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

function upstreamUrl(): string {
  return `https://${gatewayHost()}/ipfs/${apkRelease.cid}`;
}

function downloadHeaders(upstream: Response): Headers {
  const h = new Headers();
  h.set("content-type", APK_MIME);
  h.set("content-disposition", `attachment; filename="${apkRelease.fileName}"`);
  // Content-addressed: safe to cache hard.
  h.set("cache-control", "public, max-age=31536000, immutable");
  h.set("x-content-type-options", "nosniff");
  const len = upstream.headers.get("content-length");
  if (len) h.set("content-length", len);
  const ranges = upstream.headers.get("accept-ranges");
  if (ranges) h.set("accept-ranges", ranges);
  return h;
}

export const Route = createFileRoute("/api/public/apk")({
  server: {
    handlers: {
      HEAD: async () => {
        const upstream = await fetch(upstreamUrl(), { method: "HEAD" });
        if (!upstream.ok) {
          return new Response(null, { status: 502 });
        }
        return new Response(null, { status: 200, headers: downloadHeaders(upstream) });
      },
      GET: async ({ request }) => {
        const range = request.headers.get("range");
        const upstream = await fetch(upstreamUrl(), {
          headers: range ? { range } : undefined,
        });
        if (!upstream.ok && upstream.status !== 206) {
          return new Response("APK unavailable", { status: 502 });
        }
        const headers = downloadHeaders(upstream);
        const contentRange = upstream.headers.get("content-range");
        if (contentRange) headers.set("content-range", contentRange);
        return new Response(upstream.body, { status: upstream.status, headers });
      },
    },
  },
});
