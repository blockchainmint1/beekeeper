import { Download, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_VERSION, versionLabel } from "@/lib/version";
import { apkRelease, apkDownloadUrl, apkSizeLabel } from "@/lib/apk-release";
import { nativePlatform } from "@/lib/native/platform";
import { useEffect, useState } from "react";

/**
 * Shows the running build against the latest pinned Android release so APK
 * users (who get no store auto-update) can tell when they're behind.
 */
export function UpdateCheckCard() {
  const [platform, setPlatform] = useState<string>("web");
  useEffect(() => setPlatform(nativePlatform()), []);

  const latest: string = apkRelease.version;
  const running: string = APP_VERSION;
  const behind = platform === "android" && latest !== running;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCw className="h-4 w-4 text-primary" />
          App version
        </CardTitle>
        <CardDescription>{versionLabel()}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">Latest Android build</p>
            <p className="text-xs text-muted-foreground">
              {latest} · {apkSizeLabel()}
            </p>
          </div>
          {behind ? (
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
          <a href={apkDownloadUrl()} target="_blank" rel="noreferrer">
            <Download className="mr-2 h-4 w-4" />
            Download APK
          </a>
        </Button>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Key storage</span>
          <span>Encrypted vault, this device only</span>
        </div>
        <p className="break-all text-[11px] leading-relaxed text-muted-foreground">
          SHA-256 {apkRelease.sha256}
        </p>
      </CardContent>
    </Card>
  );
}
