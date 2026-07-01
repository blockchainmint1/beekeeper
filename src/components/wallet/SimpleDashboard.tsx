import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Loader2,
  Repeat,
  Wallet as WalletIcon,
  ArrowRight,
  Banknote,
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
import { deriveTronAccount, tronBalance } from "@/lib/wallet/tron";
import { deriveSolanaAccount, solanaBalance } from "@/lib/wallet/solana";
import { fetchHistory, hasNativeHistory } from "@/lib/wallet/history";
import { useVisibleChainIds } from "@/lib/wallet/visible-chains";
import { addNotification, detectNewIncoming } from "@/lib/wallet/notifications";
import { toast } from "sonner";

type AssetRow = {
  chain: ChainConfig;
  address: string;
  utxoAddrs?: HdScanAddress[];
  evmAddrs?: EvmHdAddress[];
  balance: number;
  usd: number;
};

// Dashboard homepage shows these five chains in the initial breakdown.
// The full wallet and recent transactions still scan every visible chain.
const PRIMARY_CHAIN_IDS: ChainId[] = ["txc", "eth", "base", "bsc", "btc"];

type BreakdownItem = { chain: ChainConfig; row?: AssetRow };

// Dashboard uses a tighter gap than the full Wallet view — fast first paint,
// watermark + manual refresh still extend to busier merchants.
const DASHBOARD_GAP = 20;

async function loadChainAsset(
  c: ChainConfig,
  mnemonic: string,
  price: number | null,
): Promise<AssetRow> {
  let address = "";
  let balance = 0;
  if (c.kind === "utxo") {
    const a = await deriveUtxoAccount(mnemonic, c, 0, c.defaultAddressType);
    address = a.address;
    const gap = DASHBOARD_GAP;
    const minIndex = scanCeiling(c.id, gap);
    const scan = await scanUtxoHd(mnemonic, c, {
      type: c.defaultAddressType,
      gapLimit: gap,
      minIndex,
    });
    if (scan.highestUsedIndex >= 0) bumpWatermark(c.id, scan.highestUsedIndex);
    balance = scan.totalSats / 10 ** c.decimals;
    return { chain: c, address, balance, usd: price ? balance * price : 0, utxoAddrs: scan.active };
  }
  if (c.kind === "evm") {
    const a = deriveEvmAccount(mnemonic, c, 0);
    address = a.address;
    const gap = DASHBOARD_GAP;
    const count = scanCeiling(c.id, gap);
    const scan = await scanEvmHd(mnemonic, c, { count, includeTokens: false });
    if (scan.highestUsedIndex >= 0) bumpWatermark(c.id, scan.highestUsedIndex);
    balance = Number(scan.totalNativeWei) / 1e18;
    return { chain: c, address, balance, usd: price ? balance * price : 0, evmAddrs: scan.active };
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
  return { chain: c, address, balance, usd: price ? balance * price : 0 };
}

export function SimpleDashboard({ onLocked }: { onLocked: () => void }) {
  const mnemonic = useMemo(() => getCachedMnemonic() ?? "", []);
  const [expanded, setExpanded] = useState(false);
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
        loadChainAsset(c, mnemonic, pricesQuery.data ? priceForChain(pricesQuery.data, c) : null),
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
  const expandedRows: BreakdownItem[] = useMemo(() => loadedRows.map((r) => ({ chain: r.chain, row: r })), [loadedRows]);

  const total = loadedRows.reduce((s, r) => s + r.usd, 0);
  const activeAssets = loadedRows.filter((r) => r.balance > 0);

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
          Total Balance{!allLoaded && loadedCount > 0 ? ` · ${loadedCount}/${visibleChains.length}` : ""}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <h1 className="text-[56px] leading-none font-semibold tracking-tight tabular">
            {loadedCount === 0 ? "—" : formatUsd(total)}
          </h1>
          {!allLoaded && anyLoading && loadedCount > 0 && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {expanded ? "Hide breakdown" : "Show breakdown"}
        </button>
      </section>

      <section className="px-5 mt-5">
        {loadedCount === 0 && anyLoading ? (
          <div className="glass-card rounded-2xl px-4 py-6 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning your wallets…
          </div>
        ) : (
          <div className="space-y-2">
            {(expanded ? expandedRows : primaryRows).map((item) => {
              const r = item.row;
              const chain = item.chain;
              return (
                <div key={chain.id} className="glass-card flex items-center gap-3 rounded-xl p-3">
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
              );
            })}
            {!expanded && anyLoading && (
              <div className="text-[11px] text-center text-muted-foreground py-1">
                Still scanning {primaryRows.filter((p) => !p.row).length} chain
                {primaryRows.filter((p) => !p.row).length === 1 ? "" : "s"}…
              </div>
            )}
            {expanded && anyLoading && (
              <div className="text-[11px] text-center text-muted-foreground py-1">
                Still scanning {visibleChains.length - loadedCount} chain
                {visibleChains.length - loadedCount === 1 ? "" : "s"}…
              </div>
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
