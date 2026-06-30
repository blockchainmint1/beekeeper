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
import { Loader2, ShieldCheck, AlertTriangle, KeyRound, Globe, Sparkles, Copy } from "lucide-react";
import {
  buildLinkPayload,
  callbackMatchesOrigin,
  deriveTxcIdentityAddress,
  hashAddressSet,
  postLinkPayload,
  signLinkPayload,
  type NectarChainKey,
  type NectarLinkRequest,
  type NectarManifest,
} from "@/lib/wallet/nectar-link";
import { getCachedMnemonic } from "@/lib/wallet/seed";
import { saveNectarLink } from "@/lib/wallet/nectar";

type SignerStatus =
  | { kind: "loading" }
  | { kind: "known" } // address provably in known set OR no manifest (legacy)
  | { kind: "new-wallet"; allowed: true } // count===0 OR allow_new_wallet + not in set
  | { kind: "blocked"; reason: string }; // unknown signer, merchant didn't opt in

export function NectarLinkConsentDialog({
  open,
  onOpenChange,
  request,
  manifest,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: NectarLinkRequest | null;
  manifest?: NectarManifest | null;
  onLinked?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mnemonic, setMnemonic] = useState<string>("");
  const [derived, setDerived] = useState<{
    supported: NectarChainKey[];
    unsupported: NectarChainKey[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myAddress, setMyAddress] = useState<string | null>(null);
  const [signerStatus, setSignerStatus] = useState<SignerStatus>({ kind: "loading" });
  const [acknowledgedNew, setAcknowledgedNew] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const originOk = useMemo(
    () => (request ? callbackMatchesOrigin(request.from, request.callback_url) : true),
    [request],
  );

  // Re-read the cached mnemonic each time the dialog opens. A useMemo([])
  // would freeze an empty value if the dialog mounted before the vault was
  // unlocked, leaving the user staring at a disabled Approve button with no
  // explanation.
  useEffect(() => {
    if (!open) return;
    setMnemonic(getCachedMnemonic() ?? "");
  }, [open]);

  // Pre-derive xpubs the moment the dialog opens so the user can see what
  // will actually be shared before they tap Approve.
  useEffect(() => {
    if (!open || !request) {
      setDerived(null);
      setError(null);
      setMyAddress(null);
      setSignerStatus({ kind: "loading" });
      setAcknowledgedNew(false);
      return;
    }
    if (!mnemonic) {
      setDerived(null);
      setMyAddress(null);
      setSignerStatus({ kind: "loading" });
      setError("Wallet is locked — unlock first, then re-scan the Nectar QR.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const built = buildLinkPayload(mnemonic, request);
        if (cancelled) return;
        setDerived({
          supported: built.payload.chains,
          unsupported: built.unsupported,
        });
        setError(null);

        const addr = await deriveTxcIdentityAddress(mnemonic);
        if (cancelled) return;
        setMyAddress(addr);

        if (!manifest) {
          // Legacy envelope path — no manifest to branch on. Treat as known.
          setSignerStatus({ kind: "known" });
          return;
        }

        // Three-way branch
        if (manifest.known_addresses_count === 0) {
          // First wallet ever for this merchant — always allow without the
          // new-wallet warning. There's no prior wallet to displace, so this
          // is just enrollment, not a takeover.
          setSignerStatus({ kind: "known" });
          return;
        }

        if (manifest.known_addresses_count === 1) {
          const h = await hashAddressSet([addr]);
          if (cancelled) return;
          if (h === manifest.known_addresses_hash.toLowerCase()) {
            setSignerStatus({ kind: "known" });
          } else if (manifest.allow_new_wallet) {
            setSignerStatus({ kind: "new-wallet", allowed: true });
          } else {
            setSignerStatus({
              kind: "blocked",
              reason: "Another wallet is registered to this merchant. Sign in to Nectar with this wallet first, or ask the merchant to re-mint the code with the new-wallet option enabled.",
            });
          }
          return;
        }

        // count > 1 — can't prove membership from a hash alone. Let the server
        // be the source of truth: optimistically allow signing, server re-verifies.
        if (manifest.allow_new_wallet) {
          // Could be known or new — surface the warning to be safe.
          setSignerStatus({ kind: "new-wallet", allowed: true });
        } else {
          setSignerStatus({ kind: "known" });
        }
      } catch (e) {
        if (cancelled) return;
        setDerived(null);
        setError(e instanceof Error ? e.message : "Could not prepare keys");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, request, manifest, mnemonic]);

  async function handleApprove() {
    if (!request || !mnemonic) return;
    if (signerStatus.kind === "blocked") return;
    if (signerStatus.kind === "new-wallet" && !acknowledgedNew) {
      toast.error("Please confirm you want to link this new wallet");
      return;
    }
    setBusy(true);
    try {
      const { payload } = buildLinkPayload(mnemonic, request);
      const { address, signature } = await signLinkPayload(mnemonic, payload);
      const resp = await postLinkPayload(request.callback_url, {
        payload,
        signature,
        address,
      });
      saveNectarLink({
        merchantId: resp.store_id,
        merchantName: resp.merchant_name ?? manifest?.merchant_name ?? request.from,
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
  const merchantLabel = manifest?.merchant_name ?? request.from;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Share receive keys with {merchantLabel}?
          </DialogTitle>
          <DialogDescription>
            {merchantLabel} is asking to import your receive-side extended public keys
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

          {myAddress && (
            <div className="rounded-2xl border border-border bg-card/40 px-3 py-2.5">
              <div className="text-xs text-muted-foreground">Signing as (TXC identity)</div>
              <div className="mt-1 break-all text-xs tabular text-foreground/80">{myAddress}</div>
            </div>
          )}

          {signerStatus.kind === "blocked" && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{signerStatus.reason}</span>
              </div>
            </div>
          )}

          {signerStatus.kind === "new-wallet" && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
                <div className="space-y-2">
                  <div>
                    <strong>New wallet on {merchantLabel}.</strong> This wallet has
                    never been used with this merchant before. Linking will register
                    it as an authorized signer going forward.
                  </div>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={acknowledgedNew}
                      onChange={(e) => setAcknowledgedNew(e.target.checked)}
                      className="h-3.5 w-3.5 accent-amber-500"
                    />
                    <span>I understand and want to continue.</span>
                  </label>
                </div>
              </div>
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
            disabled={
              busy ||
              !!error ||
              !derived ||
              derived.supported.length === 0 ||
              signerStatus.kind === "loading" ||
              signerStatus.kind === "blocked" ||
              (signerStatus.kind === "new-wallet" && !acknowledgedNew)
            }
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
