import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScanLine } from "lucide-react";

/** Lightweight QR scanner dialog. Calls onResult with the raw decoded text. */
export function QrScanDialog({
  open,
  onOpenChange,
  onResult,
  title = "Scan QR code",
  description = "Point your camera at a payment QR. Standard BIP21 URIs like bitcoin:… or texitcoin:…?amount= are supported.",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onResult: (text: string) => void;
  title?: string;
  description?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [phase, setPhase] = useState<"idle" | "scan">("idle");
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
      scannerRef.current = null;
      setPhase("idle");
      setManual("");
      setError(null);
    }
  }, [open]);

  function startCamera() {
    setError(null);
    setPhase("scan");
    requestAnimationFrame(() => {
      const video = videoRef.current;
      if (!video) return;
      const s = new QrScanner(
        video,
        (result) => {
          scannerRef.current?.stop();
          onResult(result.data);
          onOpenChange(false);
        },
        { highlightScanRegion: true, highlightCodeOutline: true, preferredCamera: "environment" },
      );
      scannerRef.current = s;
      s.start().catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Camera unavailable");
        setPhase("idle");
      });
    });
  }

  function submitManual() {
    const t = manual.trim();
    if (!t) return;
    onResult(t);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {phase === "idle" ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-muted/30 py-10 text-center">
              <ScanLine className="h-10 w-10 text-muted-foreground" />
              <Button onClick={startCamera}>
                <ScanLine className="mr-1.5 h-4 w-4" /> Start camera
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
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
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
