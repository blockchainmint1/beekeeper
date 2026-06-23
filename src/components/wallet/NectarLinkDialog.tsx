import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ScanLine, Link2 } from "lucide-react";
import { QrScanDialog } from "./QrScanDialog";
import {
  buildNectarPayload,
  linkNectarMerchant,
  parseNectarQr,
  type NectarLinkRecord,
} from "@/lib/wallet/nectar";
import { getCachedMnemonic } from "@/lib/wallet/seed";

export function NectarLinkDialog({
  open,
  onOpenChange,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLinked?: (r: NectarLinkRecord) => void;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleScanResult(text: string) {
    setScanOpen(false);
    const mnemonic = getCachedMnemonic();
    if (!mnemonic) {
      toast.error("Wallet is locked — unlock first");
      return;
    }
    setBusy(true);
    try {
      const target = parseNectarQr(text);
      const payload = buildNectarPayload(mnemonic);
      const record = await linkNectarMerchant(payload, target);
      toast.success(
        record.merchantName
          ? `Linked to ${record.merchantName}`
          : "Linked to Nectar Pay",
      );
      onLinked?.(record);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not link merchant");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" /> Link Nectar Pay
            </DialogTitle>
            <DialogDescription>
              Open Nectar Pay on your merchant account, choose "Link wallet", and scan the QR code it shows.
              We'll send your BTC, TEXITcoin, and EVM extended public keys (xpubs) so Nectar Pay can watch incoming payments. Only public keys leave this device — your seed never does.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button className="w-full" disabled={busy} onClick={() => setScanOpen(true)}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />}
              {busy ? "Linking…" : "Scan Nectar Pay QR"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <QrScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onResult={handleScanResult}
        title="Scan Nectar Pay merchant QR"
        description="Point your camera at the merchant link QR shown by Nectar Pay."
      />
    </>
  );
}
