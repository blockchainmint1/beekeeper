import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { CHAIN_LIST, type ChainConfig } from "@/lib/chains";
import { Button } from "@/components/ui/button";
import { AppShell } from "./AppShell";
import { TopBar } from "./TopBar";
import { clearCachedMnemonic, getCachedMnemonic } from "@/lib/wallet/seed";
import { fetchAllPrices, priceForChain, formatUsd } from "@/lib/wallet/price";
import { deriveUtxoAccount, esplora, addressBalanceSats } from "@/lib/wallet/utxo";
import { deriveEvmAccount, evmBalance } from "@/lib/wallet/evm";
import { deriveTronAccount, tronBalance } from "@/lib/wallet/tron";
import { deriveSolanaAccount, solanaBalance } from "@/lib/wallet/solana";
import { fetchHistory, hasNativeHistory } from "@/lib/wallet/history";
import { useVisibleChainIds } from "@/lib/wallet/visible-chains";
import { addNotification, detectNewIncoming } from "@/lib/wallet/notifications";
import { toast } from "sonner";

type AssetRow = {
  chain: ChainConfig;
  address: string;
  balance: number; // native units
  usd: number;
};

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

  const assetsQuery = useQuery({
    queryKey: ["simple-assets", visibleIds.join(","), !!pricesQuery.data],
    enabled: !!mnemonic && !!pricesQuery.data,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AssetRow[]> => {
      const rows: AssetRow[] = [];
      await Promise.all(
        visibleChains.map(async (c) => {
          try {
            const price = pricesQuery.data ? priceForChain(pricesQuery.data, c) : null;
            let address = "";
            let balance = 0;
            if (c.kind === "utxo") {
              const a = await deriveUtxoAccount(mnemonic, c, 0, c.defaultAddressType);
              address = a.address;
              const info = await esplora.addressInfo(c, address);
              const sats = addressBalanceSats(info).total;
              balance = sats / 10 ** c.decimals;
            } else if (c.kind === "evm") {
              const a = deriveEvmAccount(mnemonic, c, 0);
              address = a.address;
              const wei = await evmBalance(c, address as `0x${string}`);
              balance = Number(wei) / 1e18;
            } else if (c.kind === "tron") {
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
            const usd = price ? balance * price : 0;
            rows.push({ chain: c, address, balance, usd });
          } catch {
            /* skip chain on error */
          }
        }),
      );
      return rows.sort((a, b) => b.usd - a.usd);
    },
  });

  const total = (assetsQuery.data ?? []).reduce((s, r) => s + r.usd, 0);
  const activeAssets = (assetsQuery.data ?? []).filter((r) => r.balance > 0);

  // Cross-chain recent activity — fetch from chains with native history support
  const historyQuery = useQuery({
    queryKey: ["simple-history", assetsQuery.data?.map((a) => `${a.chain.id}:${a.address}`).join(",")],
    enabled: !!assetsQuery.data && assetsQuery.data.length > 0,
    refetchInterval: 90_000,
    queryFn: async () => {
      const rows = assetsQuery.data ?? [];
      const all = await Promise.all(
        rows
          .filter((r) => hasNativeHistory(r.chain))
          .map(async (r) => {
            try {
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

  function handleLock() {
    clearCachedMnemonic();
    onLocked();
  }

  return (
    <AppShell>
      <TopBar onLock={handleLock} handle="My Funds" />

      {/* Tiny wallet link */}
      <div className="px-5 -mt-1">
        <Link
          to="/wallet"
          className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition"
        >
          Go to wallet <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Total */}
      <section className="px-5 pt-6">
        <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-[0.22em]">
          Total Balance
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <h1 className="text-[56px] leading-none font-semibold tracking-tight tabular">
            {assetsQuery.isLoading ? "—" : formatUsd(total)}
          </h1>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {expanded ? "Hide breakdown" : "Show breakdown"}
        </button>
      </section>

      {/* Asset list */}
      <section className="px-5 mt-5">
        {assetsQuery.isLoading ? (
          <div className="glass-card rounded-2xl px-4 py-6 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your funds…
          </div>
        ) : activeAssets.length === 0 && !expanded ? (
          <div className="glass-card rounded-2xl px-4 py-6 text-center text-sm text-muted-foreground">
            <WalletIcon className="mx-auto mb-2 h-5 w-5 opacity-60" />
            No active balances yet.
            <div className="mt-2">
              <Link to="/wallet" className="text-foreground underline underline-offset-2">
                Open your wallet
              </Link>{" "}
              to receive your first payment.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {(expanded ? assetsQuery.data ?? [] : activeAssets).map((r) => (
              <div key={r.chain.id} className="glass-card flex items-center gap-3 rounded-xl p-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold"
                  style={{
                    background: `color-mix(in oklab, ${r.chain.color} 22%, transparent)`,
                    color: r.chain.color,
                  }}
                >
                  {r.chain.ticker.slice(0, 3)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{r.chain.ticker}</span>
                    <span className="text-sm font-semibold tabular">{formatUsd(r.usd)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{r.chain.name}</span>
                    <span className="tabular">
                      {r.balance.toLocaleString(undefined, { maximumFractionDigits: 8 })} {r.chain.ticker}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Cash out */}
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

      {/* Transaction history */}
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
        {historyQuery.isLoading ? (
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
