/**
 * Omni Layer token activity (e.g. TSD on TEXITcoin).
 *
 * Native chain history only shows the coins moving — the dust output that
 * carries a token transfer looks like a trivial payment. The token layer keeps
 * its own ledger, so token sends and receipts are listed from the node here.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownLeft, ArrowUpRight, Coins, Loader2, RefreshCw } from "lucide-react";
import type { UtxoChain } from "@/lib/chains";
import { getOmniTransactions, type OmniTxEntry } from "@/lib/wallet/omni.functions";
import { chainOmniPropertyIds } from "@/lib/wallet/custom-tokens";
import { builtinOmniMeta } from "@/lib/wallet/omni-tokens";

export function OmniActivity({
  chain,
  address,
  enabled = true,
}: {
  chain: UtxoChain;
  address: string;
  enabled?: boolean;
}) {
  const fetchTxs = useServerFn(getOmniTransactions);
  const ids = chain.supportsOmni ? chainOmniPropertyIds(chain) : [];
  const q = useQuery<OmniTxEntry[]>({
    queryKey: ["omni-txs", chain.id, address, ids.join(",")],
    enabled: enabled && !!address && chain.supportsOmni,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = (await fetchTxs({ data: { address, propertyIds: ids } })) as unknown;
      if (Array.isArray(res)) return res as OmniTxEntry[];
      const inner = (res as { result?: unknown } | null)?.result;
      return Array.isArray(inner) ? (inner as OmniTxEntry[]) : [];
    },
  });

  if (!chain.supportsOmni) return null;

  return (
    <div className="rounded-xl border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="h-3.5 w-3.5" style={{ color: chain.color }} />
          <h3 className="text-xs font-semibold">Token activity</h3>
        </div>
        <button
          onClick={() => q.refetch()}
          aria-label="Refresh token activity"
          disabled={q.isFetching}
          className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {q.isLoading ? (
        <div className="flex items-center py-3 text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading token transfers…
        </div>
      ) : q.isError ? (
        <p className="py-2 text-xs text-destructive">Couldn't load token transfers.</p>
      ) : (q.data ?? []).length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">
          No token transfers on this address yet.
        </p>
      ) : (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {(q.data ?? []).map((tx) => {
            const outgoing = tx.sendingaddress === address;
            const Icon = outgoing ? ArrowUpRight : ArrowDownLeft;
            const meta = tx.propertyid != null ? builtinOmniMeta(tx.propertyid) : null;
            const pending = (tx.confirmations ?? 0) === 0;
            return (
              <li key={tx.txid}>
                <a
                  href={chain.explorerTx(tx.txid)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 rounded-md border bg-card p-2 text-sm transition hover:bg-muted/40"
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${outgoing ? "text-amber-500" : "text-emerald-500"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        {outgoing ? "Sent" : "Received"} {meta?.symbol ?? `#${tx.propertyid}`}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums">
                        {outgoing ? "−" : "+"}
                        {tx.amount ?? "0"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                        {tx.txid}
                      </span>
                      <span
                        className={`shrink-0 text-[10.5px] ${pending ? "text-amber-500" : "text-muted-foreground"}`}
                      >
                        {pending
                          ? "Unconfirmed"
                          : new Date((tx.blocktime ?? 0) * 1000).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
