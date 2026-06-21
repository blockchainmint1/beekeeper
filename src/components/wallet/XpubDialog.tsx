import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Eye, EyeOff } from "lucide-react";
import type { ChainConfig } from "@/lib/chains";
import { getCachedMnemonic } from "@/lib/wallet/seed";
import { chainAccountXpub } from "@/lib/wallet/xpub";

export function XpubDialog({
  open,
  onOpenChange,
  chain,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chain: ChainConfig;
}) {
  const mnemonic = useMemo(() => getCachedMnemonic() ?? "", []);
  const [xpub, setXpub] = useState<string>("");
  const [path, setPath] = useState<string>("");
  const [qr, setQr] = useState<string>("");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!open || !mnemonic) return;
    try {
      const r = chainAccountXpub(mnemonic, chain);
      setXpub(r.xpub);
      setPath(r.path);
      QRCode.toDataURL(r.xpub, { margin: 1, width: 260 }).then(setQr).catch(() => setQr(""));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to derive xpub");
    }
    setRevealed(false);
  }, [open, mnemonic, chain]);

  const masked = xpub ? `${xpub.slice(0, 8)}…${xpub.slice(-8)}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{chain.ticker} Extended Public Key</DialogTitle>
          <DialogDescription>
            Share this xpub to let a watch-only wallet or service track {chain.name}. It cannot spend funds.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {qr ? (
            <img
              src={qr}
              alt={`${chain.ticker} xpub QR`}
              className={`w-full max-w-[260px] rounded-lg border bg-white p-2 transition ${revealed ? "" : "blur-md"}`}
              onClick={() => setRevealed(true)}
            />
          ) : (
            <div className="aspect-square w-full max-w-[260px] animate-pulse rounded-lg bg-muted" />
          )}
          <div className="w-full rounded-md border bg-muted/40 p-3 font-mono text-[11px] break-all text-center">
            {revealed ? xpub : masked}
          </div>
          <div className="text-[11px] text-muted-foreground">Path: <span className="font-mono">{path}</span></div>
          <div className="flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setRevealed((r) => !r)}>
              {revealed ? <><EyeOff className="mr-2 h-4 w-4" /> Hide</> : <><Eye className="mr-2 h-4 w-4" /> Reveal</>}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={!xpub}
              onClick={() => {
                navigator.clipboard.writeText(xpub);
                toast.success("xpub copied");
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Copy
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}