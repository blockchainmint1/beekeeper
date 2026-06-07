import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Loader2, RefreshCw, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ChainConfig } from "@/lib/chains";
import { fetchUtxoHistory } from "@/lib/wallet/history";

export function HistoryDialog({
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
  const utxo = chain.kind === "utxo";

  const query = useQuery({
    queryKey: ["history", chain.id, address],
    enabled: open && utxo && !!address,
    refetchOnWindowFocus: false,
    queryFn: () => fetchUtxoHistory(chain as never, address),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{chain.name} history</DialogTitle>
          <DialogDescription>
            {utxo ? "Most recent transactions for this address." : "EVM history opens in the block explorer."}
          </DialogDescription>
        </DialogHeader>

        {!utxo ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The full history for this account, including ERC-20 transfers and contract calls, lives in {chain.name}'s explorer.
            </p>
            <Button className="w-full" onClick={() => window.open(chain.explorerAddr(address), "_blank")}>
              <ExternalLink className="mr-2 h-4 w-4" /> Open in explorer
            </Button>
          </div>
        ) : query.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : query.error ? (
          <div className="space-y-3 py-2 text-sm">
            <p className="text-destructive">Couldn't load history.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
          </div>
        ) : (
          <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
            {(query.data ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                No transactions yet.
              </p>
            ) : (
              (query.data ?? []).map((tx) => {
                const Icon = tx.direction === "in" ? ArrowDownLeft : tx.direction === "out" ? ArrowUpRight : Repeat;
                const dirColor =
                  tx.direction === "in" ? "text-emerald-500" : tx.direction === "out" ? "text-amber-500" : "text-muted-foreground";
                return (
                  <a
                    key={tx.txid}
                    href={tx.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-md border bg-card p-2.5 text-sm transition hover:bg-muted/40"
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${dirColor}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium capitalize">{tx.direction}</span>
                        <span className={`font-mono text-xs ${tx.confirmed ? "" : "text-amber-500"}`}>
                          {tx.confirmed ? new Date((tx.whenSec ?? 0) * 1000).toLocaleString() : "Unconfirmed"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[11px] text-muted-foreground">{tx.txid}</span>
                        <span className="shrink-0 text-xs tabular-nums">
                          {tx.direction === "out" ? "−" : tx.direction === "in" ? "+" : ""}
                          {tx.amount} {tx.ticker}
                        </span>
                      </div>
                    </div>
                  </a>
                );
              })
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}