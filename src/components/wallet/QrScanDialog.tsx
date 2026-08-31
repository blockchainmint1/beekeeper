import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageUp, ScanLine } from "lucide-react";

/** Lightweight QR scanner dialog. Calls onResult with the raw decoded text. */
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
  const [phase, setPhase] = useState<"idle" | "starting" | "scan">("idle");
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);

  function stopScanner() {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
  }

  useEffect(() => {
    if (!open) {
      stopScanner();
      setPhase("idle");
      setManual("");
      setError(null);
    }
  }, [open]);

  // Unmount safety — a torn-down dialog must release the camera.
  useEffect(() => stopScanner, []);

  // Start the camera only once the <video> element is actually in the DOM.
  // Chrome on Android silently no-ops when start() runs before the element
  // exists (Radix animates the dialog content in), so wait for the ref.
  useEffect(() => {
    if (!open || phase !== "starting") return;
    let cancelled = false;

    (async () => {
      const video = await waitForRef(videoRef);
      if (cancelled) return;
      if (!video) {
        setError("Could not open the camera view. Try the photo option below.");
        setPhase("idle");
        return;
      }
      try {
        if (!(await QrScanner.hasCamera())) {
          throw new Error("No camera found on this device");
        }
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
            returnDetailedScanResult: true,
          },
        );
        scannerRef.current = s;
        await s.start();
        if (cancelled) {
          stopScanner();
          return;
        }
        setPhase("scan");
      } catch (e: unknown) {
        if (cancelled) return;
        stopScanner();
        setError(cameraErrorMessage(e));
        setPhase("idle");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, phase, onResult, onOpenChange]);

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

  const showCamera = phase !== "idle";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Kept mounted so the scanner always has a live element to attach to. */}
          <div
            className={
              showCamera
                ? "relative aspect-square w-full overflow-hidden rounded-xl bg-black"
                : "hidden"
            }
          >
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              autoPlay
              playsInline
              disablePictureInPicture
            />
            {phase === "starting" && (
              <div className="absolute inset-0 grid place-items-center text-xs text-white/80">
                Starting camera…
              </div>
            )}
          </div>

          {!showCamera && (
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-muted/30 py-10 text-center">
              <ScanLine className="h-10 w-10 text-muted-foreground" />
              <Button onClick={() => setPhase("starting")}>
                <ScanLine className="mr-1.5 h-4 w-4" /> Start camera
              </Button>
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                <ImageUp className="mr-1.5 h-4 w-4" /> Use a photo instead
              </Button>
            </div>
          )}

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

          {error && <p className="text-xs text-destructive">{error}</p>}

          {!showCamera && (
            <>
              {helpLink && (
                <p className="text-center text-xs text-muted-foreground">
                  <a
                    href={helpLink.href}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {helpLink.label}
                  </a>
                </p>
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Paste QR contents instead</summary>
                <Textarea
                  rows={3}
                  className="mt-2 font-mono text-[11px]"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="bitcoin:bc1q…?amount=0.01"
                />
                <Button size="sm" className="mt-2 w-full" disabled={!manual.trim()} onClick={submitManual}>
                  Use pasted text
                </Button>
              </details>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Polls a ref across a few frames until React has committed the element. */
async function waitForRef(
  ref: React.RefObject<HTMLVideoElement | null>,
  tries = 30,
): Promise<HTMLVideoElement | null> {
  for (let i = 0; i < tries; i++) {
    if (ref.current) return ref.current;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  return ref.current;
}

function cameraErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || /permission|denied/i.test(raw)) {
    return "Camera access was blocked. Allow camera for this site in your browser settings, then try again — or use a photo instead.";
  }
  if (name === "NotFoundError" || /no camera/i.test(raw)) {
    return "No camera found on this device. Use a photo or paste the QR contents.";
  }
  if (name === "NotReadableError" || /in use|track start/i.test(raw)) {
    return "The camera is busy in another app or tab. Close it and try again.";
  }
  if (!window.isSecureContext) {
    return "Camera needs a secure (https) connection. Open the site over https and try again.";
  }
  return raw || "Camera unavailable";
}
