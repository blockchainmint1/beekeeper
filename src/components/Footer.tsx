import { Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { versionLabel } from "@/lib/version";
import { apkDownloadUrl, apkRelease, apkSizeLabel } from "@/lib/apk-release";
import { nativePlatform } from "@/lib/native/platform";

/**
 * Android APK download. Web only — Apple forbids linking to alternative app
 * distribution from inside an iOS app, and the Android build ships from the
 * Play listing, so this renders exclusively in a browser.
 */
function ApkDownload() {
  const [isWeb, setIsWeb] = useState(false);
  useEffect(() => setIsWeb(nativePlatform() === "web"), []);
  if (!isWeb) return null;

  return (
    <div className="space-y-1">
      <a
        href={apkDownloadUrl()}
        className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Download Android APK ({apkSizeLabel()})
      </a>
      <p className="font-mono text-[10px] text-muted-foreground/60">
        v{apkRelease.version} · IPFS {apkRelease.cid.slice(0, 10)}…{apkRelease.cid.slice(-6)}
      </p>
      <p className="break-all font-mono text-[10px] text-muted-foreground/50">
        sha256 {apkRelease.sha256}
      </p>
    </div>
  );
}

/**
 * Shared site footer. Required on every public surface — the app stores need a
 * reachable Privacy Policy and Terms link, and every honest.money property
 * carries the ecosystem link.
 */
export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background/60 px-4 py-8 text-center">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-xs text-muted-foreground">
          Part of the{" "}
          <a
            href="https://honest.money"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            honest.money
          </a>{" "}
          ecosystem.
        </p>

        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <Link to="/manifesto" className="hover:text-foreground">
            Manifesto
          </Link>
          <span aria-hidden>·</span>
          <a
            href="https://texitcoin.org/build"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Build on TEXITcoin
          </a>
        </nav>

        <p className="text-[11px] text-muted-foreground/70">
          Beekeeper is a self-custody wallet. You hold your own keys — no one, including us, can
          move, freeze, or recover your funds.
        </p>

        <p className="font-mono text-[10px] text-muted-foreground/60">{versionLabel()}</p>
      </div>
    </footer>
  );
}
