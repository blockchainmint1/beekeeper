import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Loader2, RefreshCw, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChainConfig } from "@/lib/chains";
import { fetchHistory, explorerHistoryUrl, hasNativeHistory } from "@/lib/wallet/history";

export function RecentActivity({
  chain,
  address,
  onSeeAll,
}: {
  chain: ChainConfig | undefined;
  address: string | null | undefined;
  onSeeAll?: () => void;
}) {
  const native = chain ? hasNativeHistory(chain) : false;
  const query = useQuery({
    queryKey: ["history", chain?.id, address],
    enabled: native && !!address,
    refetchOnWindowFocus: false,
    queryFn: () => fetchHistory(chain as never, address!),
  });

  if (!chain) {
    return (
      <div className="glass-card rounded-2xl px-4 py-5 text-center text-sm text-muted-foreground">
        Select a wallet to view recent activity.
      </div>
    );
  }

  if (!native) {
    return (
      <div className="glass-card rounded-2xl px-4 py-5 text-center text-sm text-muted-foreground">
        <p className="mb-3">Full {chain.name} history lives in the block explorer.</p>
        <Button size="sm" variant="outline" onClick={() => window.open(explorerHistoryUrl(chain, address ?? ""), "_blank")}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open explorer
        </Button>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="glass-card rounded-2xl px-4 py-6 flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading activity…
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="glass-card rounded-2xl px-4 py-5 text-center text-sm">
        <p className="text-destructive mb-3">Couldn&apos;t load activity.</p>
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  const items = query.data ?? [];

  if (items.length === 0) {
    return (
      <div className="glass-card rounded-2xl px-4 py-5 text-center text-sm text-muted-foreground">
        No transactions yet for this {chain.ticker} wallet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.slice(0, 5).map((tx) => {
          const Icon = tx.direction === "in" ? ArrowDownLeft : tx.direction === "out" ? ArrowUpRight : Repeat;
          const dirColor =
            tx.direction === "in"
              ? "text-emerald-500"
              : tx.direction === "out"
                ? "text-amber-500"
                : "text-muted-foreground";
          return (
            <a
              key={tx.txid}
              href={tx.url}
              target="_blank"
              rel="noreferrer"
              className="glass-card flex items-center gap-3 rounded-xl p-3 text-sm transition hover:bg-muted/40"
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
        })}
      </div>

      {items.length > 5 && onSeeAll && (
        <button
          onClick={onSeeAll}
          className="w-full rounded-xl border border-dashed border-border bg-transparent py-2.5 text-xs font-medium text-muted-foreground transition hover:bg-muted/30"
        >
          See all {items.length} transactions
        </button>
      )}
    </div>
  );
}
