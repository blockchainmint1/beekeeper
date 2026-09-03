// Live "latest Android release" manifest.
//
// The installed APK carries a build-time copy of apk-release.ts, so it can
// never learn about newer releases on its own. It fetches this endpoint to
// compare its baked version against what the server currently ships.

import { apkRelease, apkSizeLabel } from "@/lib/apk-release";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/apk/latest")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({
            version: apkRelease.version,
            fileName: apkRelease.fileName,
            cid: apkRelease.cid,
            sha256: apkRelease.sha256,
            sizeBytes: apkRelease.sizeBytes,
            sizeLabel: apkSizeLabel(),
            downloadUrl: "https://beekeeper.money/api/public/apk",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              // Short cache: new pins must show up quickly.
              "cache-control": "public, max-age=60",
              "access-control-allow-origin": "*",
            },
          },
        ),
    },
  },
});
