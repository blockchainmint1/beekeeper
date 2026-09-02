/**
 * Watch-only addresses — track a cold-storage coin or paper wallet balance
 * without importing any key. Nothing here can sign; the wallet only reads
 * balances from the same providers it uses for your own addresses.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, QrCode, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHAIN_LIST, getChain, type ChainId } from "@/lib/chains";
import { QrScanDialog } from "@/components/wallet/QrScanDialog";
import { parsePaymentUri } from "@/lib/wallet/payment-uri";
import {
  addWatchOnly, removeWatchOnly, useWatchOnly, validateWatchAddress,
  watchOnlyBalance, watchableChain, type WatchOnlyEntry,
} from "@/lib/wallet/watch-only";
import { useHideBalances, maskAmount } from "@/lib/wallet/hide-balances";

const chains = CHAIN_LIST.filter(watchableChain);

export function WatchOnlyCard() {
  const entries = useWatchOnly();
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Figure out which chain a scanned address belongs to, then store it. */
  async function handleScan(text: string) {
    setScanOpen(false);
    setBusy(true);
    try {
      let address = text.trim();
      let hinted: ChainId | null = null;
      try {
        const parsed = parsePaymentUri(text);
        if (parsed.address) address = parsed.address.trim();
        if (parsed.chain && watchableChain(parsed.chain)) hinted = parsed.chain.id;
      } catch {
        /* fall back to the raw scan */
      }

      const order = hinted
        ? [hinted, ...chains.map((c) => c.id).filter((id) => id !== hinted)]
        : chains.map((c) => c.id);

      for (const id of order) {
        if (await validateWatchAddress(id, address)) {
          addWatchOnly({ chainId: id, address, label: `${getChain(id).ticker} cold storage` });
          toast.success(`Watching this ${getChain(id).ticker} address`);
          return;
        }
      }
      toast.error("That QR doesn't contain an address we can watch");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" /> Watch-only addresses
        </CardTitle>
        <CardDescription>
          Scan the public address QR on a cold storage coin or paper wallet to track it. Read-only —
          no key ever leaves the coin, and these balances cannot be spent from here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={() => setScanOpen(true)} disabled={busy} className="w-full">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
          Scan address QR
        </Button>

        {entries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Nothing watched yet. Scan the address printed on a coin to keep an eye on it.
          </p>
        ) : (
          <div className="space-y-1.5">
            {entries.map((e) => (
              <WatchRow key={e.id} entry={e} />
            ))}
          </div>
        )}
      </CardContent>

      <QrScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        title="Scan a public address"
        description="Point your camera at the public address QR on the outside of the coin or paper wallet."
        onResult={(text) => void handleScan(text)}
      />
    </Card>
  );
}


function WatchRow({ entry }: { entry: WatchOnlyEntry }) {
  const chain = getChain(entry.chainId);
  const hidden = useHideBalances();
  const q = useQuery({
    queryKey: ["watch-only-balance", entry.id],
    queryFn: () => watchOnlyBalance(entry),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });

  const amount =
    q.isLoading ? "…"
    : q.isError ? "—"
    : (q.data ?? 0).toLocaleString("en-US", { maximumFractionDigits: 8 });

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: chain.color }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{entry.label}</div>
        <div className="truncate text-[11px] text-muted-foreground">{entry.address}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tabular text-sm font-semibold">
          {maskAmount(amount, hidden)} {chain.ticker}
        </div>
      </div>
      <a
        href={chain.explorerAddr(entry.address)}
        target="_blank"
        rel="noreferrer"
        aria-label="View on explorer"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <button
        type="button"
        onClick={() => {
          removeWatchOnly(entry.id);
          toast.success("Removed from watch list");
        }}
        aria-label={`Stop watching ${entry.label}`}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
