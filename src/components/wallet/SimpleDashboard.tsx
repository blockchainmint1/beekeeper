import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Repeat,
  ArrowRight,
  Banknote,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { CHAINS, CHAIN_LIST, type ChainConfig, type ChainId } from "@/lib/chains";
import { Button } from "@/components/ui/button";
import { AppShell } from "./AppShell";
import { TopBar } from "./TopBar";
import { clearCachedMnemonic, getCachedMnemonic } from "@/lib/wallet/seed";
import { fetchAllPrices, priceForChain, formatUsd } from "@/lib/wallet/price";
import { deriveUtxoAccount, scanUtxoHd, type HdScanAddress } from "@/lib/wallet/utxo";
import { deriveEvmAccount } from "@/lib/wallet/evm";
import { scanEvmHd, type EvmHdAddress } from "@/lib/wallet/evm-sweep";
import { scanCeiling, bumpWatermark } from "@/lib/wallet/hd-watermark";
import { useScanGap } from "@/lib/wallet/scan-prefs";
import { deriveTronAccount, tronBalance } from "@/lib/wallet/tron";
import { deriveSolanaAccount, solanaBalance } from "@/lib/wallet/solana";
import { fetchHistory, hasNativeHistory } from "@/lib/wallet/history";
import { useVisibleChainIds } from "@/lib/wallet/visible-chains";
import { addNotification, detectNewIncoming } from "@/lib/wallet/notifications";
import { getOmniBalancesForAddress } from "@/lib/wallet/omni.functions";
import { toast } from "sonner";

type PriceMap = Record<string, number>;

type TokenLine = {
  symbol: string;
  name?: string;
  formatted: string;
  usd: number | null;
};

type AssetRow = {
  chain: ChainConfig;
  address: string;
  utxoAddrs?: HdScanAddress[];
  evmAddrs?: EvmHdAddress[];
  balance: number;
  usd: number; // native + all tokens combined
  nativeUsd: number;
  tokens: TokenLine[];
};

// Dashboard homepage only shows these five chains in the breakdown.
// The full wallet and recent transactions still scan every visible chain.
const PRIMARY_CHAIN_IDS: ChainId[] = ["txc", "eth", "base", "bsc", "btc"];

type BreakdownItem = { chain: ChainConfig; row?: AssetRow };

// Dashboard scan gap is user-tunable in Settings → Wallets. Default 20
// (BIP-44 standard); higher values catch funds sitting on high indexes.

function priceForCg(prices: PriceMap | undefined, id?: string): number | null {
  if (!prices || !id) return null;
  return prices[id] ?? null;
}

async function loadChainAsset(
  c: ChainConfig,
  mnemonic: string,
  prices: PriceMap | undefined,
  scanGap: number,
): Promise<AssetRow> {
  const nativePrice = prices ? priceForChain(prices, c) : null;
  let address = "";
  let balance = 0;
  if (c.kind === "utxo") {
    const a = await deriveUtxoAccount(mnemonic, c, 0, c.defaultAddressType);
    address = a.address;
    const gap = scanGap;
    const minIndex = scanCeiling(c.id, gap);
    const scan = await scanUtxoHd(mnemonic, c, {
      type: c.defaultAddressType,
      gapLimit: gap,
      minIndex,
    });
    if (scan.highestUsedIndex >= 0) bumpWatermark(c.id, scan.highestUsedIndex);
    balance = scan.totalSats / 10 ** c.decimals;
    const nativeUsd = nativePrice ? balance * nativePrice : 0;

    // TXC: aggregate Omni-layer tokens (L2 stables) across every active address.
    const tokens: TokenLine[] = [];
    if (c.id === "txc" && c.supportsOmni && scan.active.length > 0) {
      try {
        const perAddr = await Promise.all(
          scan.active.map((h) =>
            getOmniBalancesForAddress({ data: { address: h.address } }).catch(() => []),
          ),
        );
        const agg = new Map<number, { name: string; total: number }>();
        for (const items of perAddr) {
          for (const it of items) {
            const bal = parseFloat(it.balance);
            if (!isFinite(bal) || bal <= 0) continue;
            const prev = agg.get(it.propertyid);
            agg.set(it.propertyid, {
              name: it.name ?? `Property #${it.propertyid}`,
              total: (prev?.total ?? 0) + bal,
            });
          }
        }
        for (const { name, total } of agg.values()) {
          tokens.push({
            symbol: name,
            formatted: total.toLocaleString(undefined, { maximumFractionDigits: 6 }),
            usd: null, // Omni tokens have no price feed
          });
        }
      } catch { /* ignore omni failures */ }
    }

    return {
      chain: c,
      address,
      balance,
      usd: nativeUsd,
      nativeUsd,
      tokens,
      utxoAddrs: scan.active,
    };
  }
  if (c.kind === "evm") {
    const a = deriveEvmAccount(mnemonic, c, 0);
    address = a.address;
    const gap = scanGap;
    const count = scanCeiling(c.id, gap);
    const scan = await scanEvmHd(mnemonic, c, { count, includeTokens: true });
    if (scan.highestUsedIndex >= 0) bumpWatermark(c.id, scan.highestUsedIndex);
    balance = Number(scan.totalNativeWei) / 1e18;
    const nativeUsd = nativePrice ? balance * nativePrice : 0;

    const tokens: TokenLine[] = scan.tokenTotals.map((tt) => {
      const amount = Number(tt.raw) / 10 ** tt.token.decimals;
      const px = priceForCg(prices, tt.token.coingeckoId);
      return {
        symbol: tt.token.symbol,
        name: tt.token.name,
        formatted: amount.toLocaleString(undefined, { maximumFractionDigits: 6 }),
        usd: px != null ? amount * px : null,
      };
    });
    const tokenUsd = tokens.reduce((s, t) => s + (t.usd ?? 0), 0);

    return {
      chain: c,
      address,
      balance,
      usd: nativeUsd + tokenUsd,
      nativeUsd,
      tokens,
      evmAddrs: scan.active,
    };
  }
  if (c.kind === "tron") {
    const a = deriveTronAccount(mnemonic, c, 0);
    address = a.address;
    const sun = await tronBalance(c, address);
    balance = Number(sun) / 10 ** c.decimals;
  } else {
    const a = deriveSolanaAccount(mnemonic, c, 0);
    address = a.address;
    const lam = await solanaBalance(c, address);
    balance = Number(lam) / 10 ** c.decimals;
  }
  const nativeUsd = nativePrice ? balance * nativePrice : 0;
  return { chain: c, address, balance, usd: nativeUsd, nativeUsd, tokens: [] };
}


export function SimpleDashboard({ onLocked }: { onLocked: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const mnemonic = useMemo(() => getCachedMnemonic() ?? "", []);
  const visibleIds = useVisibleChainIds();
  const visibleChains = useMemo(
    () => CHAIN_LIST.filter((c) => visibleIds.includes(c.id)),
    [visibleIds],
  );

  const pricesQuery = useQuery({
    queryKey: ["prices"],
    queryFn: fetchAllPrices,
    refetchInterval: 90_000,
    staleTime: 60_000,
  });

  // One query PER chain — rows appear independently as each chain finishes.
  const chainQueries = useQueries({
    queries: visibleChains.map((c) => ({
      queryKey: ["simple-asset", c.id, !!pricesQuery.data],
      enabled: !!mnemonic && !!pricesQuery.data,
      refetchInterval: 60_000,
      staleTime: 30_000,
      queryFn: () =>
        loadChainAsset(c, mnemonic, pricesQuery.data),
    })),
  });

  const loadedRows: AssetRow[] = useMemo(
    () =>
      chainQueries
        .map((q) => q.data)
        .filter((r): r is AssetRow => !!r)
        .sort((a, b) => b.usd - a.usd),
    [chainQueries],
  );
  const loadedCount = chainQueries.filter((q) => !!q.data).length;
  const allLoaded = visibleChains.length > 0 && loadedCount === visibleChains.length;
  const anyLoading = chainQueries.some((q) => q.isLoading);

  const primaryRows: BreakdownItem[] = useMemo(
    () =>
      PRIMARY_CHAIN_IDS.map((id) => ({ chain: CHAINS[id], row: loadedRows.find((r) => r.chain.id === id) })),
    [loadedRows],
  );

  const visiblePrimaryCount = PRIMARY_CHAIN_IDS.filter((id) => visibleIds.includes(id)).length;
  const primaryLoadedCount = primaryRows.filter((p) => !!p.row).length;
  const primaryAllLoaded = primaryLoadedCount === visiblePrimaryCount;
  const primaryLoadingCount = visiblePrimaryCount - primaryLoadedCount;


  const total = primaryRows.reduce((s, p) => s + (p.row?.usd ?? 0), 0);

  // Cross-chain recent activity — only run when at least one row is in.
  const historyQuery = useQuery({
    queryKey: [
      "simple-history",
      loadedRows.map((a) => `${a.chain.id}:${a.address}`).join(","),
    ],
    enabled: loadedRows.length > 0,
    refetchInterval: 90_000,
    queryFn: async () => {
      const rows = loadedRows;
      const all = await Promise.all(
        rows
          .filter((r) => hasNativeHistory(r.chain))
          .map(async (r) => {
            try {
              if (r.chain.kind === "utxo" && r.utxoAddrs && r.utxoAddrs.length > 0) {
                const perAddr = await Promise.all(
                  r.utxoAddrs.map((h) => fetchHistory(r.chain, h.address).catch(() => [])),
                );
                const seen = new Set<string>();
                const merged: Array<Awaited<ReturnType<typeof fetchHistory>>[number] & { chain: ChainConfig }> = [];
                for (const items of perAddr) {
                  for (const it of items) {
                    if (seen.has(it.txid)) continue;
                    seen.add(it.txid);
                    merged.push({ ...it, chain: r.chain });
                  }
                }
                return merged.slice(0, 10);
              }
              const items = await fetchHistory(r.chain, r.address);
              return items.slice(0, 5).map((it) => ({ ...it, chain: r.chain }));
            } catch {
              return [];
            }
          }),
      );
      return all
        .flat()
        .sort((a, b) => (b.whenSec ?? 0) - (a.whenSec ?? 0))
        .slice(0, 5);
    },
  });

  // Detect new incoming transactions and fire notifications.
  const lastFetchedAt = useRef<number | null>(null);
  useEffect(() => {
    const items = historyQuery.data;
    if (!items) return;
    const fetchedAt = historyQuery.dataUpdatedAt;
    if (lastFetchedAt.current === fetchedAt) return;
    lastFetchedAt.current = fetchedAt;

    const fresh = detectNewIncoming(items);
    for (const it of fresh) {
      addNotification({
        id: `${it.chain.id}:${it.txid}`,
        chainId: it.chain.id,
        ticker: it.ticker,
        amount: it.amount,
        txid: it.txid,
        url: it.url,
        whenSec: Math.floor(Date.now() / 1000),
        read: false,
      });
      toast.success(`+${it.amount} ${it.ticker} received`, {
        description: it.confirmed ? "Confirmed" : "Pending",
        action: { label: "View", onClick: () => window.open(it.url, "_blank") },
      });
    }
  }, [historyQuery.data, historyQuery.dataUpdatedAt]);

  function handleLock() {
    clearCachedMnemonic();
    onLocked();
  }

  return (
    <AppShell>
      <TopBar onLock={handleLock} handle="My Funds" />

      <div className="px-5 -mt-1">
        <Link
          to="/wallet"
          className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition"
        >
          Go to wallet <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <section className="px-5 pt-6">
        <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-[0.22em]">
          Total Balance{!primaryAllLoaded && primaryLoadedCount > 0 ? ` · ${primaryLoadedCount}/${visiblePrimaryCount}` : ""}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <h1 className="text-[56px] leading-none font-semibold tracking-tight tabular">
            {primaryLoadedCount === 0 ? "—" : formatUsd(total)}
          </h1>
          {!primaryAllLoaded && anyLoading && primaryLoadedCount > 0 && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </section>

      <section className="px-5 mt-5">
        {loadedCount === 0 && anyLoading ? (
          <div className="glass-card rounded-2xl px-4 py-6 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning your wallets…
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="w-full glass-card flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition hover:bg-muted/40"
            >
              <span>{expanded ? "Hide breakdown" : "Show breakdown"}</span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>

            {expanded && (
              <>
                {primaryRows.map((item) => {
                  const r = item.row;
                  const chain = item.chain;
                  return (
                    <div key={chain.id} className="glass-card flex flex-col gap-2 rounded-xl p-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold"
                          style={{
                            background: `color-mix(in oklab, ${chain.color} 22%, transparent)`,
                            color: chain.color,
                          }}
                        >
                          {chain.ticker.slice(0, 3)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm">{chain.ticker}</span>
                            {r ? (
                              <span className="text-sm font-semibold tabular">{formatUsd(r.usd)}</span>
                            ) : (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                            <span className="truncate">{chain.name}</span>
                            {r ? (
                              <span className="tabular">
                                {r.balance.toLocaleString(undefined, { maximumFractionDigits: 8 })} {chain.ticker}
                              </span>
                            ) : (
                              <span>Scanning…</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {r && r.tokens.length > 0 && (
                        <div className="pl-12 -mt-0.5 flex flex-col gap-1 border-l border-border/40 ml-4">
                          {r.tokens.map((t) => (
                            <div
                              key={t.symbol}
                              className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground pl-3"
                            >
                              <span className="truncate">
                                <span className="font-medium text-foreground/80">{t.symbol}</span>
                                <span className="tabular ml-1.5">{t.formatted}</span>
                              </span>
                              {t.usd != null && (
                                <span className="tabular">{formatUsd(t.usd)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {!primaryAllLoaded && anyLoading && primaryLoadingCount > 0 && (
                  <div className="text-[11px] text-center text-muted-foreground py-1">
                    Still scanning {primaryLoadingCount} chain
                    {primaryLoadingCount === 1 ? "" : "s"}…
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section className="px-5 mt-5">
        <Button
          disabled
          className="w-full h-12 rounded-2xl text-sm font-semibold"
          onClick={() => toast.info("Cash Out is coming soon.")}
        >
          <Banknote className="mr-2 h-4 w-4" />
          Cash Out — Coming Soon
        </Button>
        <p className="mt-2 text-[11px] text-center text-muted-foreground px-4">
          One tap to convert everything to USDC and send to your bank.
        </p>
      </section>

      <section className="px-5 mt-7">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Recent Transactions</h2>
          <Link
            to="/wallet"
            className="text-xs text-muted-foreground font-medium hover:text-foreground transition"
          >
            See all
          </Link>
        </div>
        {historyQuery.isLoading && loadedRows.length > 0 ? (
          <div className="glass-card rounded-2xl px-4 py-6 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (historyQuery.data ?? []).length === 0 ? (
          <div className="glass-card rounded-2xl px-4 py-5 text-center text-sm text-muted-foreground">
            No transactions yet.
          </div>
        ) : (
          <div className="space-y-2">
            {(historyQuery.data ?? []).map((tx) => {
              const Icon =
                tx.direction === "in" ? ArrowDownLeft : tx.direction === "out" ? ArrowUpRight : Repeat;
              const dirColor =
                tx.direction === "in"
                  ? "text-emerald-500"
                  : tx.direction === "out"
                    ? "text-amber-500"
                    : "text-muted-foreground";
              return (
                <a
                  key={`${tx.chain.id}-${tx.txid}`}
                  href={tx.url}
                  target="_blank"
                  rel="noreferrer"
                  className="glass-card flex items-center gap-3 rounded-xl p-3 text-sm transition hover:bg-muted/40"
                >
                  <Icon className={`h-4 w-4 shrink-0 ${dirColor}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize">
                        {tx.direction} · {tx.chain.ticker}
                      </span>
                      <span className={`font-mono text-xs ${tx.confirmed ? "" : "text-amber-500"}`}>
                        {tx.confirmed
                          ? new Date((tx.whenSec ?? 0) * 1000).toLocaleDateString()
                          : "Pending"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {tx.txid}
                      </span>
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
        )}
      </section>

      <div className="px-5 mt-8 flex justify-center">
        <button
          onClick={handleLock}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition"
        >
          <LogOut className="w-3 h-3" /> Lock
        </button>
      </div>
    </AppShell>
  );
}
