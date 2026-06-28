import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ScanLine, Link2 } from "lucide-react";
import { QrScanDialog } from "./QrScanDialog";
import { NectarLinkConsentDialog } from "./NectarLinkConsentDialog";
import {
  buildNectarPayload,
  linkNectarMerchant,
  parseNectarQr,
  type NectarLinkRecord,
} from "@/lib/wallet/nectar";
import {
  fetchNectarManifest,
  parseNectarLinkRequest,
  parseNectarManifestUrl,
  type NectarLinkRequest,
  type NectarManifest,
} from "@/lib/wallet/nectar-link";
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
  const [consentReq, setConsentReq] = useState<NectarLinkRequest | null>(null);

  async function handleScanResult(text: string) {
    setScanOpen(false);

    // Prefer the new link-xpubs envelope — it carries challenge_id, requested
    // chains, callback origin, and expiry, all of which the consent screen needs.
    try {
      const req = parseNectarLinkRequest(text);
      setConsentReq(req);
      onOpenChange(false); // hide the picker; consent dialog takes over
      return;
    } catch {
      /* not a link-xpubs payload — fall through to legacy merchant-link form */
    }

    // Legacy form: plain https URL or { nectar: "merchant-link", url, token? }.
    // Fires-and-forgets the default BTC/TXC/EVM xpubs without a consent step.
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
              The wallet will show you exactly which extended public keys (xpubs) it's about to share before anything leaves this device. Your seed never does.
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
      <NectarLinkConsentDialog
        open={!!consentReq}
        onOpenChange={(v) => !v && setConsentReq(null)}
        request={consentReq}
        onLinked={() => {
          onLinked?.({
            url: consentReq?.callback_url ?? "",
            linkedAt: Date.now(),
            merchantName: consentReq?.from,
          });
        }}
      />
    </>
  );
}
