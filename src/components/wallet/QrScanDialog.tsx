import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QrScanner from "qr-scanner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageUp, ScanLine, X } from "lucide-react";

/**
 * Full-screen QR scanner overlay. Rendered straight into <body> so no dialog
 * animation, transform, or overflow container can stop the camera from
 * appearing — Chrome on Android was the problem child here.
 */
export function QrScanDialog({
  open,
  onOpenChange,
  onResult,
  title = "Scan QR code",
  description = "Point your camera at a payment QR. Standard BIP21 URIs like bitcoin:… or texitcoin:…?amount= are supported.",
  helpLink,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onResult: (text: string) => void;
  title?: string;
  description?: string;
  helpLink?: { label: string; href: string };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stopScanner() {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
  }

  useEffect(() => stopScanner, []);

  useEffect(() => {
    if (!open) {
      stopScanner();
      setReady(false);
      setManual("");
      setShowManual(false);
      setError(null);
      return;
    }
    let cancelled = false;

    (async () => {
      // Wait for the video element to be committed to the DOM.
      let video: HTMLVideoElement | null = null;
      for (let i = 0; i < 30 && !video; i++) {
        video = videoRef.current;
        if (!video) await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      if (cancelled) return;
      if (!video) {
        setError("Could not open the camera view. Use a photo instead.");
        return;
      }
      try {
        const s = new QrScanner(
          video,
          (result) => {
            stopScanner();
            onResult(result.data);
            onOpenChange(false);
          },
          {
            highlightScanRegion: true,
            highlightCodeOutline: true,
            preferredCamera: "environment",
            maxScansPerSecond: 8,
            returnDetailedScanResult: true,
          },
        );
        scannerRef.current = s;
        await s.start();
        if (cancelled) {
          stopScanner();
          return;
        }
        setReady(true);
      } catch (e: unknown) {
        if (cancelled) return;
        stopScanner();
        setError(cameraErrorMessage(e));
      }
    })();

    return () => {
      cancelled = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function scanFromFile(file: File) {
    setError(null);
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      onResult(result.data);
      onOpenChange(false);
    } catch {
      setError("No QR code found in that photo. Try a closer, sharper shot.");
    }
  }

  function submitManual() {
    const t = manual.trim();
    if (!t) return;
    onResult(t);
    onOpenChange(false);
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white">
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <ScanLine className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-[11px] text-white/60">{description}</p>
        </div>
        <button
          aria-label="Close scanner"
          className="rounded-full p-2 hover:bg-white/10"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          autoPlay
          playsInline
          disablePictureInPicture
        />
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-xs text-white/70">
            Starting camera…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-white/80">
            {error}
          </div>
        )}
      </div>

      <div
        className="space-y-2 px-4 py-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => fileRef.current?.click()}
          >
            <ImageUp className="mr-1.5 h-4 w-4" /> Use a photo
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => setShowManual((v) => !v)}
          >
            Paste instead
          </Button>
        </div>

        {showManual && (
          <div>
            <Textarea
              rows={3}
              className="bg-white/10 font-mono text-[11px] text-white placeholder:text-white/40"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="word word word… or bitcoin:bc1q…?amount=0.01"
            />
            <Button size="sm" className="mt-2 w-full" disabled={!manual.trim()} onClick={submitManual}>
              Use pasted text
            </Button>
          </div>
        )}

        {helpLink && (
          <p className="text-center text-[11px] text-white/60">
            <a href={helpLink.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {helpLink.label}
            </a>
          </p>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void scanFromFile(f);
        }}
      />
    </div>,
    document.body,
  );
}

function cameraErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || /permission|denied/i.test(raw)) {
    return "Camera access was blocked. Allow camera for this site in your browser settings, then try again — or use a photo instead.";
  }
  if (name === "NotFoundError" || /no camera/i.test(raw)) {
    return "No camera found on this device. Use a photo or paste the phrase.";
  }
  if (name === "NotReadableError" || /in use|track start/i.test(raw)) {
    return "The camera is busy in another app or tab. Close it and try again.";
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Camera needs a secure (https) connection.";
  }
  return raw || "Camera unavailable";
}
