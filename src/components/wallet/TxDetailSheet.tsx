/**
 * In-page transaction detail sheet — tapping a row in RecentActivity opens
 * this instead of jumping straight to the block explorer. Ported from HME
 * Wallet's TxDetailSheet, adapted to Beekeeper's unified `HistoryItem` shape.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Repeat } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import type { ChainConfig } from "@/lib/chains";
import type { HistoryItem } from "@/lib/wallet/history";

export function TxDetailSheet({
  tx,
  chain,
  onClose,
}: {
  tx: HistoryItem | null;
  chain: ChainConfig | undefined;
  onClose: () => void;
}) {
  const open = tx !== null;
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Transaction</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">{tx && <Detail tx={tx} chain={chain} />}</div>
      </DrawerContent>
    </Drawer>
  );
}

function Detail({ tx, chain }: { tx: HistoryItem; chain: ChainConfig | undefined }) {
  const incoming = tx.direction === "in";
  const self = tx.direction === "self";
  const title = self ? "Self transfer" : incoming ? "Received" : "Sent";
  const sign = self ? "" : incoming ? "+" : "−";
  const subtitle = tx.confirmed
    ? tx.whenSec
      ? new Date(tx.whenSec * 1000).toLocaleString()
      : "Confirmed"
    : "Pending";

  const fee = extractFeeSats(tx);

  return (
    <div className="space-y-4">
      <Header incoming={incoming} self={self} title={title} amount={`${sign}${tx.amount} ${tx.ticker}`} subtitle={subtitle} />
      <Field label="Status" value={tx.confirmed ? "Confirmed" : "Unconfirmed"} />
      {fee != null && chain && (
        <Field label="Network fee" value={`${(fee / 10 ** chain.decimals).toLocaleString(undefined, { maximumFractionDigits: 8 })} ${chain.ticker}`} />
      )}
      <Field label="Transaction ID" value={tx.txid} mono copy />
      <Button asChild variant="outline" className="w-full">
        <a href={tx.url} target="_blank" rel="noreferrer">
          <ExternalLink className="mr-2 h-4 w-4" /> Open in explorer
        </a>
      </Button>
    </div>
  );
}

/** Best-effort fee extraction — only esplora-style UTXO txs carry enough info in `raw`. */
function extractFeeSats(tx: HistoryItem): number | null {
  const raw = tx.raw as
    | { vin?: { prevout?: { value: number } }[]; vout?: { value: number }[] }
    | undefined;
  if (!raw?.vin || !raw?.vout) return null;
  const inSum = raw.vin.reduce((s, v) => s + (v.prevout?.value ?? 0), 0);
  const outSum = raw.vout.reduce((s, v) => s + (v.value ?? 0), 0);
  if (!inSum) return null;
  const fee = inSum - outSum;
  return fee > 0 ? fee : null;
}

function Header({
  incoming,
  self,
  title,
  amount,
  subtitle,
}: {
  incoming: boolean;
  self: boolean;
  title: string;
  amount: string;
  subtitle: string;
}) {
  const Icon = self ? Repeat : incoming ? ArrowDown : ArrowUp;
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full ${
          self
            ? "bg-muted text-muted-foreground"
            : incoming
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-amber-500/15 text-amber-500"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <p className={`text-right font-semibold ${incoming ? "text-emerald-500" : ""}`}>{amount}</p>
    </div>
  );
}

function Field({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-4 py-3">
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
                /* clipboard unavailable */
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
