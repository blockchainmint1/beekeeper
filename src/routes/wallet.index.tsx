import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, TrendingUp, ShieldAlert, Download, Link2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CHAIN_LIST } from "@/lib/chains";
import { downloadVaultBackup, isVaultBackedUp } from "@/lib/wallet/seed";
import { hasNectarLink } from "@/lib/wallet/nectar";
import { useVisibleChainIds } from "@/lib/wallet/visible-chains";
import { usePortfolioTotal } from "@/lib/wallet/portfolio";
import { formatUsd } from "@/lib/wallet/price";
import { useHideBalances, maskAmount } from "@/lib/wallet/hide-balances";
import { useWalletSession, useChainAccount } from "@/components/wallet/session";
import { MetalWalletCardConnected } from "@/components/wallet/MetalWalletCardConnected";
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
  const [backedUp, setBackedUp] = useState(true);
  const [nectarLinked, setNectarLinked] = useState(true);
  useEffect(() => {
    setBackedUp(isVaultBackedUp());
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

  function handleBackup() {
    if (downloadVaultBackup()) {
      setBackedUp(true);
      toast.success("Encrypted backup saved");
    } else {
      toast.error("No vault to back up");
    }
  }

  return (
    <div className="mx-auto max-w-3xl pb-32">
      {/* Portfolio total */}
      <section className="px-5 pt-5 text-center">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Total Ecosystem Value
        </div>
        <h1 className="tabular mt-2 text-[46px] font-semibold leading-none tracking-tight">
          {maskAmount(total.data == null ? "—" : formatUsd(total.data), hidden)}
        </h1>
        <div
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium"
          style={{ color: "var(--success)" }}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="tabular">
            {visibleChains.length} {visibleChains.length === 1 ? "wallet" : "wallets"} · live
          </span>
        </div>
      </section>

      {!backedUp && (
        <section className="mt-4 px-5">
          <div className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3">
            <ShieldAlert className="h-4 w-4 shrink-0" style={{ color: "var(--isk)" }} />
            <div className="flex-1 text-xs text-foreground/85">
              <strong className="font-semibold">Back up your wallet.</strong> Without it, losing this
              browser means losing funds.
            </div>
            <Button size="sm" onClick={handleBackup} className="h-7 shrink-0 text-xs">
              <Download className="mr-1 h-3 w-3" /> Backup
            </Button>
          </div>
        </section>
      )}

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

      {/* Full-bleed card carousel with on-card actions */}
      <section className="mt-6">
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
                  onClick={() => navigate({ to: "/wallet/$chain/history", params: { chain: c.id } })}
                  onSend={() => navigate({ to: "/wallet/$chain/send", params: { chain: c.id }, search: {} })}
                  onReceive={() => navigate({ to: "/wallet/$chain/receive", params: { chain: c.id } })}
                  onHistory={() => navigate({ to: "/wallet/$chain/history", params: { chain: c.id } })}
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

      {/* Per-chain quick links */}
      {activeChain && (
        <section className="mt-5 flex flex-wrap gap-2 px-5">
          <QuickLink to="/wallet/$chain/xpub" chain={activeChain.id}>Xpub</QuickLink>
          <QuickLink to="/wallet/$chain/qr-login" chain={activeChain.id}>QR login</QuickLink>
          {activeChain.kind === "evm" && (
            <QuickLink to="/wallet/$chain/sweep" chain={activeChain.id}>Scan &amp; sweep</QuickLink>
          )}
          {activeChain.kind === "utxo" && (
            <QuickLink to="/wallet/$chain/consolidate" chain={activeChain.id}>Consolidate</QuickLink>
          )}
          <Link
            to="/wallet/security"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
          >
            Security
          </Link>
        </section>
      )}

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

      <ReorderTilesSheet open={reorderOpen} onOpenChange={setReorderOpen} />
    </div>
  );
}

function QuickLink({
  to,
  chain,
  children,
}: {
  to: "/wallet/$chain/xpub" | "/wallet/$chain/qr-login" | "/wallet/$chain/sweep" | "/wallet/$chain/consolidate";
  chain: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      params={{ chain }}
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
    >
      <Plus className="h-3 w-3 opacity-60" />
      {children}
    </Link>
  );
}
