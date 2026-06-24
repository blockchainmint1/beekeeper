import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle, KeyRound, Globe } from "lucide-react";
import {
  buildLinkPayload,
  callbackMatchesOrigin,
  postLinkPayload,
  signLinkPayload,
  type NectarChainKey,
  type NectarLinkRequest,
} from "@/lib/wallet/nectar-link";
import { getCachedMnemonic } from "@/lib/wallet/seed";
import { saveNectarLink } from "@/lib/wallet/nectar";

export function NectarLinkConsentDialog({
  open,
  onOpenChange,
  request,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: NectarLinkRequest | null;
  onLinked?: () => void;
}) {
  const mnemonic = useMemo(() => getCachedMnemonic() ?? "", []);
  const [busy, setBusy] = useState(false);
  const [derived, setDerived] = useState<{
    supported: NectarChainKey[];
    unsupported: NectarChainKey[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const originOk = useMemo(
    () => (request ? callbackMatchesOrigin(request.from, request.callback_url) : true),
    [request],
  );

  // Pre-derive xpubs the moment the dialog opens so the user can see what
  // will actually be shared before they tap Approve.
  useEffect(() => {
    if (!open || !request || !mnemonic) {
      setDerived(null);
      setError(null);
      return;
    }
    try {
      const built = buildLinkPayload(mnemonic, request);
      setDerived({
        supported: built.payload.chains,
        unsupported: built.unsupported,
      });
      setError(null);
    } catch (e) {
      setDerived(null);
      setError(e instanceof Error ? e.message : "Could not prepare keys");
    }
  }, [open, request, mnemonic]);

  async function handleApprove() {
    if (!request || !mnemonic) return;
    setBusy(true);
    try {
      const { payload } = buildLinkPayload(mnemonic, request);
      const { address, signature } = await signLinkPayload(mnemonic, payload);
      const resp = await postLinkPayload(request.callback_url, {
        payload,
        signature,
        address,
      });
      // Remember the link so the Wallet home dismisses the "finish linking" nag.
      saveNectarLink({
        merchantId: resp.store_id,
        merchantName: resp.merchant_name ?? request.from,
        url: request.callback_url,
        linkedAt: Date.now(),
      });
      toast.success(
        resp.merchant_name
          ? `Linked ${payload.chains.length} chain${payload.chains.length === 1 ? "" : "s"} to ${resp.merchant_name}`
          : `Linked ${payload.chains.length} chain${payload.chains.length === 1 ? "" : "s"} to Nectar Pay`,
      );
      onLinked?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Link failed");
    } finally {
      setBusy(false);
    }
  }

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Share receive keys with {request.from}?
          </DialogTitle>
          <DialogDescription>
            {request.from} is asking to import your receive-side extended public keys
            so it can watch for incoming payments. Only public keys leave this device — your seed never does.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-2xl border border-border bg-card/40 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5" /> Callback
            </div>
            <div className="mt-1 break-all text-xs tabular text-foreground/80">
              {request.callback_url}
            </div>
            {!originOk && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>
                  Callback host does not match <strong>{request.from}</strong>. Only
                  approve if you trust this destination.
                </span>
              </div>
            )}
          </div>

          {error ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              {error}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card/40 px-3 py-2.5">
              <div className="text-xs text-muted-foreground">Keys to share</div>
              <ul className="mt-1.5 space-y-1">
                {derived?.supported.map((c) => (
                  <li key={c} className="flex items-center gap-2 text-xs">
                    <ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--success)" }} />
                    <span className="font-medium">{c}</span>
                    <span className="text-muted-foreground">
                      — extended public key (watch-only)
                    </span>
                  </li>
                ))}
                {derived?.unsupported.map((c) => (
                  <li key={c} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="font-medium">{c}</span>
                    <span>— not yet supported by this wallet, will be skipped</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Extended public keys let merchants generate fresh receive addresses on
            their own. They cannot move, spend, or sign anything — that still
            requires your seed, which stays on this device.
          </p>
        </div>

        <div className="mt-2 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleApprove}
            disabled={busy || !!error || !derived || derived.supported.length === 0}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing…
              </>
            ) : (
              "Approve & link"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
