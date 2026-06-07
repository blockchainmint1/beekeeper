import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import type { ChainConfig } from "@/lib/chains";

export function ReceiveDialog({
  open,
  onOpenChange,
  chain,
  address,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chain: ChainConfig;
  address: string;
}) {
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    if (!address) return;
    QRCode.toDataURL(address, { margin: 1, width: 260 }).then(setQr).catch(() => setQr(""));
  }, [address]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive {chain.ticker}</DialogTitle>
          <DialogDescription>
            Share this address to receive {chain.name}. Only send {chain.ticker} to this address.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {qr ? (
            <img src={qr} alt={`${chain.ticker} address QR`} className="w-full max-w-[260px] rounded-lg border bg-white p-2" />
          ) : (
            <div className="aspect-square w-full max-w-[260px] animate-pulse rounded-lg bg-muted" />
          )}
          <div className="w-full rounded-md border bg-muted/40 p-3 font-mono text-xs break-all text-center">
            {address}
          </div>
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                navigator.clipboard.writeText(address);
                toast.success("Address copied");
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Copy
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => window.open(chain.explorerAddr(address), "_blank")}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> Explorer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}