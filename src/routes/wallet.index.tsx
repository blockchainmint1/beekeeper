import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Link2, Send as SendIcon, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHAIN_LIST } from "@/lib/chains";
import { hasNectarLink } from "@/lib/wallet/nectar";
import { useVisibleChainIds } from "@/lib/wallet/visible-chains";
import { usePortfolioTotal } from "@/lib/wallet/portfolio";
import { formatUsd, priceForChain, type PriceMap } from "@/lib/wallet/price";
import { useScanGap } from "@/lib/wallet/scan-prefs";
import { useHideBalances, maskAmount } from "@/lib/wallet/hide-balances";
import { useWalletSession, useChainAccount } from "@/components/wallet/session";
import { MetalWalletCardConnected } from "@/components/wallet/MetalWalletCardConnected";
import { WalletDetailSheet } from "@/components/wallet/WalletDetailSheet";
import { ReorderTilesSheet } from "@/components/wallet/ReorderTilesSheet";
import { RecentActivity } from "@/components/wallet/RecentActivity";
import { OmniTokensPanel } from "@/components/wallet/OmniTokensPanel";
import { EvmTokensPanel } from "@/components/wallet/EvmTokensPanel";

export const Route = createFileRoute("/wallet/")({
  component: WalletHome,
});

function WalletHome() {
  const { mnemonic } = useWalletSession();
  const navigate = useNavigate();
  const hidden = useHideBalances();
  const visibleIds = useVisibleChainIds();
  const visibleChains = useMemo(
    () => visibleIds.map((id) => CHAIN_LIST.find((c) => c.id === id)).filter((c) => !!c),
    [visibleIds],
  );

  const [reorderOpen, setReorderOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [nectarLinked, setNectarLinked] = useState(true);
  useEffect(() => {
    setNectarLinked(hasNectarLink());
  }, []);

  const [activeChainId, setActiveChainId] = useState<string>(visibleIds[0] ?? "txc");
  useEffect(() => {
    if (!visibleChains.find((c) => c.id === activeChainId)) {
      setActiveChainId(visibleChains[0]?.id ?? "txc");
    }
  }, [visibleChains, activeChainId]);
  const activeChain = visibleChains.find((c) => c.id === activeChainId) ?? visibleChains[0];

  // Derive the active chain's index-0 address for the token/activity panels.
  const activeAccount = useChainAccount(activeChain);
  const activeAddress = activeAccount.data?.account.address ?? null;

  const total = usePortfolioTotal(mnemonic);

  // The card already fetched this chain's balance/price — reuse the cache so the
  // detail sheet doesn't trigger a second HD scan.
  const qc = useQueryClient();
  const gap = useScanGap();
  const activeNative =
    (qc.getQueryData<number>(["balance", activeChain?.id, activeAddress, gap]) ?? null);
  const activePrices = qc.getQueryData<PriceMap>(["prices"]) ?? null;
  const activePrice =
    activePrices && activeChain ? priceForChain(activePrices, activeChain) : null;
  const activeUsd = activePrice != null && activeNative != null ? activeNative * activePrice : null;

  // Snap-carousel tracker: whichever card is closest to centre is "active".
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const center = el.scrollLeft + el.clientWidth / 2;
        let bestIdx = 0;
        let bestDist = Infinity;
        Array.from(el.children).forEach((child, i) => {
          const c = child as HTMLElement;
          const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        });
        const id = visibleChains[bestIdx]?.id;
        if (id && id !== activeChainId) setActiveChainId(id);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [visibleChains, activeChainId]);

  function scrollToIndex(i: number) {
    const el = scrollerRef.current;
    const child = el?.children[i] as HTMLElement | undefined;
    if (!el || !child) return;
    el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.offsetWidth) / 2, behavior: "smooth" });
  }


  return (
    <div className="mx-auto max-w-3xl pb-40">
      {!nectarLinked && (
        <section className="mt-3 px-5">
          <div className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3">
            <Link2 className="h-4 w-4 shrink-0" style={{ color: "var(--success)" }} />
            <div className="flex-1 text-xs text-foreground/85">
              <strong className="font-semibold">Finish linking your Nectar Pay merchant account.</strong>{" "}
              Share xpubs so Nectar Pay can watch for payments.
            </div>
            <Button asChild size="sm" className="h-7 shrink-0 text-xs">
              <Link to="/wallet/settings">Link</Link>
            </Button>
          </div>
        </section>
      )}

      {/* Full-bleed swipeable card carousel — tap a card for its details */}
      <section className="mt-4">
        {visibleChains.length > 0 ? (
          <>
            <div
              ref={scrollerRef}
              className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3"
            >
              {visibleChains.map((c) => (
                <MetalWalletCardConnected
                  key={c.id}
                  chain={c}
                  mnemonic={mnemonic}
                  onClick={() => {
                    setActiveChainId(c.id);
                    setDetailOpen(true);
                  }}
                  onLongPress={() => setReorderOpen(true)}
                />
              ))}
            </div>
            <div className="mt-1 flex items-center justify-center gap-1.5">
              {visibleChains.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => scrollToIndex(i)}
                  aria-label={`Go to ${c.name}`}
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{
                    background:
                      c.id === activeChain?.id
                        ? c.color
                        : "color-mix(in oklab, var(--foreground) 25%, transparent)",
                    width: c.id === activeChain?.id ? "1.25rem" : "0.375rem",
                  }}
                />
              ))}
              <button
                onClick={() => setReorderOpen(true)}
                aria-label="Arrange wallets"
                title="Arrange wallets"
                className="ml-2 inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-medium text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
              >
                <Settings2 className="h-3 w-3" /> Arrange
              </button>
            </div>
            <p className="tabular mt-1 text-center text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {visibleChains.length} {visibleChains.length === 1 ? "wallet" : "wallets"} · live ·{" "}
              {maskAmount(total.data == null ? "—" : formatUsd(total.data), hidden)}
            </p>
          </>
        ) : (
          <div className="mx-5 rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No wallets visible.{" "}
            <button className="underline" onClick={() => setReorderOpen(true)}>
              Arrange wallets
            </button>{" "}
            to enable some.
          </div>
        )}
      </section>

      {/* Tokens on the focused chain */}
      {activeChain?.kind === "utxo" && activeChain.supportsOmni && (
        <section className="mt-5 px-5">
          <OmniTokensPanel chain={activeChain} address={activeAddress} />
        </section>
      )}
      {activeChain?.kind === "evm" && activeChain.tokens.length > 0 && (
        <section className="mt-5 px-5">
          <EvmTokensPanel chain={activeChain} mnemonic={mnemonic} address={activeAddress} />
        </section>
      )}

      {/* Recent activity */}
      <section className="mt-7 px-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent Activity</h2>
          {activeChain && (
            <Link
              to="/wallet/$chain/history"
              params={{ chain: activeChain.id }}
              className="text-xs font-medium text-muted-foreground"
            >
              See all
            </Link>
          )}
        </div>
        <RecentActivity
          chain={activeChain}
          address={activeAddress}
          onSeeAll={() =>
            activeChain &&
            navigate({ to: "/wallet/$chain/history", params: { chain: activeChain.id } })
          }
        />
      </section>

      {/* Fixed bottom actions for the focused wallet */}
      {activeChain && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
            <Button
              asChild
              variant="outline"
              className="h-11 flex-1 rounded-2xl text-sm font-semibold"
            >
              <Link to="/wallet/$chain/receive" params={{ chain: activeChain.id }}>
                <ArrowDownToLine className="mr-1.5 h-4 w-4" /> Receive
              </Link>
            </Button>
            <Button asChild className="h-11 flex-1 rounded-2xl text-sm font-semibold">
              <Link to="/wallet/$chain/send" params={{ chain: activeChain.id }} search={{}}>
                <SendIcon className="mr-1.5 h-4 w-4" /> Send {activeChain.ticker}
              </Link>
            </Button>
          </div>
        </div>
      )}

      <WalletDetailSheet
        chain={activeChain}
        address={activeAddress}
        nativeAmount={activeNative}
        usdValue={activeUsd}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />

      <ReorderTilesSheet open={reorderOpen} onOpenChange={setReorderOpen} />
    </div>
  );
}
