import { Download, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { versionLabel } from "@/lib/version";
import { apkRelease, apkDownloadUrl, apkSizeLabel } from "@/lib/apk-release";
import { installedAppVersion, nativePlatform } from "@/lib/native/platform";
import { useEffect, useState } from "react";

type LatestRelease = {
  version: string;
  sha256: string;
  sizeLabel: string;
  downloadUrl: string;
};

/**
 * Compares the build baked into this install against the live release manifest.
 *
 * The installed APK ships a frozen copy of apk-release.ts, so a local-only
 * comparison can never detect a newer build. We always ask the server.
 */
export function UpdateCheckCard() {
  const [platform, setPlatform] = useState<string>("web");
  const [latest, setLatest] = useState<LatestRelease | null>(null);
  const [failed, setFailed] = useState(false);
  const [running, setRunning] = useState<string>(apkRelease.version);

  useEffect(() => {
    setPlatform(nativePlatform());
    void installedAppVersion(apkRelease.version).then(setRunning);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("https://beekeeper.money/api/public/apk/latest", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as LatestRelease;
        if (!cancelled && json?.version) setLatest(json);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const latestVersion = latest?.version ?? apkRelease.version;
  const behind = Boolean(latest && compareVersions(latest.version, running) > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCw className="h-4 w-4 text-primary" />
          App version
        </CardTitle>
        <CardDescription>
          {versionLabel()} · build {running}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">Latest Android build</p>
            <p className="text-xs text-muted-foreground">
              {latestVersion} · {latest?.sizeLabel ?? apkSizeLabel()}
            </p>
          </div>
          {failed ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" /> Check failed
            </span>
          ) : behind ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              Update available
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> Up to date
            </span>
          )}
        </div>
        <Button asChild variant={behind ? "default" : "outline"} size="sm" className="w-full">
          <a href={latest?.downloadUrl ?? apkDownloadUrl()} target="_blank" rel="noreferrer">
            <Download className="mr-2 h-4 w-4" />
            Download APK {behind ? `(${latestVersion})` : ""}
          </a>
        </Button>
        {platform === "android" && behind ? (
          <p className="text-xs text-muted-foreground">
            Install the new APK over the top of this one — your seeds stay encrypted on device.
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Key storage</span>
          <span>Encrypted vault, this device only</span>
        </div>
        <p className="break-all text-[11px] leading-relaxed text-muted-foreground">
          SHA-256 {latest?.sha256 ?? apkRelease.sha256}
        </p>
      </CardContent>
    </Card>
  );
}

function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const count = Math.max(left.length, right.length);
  for (let i = 0; i < count; i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}
