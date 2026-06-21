import { useEffect, useMemo, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, ScanLine, Loader2, CheckCircle2 } from "lucide-react";
import type { ChainConfig } from "@/lib/chains";
import { getCachedMnemonic } from "@/lib/wallet/seed";
import {
  parseQrLogin,
  signQrLogin,
  postQrLogin,
  buildLoginMessage,
  fetchDeepLinkMessage,
  type ParsedQrLogin,
} from "@/lib/wallet/qr-login";

type Phase = "scan" | "loading" | "confirm" | "signing" | "done";

export function QrLoginDialog({
  open,
  onOpenChange,
  chain,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chain: ChainConfig;
}) {
  const mnemonic = useMemo(() => getCachedMnemonic() ?? "", []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [phase, setPhase] = useState<Phase>("scan");
  const [request, setRequest] = useState<ParsedQrLogin | null>(null);
  const [message, setMessage] = useState<string>("");
  const [siteLabel, setSiteLabel] = useState<string>("");
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
      scannerRef.current = null;
      setPhase("scan");
      setRequest(null);
      setMessage("");
      setSiteLabel("");
      setManual("");
      setError(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open || phase !== "scan" || !videoRef.current) return;
    let cancelled = false;
    const video = videoRef.current;
    const s = new QrScanner(
      video,
      (result) => {
        if (cancelled) return;
        handleRaw(result.data);
      },
      { highlightScanRegion: true, highlightCodeOutline: true, preferredCamera: "environment" },
    );
    scannerRef.current = s;
    s.start().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Camera unavailable");
    });
    return () => {
      cancelled = true;
      s.stop();
      s.destroy();
      if (scannerRef.current === s) scannerRef.current = null;
    };
  }, [open, phase]);

  async function handleRaw(raw: string) {
    try {
      const req = parseQrLogin(raw);
      scannerRef.current?.stop();
      setRequest(req);
      setError(null);
      if (req.protocol === "deep-link") {
        setSiteLabel(new URL(req.callback).hostname);
        setPhase("loading");
        try {
          const m = await fetchDeepLinkMessage(req);
          setMessage(m);
          setPhase("confirm");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not load message");
          setPhase("scan");
        }
      } else {
        setSiteLabel(req.origin);
        const acctAddr = "<your address>";
        setMessage(buildLoginMessage(req, acctAddr, chain));
        setPhase("confirm");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid QR");
    }
  }

  async function handleApprove() {
    if (!request || !mnemonic) return;
    setPhase("signing");
    setError(null);
    try {
      // For envelope protocol, rebuild the message now that we know the real address.
      let finalMsg = message;
      if (request.protocol === "envelope") {
        const addr =
          chain.kind === "evm"
            ? (await import("@/lib/wallet/evm")).deriveEvmAccount(mnemonic, chain, 0).address
            : (await (await import("@/lib/wallet/utxo")).deriveUtxoAccount(mnemonic, chain, 0, chain.defaultAddressType)).address;
        finalMsg = buildLoginMessage(request, addr, chain);
      }
      const result = await signQrLogin({ mnemonic, chain, request, message: finalMsg });
      await postQrLogin(request.callback, result);
      setPhase("done");
      toast.success(`Signed in to ${new URL(request.callback).hostname}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setPhase("confirm");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" /> Scan to sign in
          </DialogTitle>
          <DialogDescription>
            Point the camera at a Honest Money login QR. You'll authenticate with your active <strong>{chain.ticker}</strong> wallet.
          </DialogDescription>
        </DialogHeader>

        {phase === "scan" && (
          <div className="space-y-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Paste QR contents or link instead</summary>
              <Textarea
                rows={4}
                className="mt-2 font-mono text-[11px]"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder='payhme://login?id=…&nonce=…&cb=… or {"v":1,...}'
              />
              <Button
                size="sm"
                className="mt-2 w-full"
                disabled={!manual.trim()}
                onClick={() => handleRaw(manual.trim())}
              >
                Parse
              </Button>
            </details>
          </div>
        )}

        {phase === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            Fetching login challenge…
          </div>
        )}

        {phase === "confirm" && request && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/40 p-4 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Site</span>
                <span className="font-semibold truncate">{siteLabel}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Callback</span>
                <span className="font-mono text-[11px] truncate">{new URL(request.callback).hostname}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Wallet</span>
                <span className="font-semibold">{chain.name}</span>
              </div>
              {request.protocol === "envelope" && request.statement && (
                <div className="pt-2 border-t text-xs italic">"{request.statement}"</div>
              )}
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">View signed message</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded bg-muted/60 p-2 font-mono text-[10px]">{message}</pre>
            </details>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setPhase("scan"); setRequest(null); setMessage(""); setError(null); }}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleApprove}>
                <ShieldCheck className="mr-1.5 h-4 w-4" /> Sign in
              </Button>
            </div>
          </div>
        )}

        {phase === "signing" && (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            Signing and sending…
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="h-12 w-12" style={{ color: "var(--success)" }} />
            <div className="text-base font-semibold">Signed in</div>
            <div className="text-xs text-muted-foreground">You can return to the site now.</div>
            <Button className="mt-2 w-full" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}