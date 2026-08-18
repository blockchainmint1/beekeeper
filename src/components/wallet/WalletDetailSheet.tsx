/**
 * Wallet tile detail sheet — the HME Wallet interaction: tap a card and a
 * drawer slides up with the wallet's name (renameable), balance with an
 * inline privacy toggle, chain + derivation info, and the current receive
 * address. Generic over Beekeeper's chain config.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Eye, EyeOff, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChainConfig } from "@/lib/chains";
import { getChainLabel, setChainLabel, useChainLabelVersion } from "@/lib/wallet/chain-labels";
import { useHideBalances, toggleHideBalances, maskAmount } from "@/lib/wallet/hide-balances";
import { formatUsd } from "@/lib/wallet/price";

function derivationPath(chain: ChainConfig): string {
  if (chain.kind === "utxo") {
    return `${chain.defaultAddressType === "segwit" ? chain.bip84Base : chain.bip44Base}/0`;
  }
  if (chain.kind === "evm") return `${chain.derivationBase}/0`;
  return chain.derivationPath;
}

function addressTypeLabel(chain: ChainConfig): string {
  if (chain.kind === "utxo") {
    return chain.defaultAddressType === "segwit"
      ? "Native SegWit (bech32)"
      : "Legacy (P2PKH)";
  }
  if (chain.kind === "evm") return "Ethereum account (secp256k1)";
  if (chain.kind === "tron") return "Tron base58 account";
  return "Solana ed25519 account";
}

export function WalletDetailSheet({
  chain,
  address,
  nativeAmount,
  usdValue,
  open,
  onClose,
}: {
  chain: ChainConfig | undefined;
  address: string | null;
  nativeAmount: number | null;
  usdValue: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const labelVersion = useChainLabelVersion();
  const hidden = useHideBalances();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  void labelVersion;

  if (!chain) return null;
  const label = getChainLabel(chain.id, chain.name);
  const balanceText =
    nativeAmount == null
      ? "—"
      : `${nativeAmount.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${chain.ticker}`;
  const fiatText = usdValue == null ? null : formatUsd(usdValue);

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[90dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Wallet details</DrawerTitle>
          <DrawerDescription>{chain.name} · non-custodial, derived from your seed</DrawerDescription>
        </DrawerHeader>

        <div className="space-y-3 overflow-y-auto px-4 pb-8">
          {/* Name */}
          <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Name</p>
              {!editing && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setDraft(label);
                    setEditing(true);
                  }}
                >
                  <Pencil className="h-3 w-3" /> Rename
                </button>
              )}
            </div>
            {editing ? (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  autoFocus
                  value={draft}
                  maxLength={24}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-9"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    setChainLabel(chain.id, draft);
                    setEditing(false);
                  }}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <p className="mt-1 text-sm font-medium">{label}</p>
            )}
          </div>

          {/* Balance */}
          <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Balance</p>
              <button
                type="button"
                onClick={toggleHideBalances}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {hidden ? "Show" : "Hide"} balances
              </button>
            </div>
            <p className="tabular mt-1 text-lg font-semibold">{maskAmount(balanceText, hidden)}</p>
            {fiatText && (
              <p className="tabular text-xs text-muted-foreground">{maskAmount(fiatText, hidden)}</p>
            )}
          </div>

          <Field label="Chain" value={`${chain.name} (${chain.ticker})`} />
          <Field label="Address type" value={addressTypeLabel(chain)} />
          <Field label="Primary derivation path" value={derivationPath(chain)} mono />
          {address && <Field label="Current receive address" value={address} mono copy />}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button asChild variant="outline" onClick={onClose}>
              <Link to="/wallet/$chain/history" params={{ chain: chain.id }}>
                History
              </Link>
            </Button>
            <Button asChild variant="outline" onClick={onClose}>
              <Link to="/wallet/$chain/xpub" params={{ chain: chain.id }}>
                Extended key
              </Link>
            </Button>
            {chain.kind === "utxo" && (
              <Button asChild variant="outline" onClick={onClose}>
                <Link to="/wallet/$chain/consolidate" params={{ chain: chain.id }}>
                  Consolidate
                </Link>
              </Button>
            )}
            {chain.kind === "evm" && (
              <Button asChild variant="outline" onClick={onClose}>
                <Link to="/wallet/$chain/sweep" params={{ chain: chain.id }}>
                  Scan &amp; sweep
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" onClick={onClose}>
              <Link to="/wallet/$chain/qr-login" params={{ chain: chain.id }} search={{ q: undefined }}>
                QR login
              </Link>
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Field({
  label,
  value,
  mono,
  copy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {copy && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                toast.error("Couldn't copy to clipboard");
              }
            }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <p className={`mt-1 break-all text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
