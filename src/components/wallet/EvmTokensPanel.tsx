import { useQuery } from "@tanstack/react-query";
import { Coins, ExternalLink, RefreshCw } from "lucide-react";
import type { EvmChain } from "@/lib/chains";
import { scanEvmHd } from "@/lib/wallet/evm-sweep";
import { scanCeiling, bumpWatermark } from "@/lib/wallet/hd-watermark";
import { getScanGap, useScanGap } from "@/lib/wallet/scan-prefs";
import { fetchAllPrices, priceForCoingeckoId, formatUsd } from "@/lib/wallet/price";

function fmtAmount(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function EvmTokensPanel({
  chain,
  mnemonic,
  address,
}: {
  chain: EvmChain;
  mnemonic: string;
  address: string | null;
}) {
  const gap = useScanGap();

  const scan = useQuery({
    queryKey: ["evm-tokens-panel", chain.id, gap],
    enabled: !!mnemonic && chain.tokens.length > 0,
    refetchInterval: 90_000,
    staleTime: 30_000,
    queryFn: async () => {
      const count = scanCeiling(chain.id, getScanGap());
      const result = await scanEvmHd(mnemonic, chain, { count, includeTokens: true });
      if (result.highestUsedIndex >= 0) bumpWatermark(chain.id, result.highestUsedIndex);
      return result;
    },
  });

  const prices = useQuery({
    queryKey: ["prices"],
    queryFn: fetchAllPrices,
    refetchInterval: 90_000,
    staleTime: 60_000,
  });

  if (chain.tokens.length === 0) return null;

  const totals = scan.data?.tokenTotals ?? [];
  const hasBalances = totals.some((t) => t.raw > 0n);

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4" style={{ color: chain.color }} />
          <h3 className="text-sm font-semibold">Tokens</h3>
        </div>
        <button
          onClick={() => scan.refetch()}
          aria-label="Refresh token balances"
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          disabled={scan.isFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scan.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {scan.isLoading ? (
        <p className="text-xs text-muted-foreground">Scanning tokens…</p>
      ) : scan.isError ? (
        <p className="text-xs text-destructive">
          {(scan.error as Error)?.message ?? "Failed to load tokens"}
        </p>
      ) : !hasBalances ? (
        <p className="text-xs text-muted-foreground">
          No ERC-20 balances detected on {chain.name}.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {totals
            .filter((t) => t.raw > 0n)
            .map((t) => {
              const amount = Number(t.formatted);
              const price = prices.data
                ? priceForCoingeckoId(prices.data, t.token.coingeckoId)
                : null;
              const usd = price != null ? amount * price : null;
              return (
                <li
                  key={t.token.address}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.token.symbol}</div>
                    <div className="text-[10.5px] text-muted-foreground truncate">
                      on {chain.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular">{fmtAmount(amount)}</div>
                    <div className="text-[10.5px] text-muted-foreground tabular">
                      {usd == null ? "—" : formatUsd(usd)}
                    </div>
                  </div>
                </li>
              );
            })}
        </ul>
      )}

      {address && (
        <a
          href={chain.explorerAddr(address)}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          View address on explorer <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}
