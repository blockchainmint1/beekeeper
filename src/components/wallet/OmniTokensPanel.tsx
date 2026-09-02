import { useQuery } from "@tanstack/react-query";
import { Coins, ExternalLink, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getOmniBalancesForAddress, type OmniBalanceEntry } from "@/lib/wallet/omni.functions";
import type { UtxoChain } from "@/lib/chains";
import { useCustomOmni } from "@/lib/wallet/custom-tokens";

function fmt(n: string) {
  const num = Number(n);
  if (!Number.isFinite(num)) return n;
  return num.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function OmniTokensPanel({ chain, address }: { chain: UtxoChain; address: string | null }) {
  const fetchBalances = useServerFn(getOmniBalancesForAddress);
  const custom = useCustomOmni(chain.id);
  const defaultIds = [...(chain.defaultOmniPropertyIds ?? []), ...custom.filter((id) => !(chain.defaultOmniPropertyIds ?? []).includes(id))];
  const q = useQuery<OmniBalanceEntry[]>({
    queryKey: ["omni-balances", chain.id, address, defaultIds?.join(",") ?? ""],
    enabled: !!address && chain.supportsOmni,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = (await fetchBalances({
        data: { address: address!, includePropertyIds: defaultIds },
      })) as unknown;
      // Defensive: some transports (native shell / proxies) can hand back a
      // wrapped or empty payload — never let a non-array reach .map().
      if (Array.isArray(res)) return res as OmniBalanceEntry[];
      const inner = (res as { result?: unknown } | null)?.result;
      return Array.isArray(inner) ? (inner as OmniBalanceEntry[]) : [];
    },
    retry: 1,
  });

  if (!chain.supportsOmni) return null;

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4" style={{ color: chain.color }} />
          <h3 className="text-sm font-semibold">Omni Tokens</h3>
        </div>
        <button
          onClick={() => q.refetch()}
          aria-label="Refresh Omni balances"
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          disabled={q.isFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {!address ? (
        <p className="text-xs text-muted-foreground">Unlock the wallet to load Omni tokens.</p>
      ) : q.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading tokens…</p>
      ) : q.isError ? (
        <p className="text-xs text-destructive">
          {(q.error as Error)?.message ?? "Failed to load Omni tokens"}
        </p>
      ) : !q.data || q.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No Omni tokens on this address yet. Tokens issued on the {chain.ticker} Omni layer
          will appear here automatically.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {q.data.map((b) => {
            const reserved = Number(b.reserved);
            return (
              <li key={b.propertyid} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{b.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular">#{b.propertyid}</span>
                  </div>
                  {reserved > 0 && (
                    <div className="text-[10.5px] text-muted-foreground tabular">
                      {fmt(b.reserved)} reserved
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular">{fmt(b.balance)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <a
        href={chain.explorerAddr(address ?? "")}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        View address on explorer <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}