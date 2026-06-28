import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send, ArrowDownToLine, History as HistoryIcon, PenLine, Send as SendMulti,
  BookUser, Settings as SettingsIcon, ShieldAlert, Download, Plus, TrendingUp, Pickaxe, Clock,
  ScanLine, KeyRound, Puzzle, Link2, Recycle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CHAIN_LIST, type ChainConfig } from "@/lib/chains";
import { clearCachedMnemonic, getCachedMnemonic, wipeVault, isVaultBackedUp, downloadVaultBackup } from "@/lib/wallet/seed";
import { hasNectarLink } from "@/lib/wallet/nectar";
import type { UtxoAccount } from "@/lib/wallet/utxo";
import { deriveUtxoAccount } from "@/lib/wallet/utxo";
import type { EvmAccount } from "@/lib/wallet/evm";
import { deriveEvmAccount } from "@/lib/wallet/evm";
import type { TronAccount } from "@/lib/wallet/tron";
import { deriveTronAccount, tronBalance } from "@/lib/wallet/tron";
import type { SolanaAccount } from "@/lib/wallet/solana";
import { deriveSolanaAccount, solanaBalance } from "@/lib/wallet/solana";
import { SendDialog } from "./SendDialog";
import { ReceiveDialog } from "./ReceiveDialog";
import { HistoryDialog } from "./HistoryDialog";
import { RecentActivity } from "./RecentActivity";
import { ContactsDialog } from "./ContactsDialog";

import { SettingsDialog } from "./SettingsDialog";
import { SignDialog } from "./SignDialog";
import { MultiSendDialog } from "./MultiSendDialog";
import { QrLoginDialog } from "./QrLoginDialog";
import { XpubDialog } from "./XpubDialog";
import { fetchAllPrices, priceForChain, formatUsd } from "@/lib/wallet/price";
import { esplora, addressBalanceSats } from "@/lib/wallet/utxo";
import { scanEvmHd } from "@/lib/wallet/evm-sweep";
import { EvmSweepDialog } from "./EvmSweepDialog";
import { useIdleLock } from "@/lib/wallet/security";
import { useVisibleChainIds } from "@/lib/wallet/visible-chains";
import { AppShell } from "./AppShell";
import { TopBar } from "./TopBar";
import { MetalWalletCardConnected } from "./MetalWalletCardConnected";
import { ActionPanel, type ActionItem } from "./ActionPanel";
import { OmniTokensPanel } from "./OmniTokensPanel";

type AccountUnion =
  | { kind: "utxo"; account: UtxoAccount }
  | { kind: "evm"; account: EvmAccount }
  | { kind: "tron"; account: TronAccount }
  | { kind: "solana"; account: SolanaAccount };

export function Wallet({ onLocked }: { onLocked: () => void }) {
  const qc = useQueryClient();
  const mnemonic = useMemo(() => getCachedMnemonic() ?? "", []);
  const [sendOpen, setSendOpen] = useState<{ chain: ChainConfig; to?: string; tokenSymbol?: string } | null>(null);
  const [receiveOpen, setReceiveOpen] = useState<ChainConfig | null>(null);
  const [historyOpen, setHistoryOpen] = useState<ChainConfig | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [multiOpen, setMultiOpen] = useState(false);
  const [qrLoginOpen, setQrLoginOpen] = useState(false);
  const [xpubOpen, setXpubOpen] = useState<ChainConfig | null>(null);
  const [sweepOpen, setSweepOpen] = useState<ChainConfig | null>(null);
  const [backedUp, setBackedUp] = useState<boolean>(() => isVaultBackedUp());
  const [nectarLinked, setNectarLinked] = useState<boolean>(() => hasNectarLink());
  const visibleIds = useVisibleChainIds();
  const visibleChains = useMemo(
    () => CHAIN_LIST.filter((c) => visibleIds.includes(c.id)),
    [visibleIds],
  );
  const [activeChainId, setActiveChainId] = useState<string>(() => visibleIds[0] ?? "txc");
  useEffect(() => {
    if (!visibleChains.find((c) => c.id === activeChainId)) {
      setActiveChainId(visibleChains[0]?.id ?? "txc");
    }
  }, [visibleChains, activeChainId]);
  const activeIndex = Math.max(0, visibleChains.findIndex((c) => c.id === activeChainId));
  const activeChain = visibleChains[activeIndex] ?? visibleChains[0];

  // Scroll-snap tracker — derive active chain from horizontal scroll position
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
          const cCenter = c.offsetLeft + c.offsetWidth / 2;
          const d = Math.abs(cCenter - center);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        });
        const k = visibleChains[bestIdx]?.id;
        if (k && k !== activeChainId) setActiveChainId(k);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [visibleChains, activeChainId]);

  useEffect(() => {
    if (!mnemonic) onLocked();
  }, [mnemonic, onLocked]);

  function handleForceBackup() {
    const ok = downloadVaultBackup();
    if (ok) {
      setBackedUp(true);
      toast.success("Encrypted backup saved");
    } else {
      toast.error("No vault to back up");
    }
  }

  function handleLock() {
    clearCachedMnemonic();
    onLocked();
  }

  async function downloadExtension() {
    try {
      const res = await fetch("/honest-money-extension.zip");
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "honest-money-extension.zip";
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Extension ZIP downloaded");
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    }
  }

  // Auto-lock on idle / hidden tab (configured in Settings → Security).
  const handleIdleLock = useCallback(() => {
    clearCachedMnemonic();
    toast.message("Wallet locked", { description: "Auto-locked after idle." });
    onLocked();
  }, [onLocked]);
  useIdleLock(handleIdleLock);

  // Build account map (one address per chain) lazily so derivation runs on demand
  const accountQuery = useQuery({
    queryKey: ["all-accounts"],
    enabled: !!mnemonic,
    staleTime: Infinity,
    queryFn: async (): Promise<Record<string, AccountUnion>> => {
      const out: Record<string, AccountUnion> = {};
      for (const c of CHAIN_LIST) {
        if (c.kind === "utxo") {
          out[c.id] = { kind: "utxo", account: await deriveUtxoAccount(mnemonic, c, 0, c.defaultAddressType) };
        } else if (c.kind === "evm") {
          out[c.id] = { kind: "evm", account: deriveEvmAccount(mnemonic, c, 0) };
        } else if (c.kind === "tron") {
          out[c.id] = { kind: "tron", account: deriveTronAccount(mnemonic, c, 0) };
        } else {
          out[c.id] = { kind: "solana", account: deriveSolanaAccount(mnemonic, c, 0) };
        }
      }
      return out;
    },
  });

  const activeAccount = sendOpen ? accountQuery.data?.[sendOpen.chain.id] : null;

  const pricesQuery = useQuery({
    queryKey: ["prices"],
    queryFn: fetchAllPrices,
    refetchInterval: 90_000,
    staleTime: 60_000,
  });

  // Aggregate native USD across all chains
  const totalQuery = useQuery({
    queryKey: ["total-native", accountQuery.data && Object.keys(accountQuery.data).join(",")],
    enabled: !!accountQuery.data && !!pricesQuery.data,
    refetchInterval: 60_000,
    queryFn: async () => {
      const data = accountQuery.data!;
      let total = 0;
      await Promise.all(
        CHAIN_LIST.map(async (c) => {
          const a = data[c.id];
          if (!a) return;
          const price = pricesQuery.data ? priceForChain(pricesQuery.data, c) : null;
          if (!price) return;
          try {
            if (c.kind === "utxo") {
              const info = await esplora.addressInfo(c, a.account.address);
              const sats = addressBalanceSats(info).total;
              total += (sats / 10 ** c.decimals) * price;
            } else if (c.kind === "evm") {
              // Aggregate native balance across all derived EVM addresses.
              const scan = await scanEvmHd(mnemonic, c, { count: 20, includeTokens: false });
              total += (Number(scan.totalNativeWei) / 1e18) * price;
            } else if (c.kind === "tron") {
              const sun = await tronBalance(c, (a as { account: TronAccount }).account.address);
              total += (Number(sun) / 10 ** c.decimals) * price;
            } else if (c.kind === "solana") {
              const lam = await solanaBalance(c, (a as { account: SolanaAccount }).account.address);
              total += (Number(lam) / 10 ** c.decimals) * price;
            }
          } catch { /* skip chain on error */ }
        }),
      );
      return total;
    },
  });

  const chainColor = activeChain?.color ?? "oklch(0.7 0.18 35)";

  const actions: ActionItem[] = activeChain
    ? [
        { label: "Send", icon: Send, onClick: () => setSendOpen({ chain: activeChain }) },
        { label: "Receive", icon: ArrowDownToLine, onClick: () => setReceiveOpen(activeChain) },
        { label: "History", icon: HistoryIcon, onClick: () => setHistoryOpen(activeChain) },
        { label: "Sign", icon: PenLine, onClick: () => setSignOpen(true) },
        { label: "QR Login", icon: ScanLine, onClick: () => setQrLoginOpen(true) },
        { label: "Xpub", icon: KeyRound, onClick: () => setXpubOpen(activeChain) },
        ...(activeChain.kind === "evm"
          ? [{ label: "Sweep", icon: Recycle, onClick: () => setSweepOpen(activeChain) } as ActionItem]
          : []),
        { label: "Multi", icon: SendMulti, onClick: () => setMultiOpen(true) },
        { label: "Contacts", icon: BookUser, onClick: () => setContactsOpen(true) },
        { label: "Extension", icon: Puzzle, onClick: downloadExtension },
        { label: "Backup", icon: Download, onClick: handleForceBackup },
        { label: "Settings", icon: SettingsIcon, onClick: () => setSettingsOpen(true) },
      ]
    : [];

  function scrollToIndex(i: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const child = el.children[i] as HTMLElement | undefined;
    if (!child) return;
    el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.offsetWidth) / 2, behavior: "smooth" });
  }

  return (
    <AppShell>
      <TopBar onLock={handleLock} />

      {/* Total ecosystem value */}
      <section className="px-5 pt-5">
        <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-[0.22em]">
          Total Ecosystem Value
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <h1 className="text-[52px] leading-none font-semibold tracking-tight tabular">
            {totalQuery.data == null ? "—" : formatUsd(totalQuery.data)}
          </h1>
        </div>
        <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--success)" }}>
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="tabular">{visibleChains.length} {visibleChains.length === 1 ? "wallet" : "wallets"} · live</span>
        </div>
      </section>

      {!backedUp && (
        <section className="px-5 mt-4">
          <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-3">
            <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: "var(--isk)" }} />
            <div className="flex-1 text-xs text-foreground/85">
              <strong className="font-semibold">Back up your wallet.</strong> Without it, losing this browser means losing funds.
            </div>
            <Button size="sm" onClick={handleForceBackup} className="shrink-0 h-7 text-xs">
              <Download className="mr-1 h-3 w-3" /> Backup
            </Button>
          </div>
        </section>
      )}

      {!nectarLinked && (
        <section className="px-5 mt-3">
          <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-3">
            <Link2 className="w-4 h-4 shrink-0" style={{ color: "var(--success)" }} />
            <div className="flex-1 text-xs text-foreground/85">
              <strong className="font-semibold">Finish linking your Nectar Pay merchant account.</strong> Share xpubs so Nectar Pay can watch for payments.
            </div>
            <Button size="sm" onClick={() => setSettingsOpen(true)} className="shrink-0 h-7 text-xs">
              Link
            </Button>
          </div>
        </section>
      )}


      {/* Swipeable wallet cards */}
      <section className="mt-6">
        {visibleChains.length > 0 ? (
          <>
            <div
              ref={scrollerRef}
              className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-5 pb-3 no-scrollbar"
            >
              {visibleChains.map((c) => (
                <MetalWalletCardConnected
                  key={c.id}
                  chain={c}
                  mnemonic={mnemonic}
                  onClick={() => setHistoryOpen(c)}
                />
              ))}
            </div>
            <div className="flex justify-center gap-1.5 mt-1">
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
                onClick={() => setSettingsOpen(true)}
                aria-label="Add wallet"
                className="h-1.5 w-1.5 rounded-full bg-foreground/15 hover:bg-foreground/40 transition-all ml-1"
                title="Manage wallets"
              >
                <Plus className="w-2 h-2 -mt-0.5 mx-auto opacity-0" />
              </button>
            </div>
          </>
        ) : (
          <div className="mx-5 rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No wallets visible.{" "}
            <button className="underline" onClick={() => setSettingsOpen(true)}>Open Settings</button> to enable some.
          </div>
        )}
      </section>

      {/* Wallet-aware floating action panel */}
      {activeChain && (
        <section className="px-5 mt-6">
          <ActionPanel chain={activeChain} actions={actions} />
        </section>
      )}

      {/* Omni Layer tokens (TXC) */}
      {activeChain?.kind === "utxo" && activeChain.supportsOmni && (
        <section className="px-5 mt-5">
          <OmniTokensPanel
            chain={activeChain}
            address={accountQuery.data?.[activeChain.id]?.account.address ?? null}
          />
        </section>
      )}

      {/* Activity / status strip */}
      <section className="px-5 mt-5 grid grid-cols-2 gap-3">
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Pickaxe className="w-3.5 h-3.5" /> Active Chain
          </div>
          <div className="mt-1.5 text-xl font-semibold tabular truncate" style={{ color: chainColor }}>
            {activeChain?.ticker ?? "—"}
          </div>
          <div className="text-[11px] text-muted-foreground tabular truncate">{activeChain?.name ?? ""}</div>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" /> Auto-lock
          </div>
          <div className="mt-1.5 text-xl font-semibold tabular">On idle</div>
          <div className="text-[11px] text-muted-foreground">Configured in Settings</div>
        </div>
      </section>

      {/* Recent activity */}
      <section className="px-5 mt-7">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Recent Activity</h2>
          {activeChain && (
            <button onClick={() => setHistoryOpen(activeChain)} className="text-xs text-muted-foreground font-medium">
              See all
            </button>
          )}
        </div>
        <RecentActivity
          chain={activeChain}
          address={accountQuery.data?.[activeChain?.id ?? ""]?.account.address}
          onSeeAll={() => activeChain && setHistoryOpen(activeChain)}
        />
      </section>


      {sendOpen && activeAccount && (
        <SendDialog
          open={!!sendOpen}
          onOpenChange={(v) => !v && setSendOpen(null)}
          chain={sendOpen.chain}
          initialTo={sendOpen.to}
          initialTokenSymbol={sendOpen.tokenSymbol}
          account={activeAccount}
          onSent={() => {
            qc.invalidateQueries({ queryKey: ["balance"] });
            qc.invalidateQueries({ queryKey: ["tokens"] });
            qc.invalidateQueries({ queryKey: ["history"] });
          }}
        />
      )}

      {receiveOpen && accountQuery.data?.[receiveOpen.id] && (
        <ReceiveDialog
          open={!!receiveOpen}
          onOpenChange={(v) => !v && setReceiveOpen(null)}
          chain={receiveOpen}
          address={accountQuery.data[receiveOpen.id].account.address}
        />
      )}

      {historyOpen && accountQuery.data?.[historyOpen.id] && (
        <HistoryDialog
          open={!!historyOpen}
          onOpenChange={(v) => !v && setHistoryOpen(null)}
          chain={historyOpen}
          address={accountQuery.data[historyOpen.id].account.address}
        />
      )}

      <ContactsDialog
        open={contactsOpen}
        onOpenChange={setContactsOpen}
        onSendTo={(c) => {
          setContactsOpen(false);
          const chain = CHAIN_LIST.find((x) => x.id === c.chain);
          if (chain) setSendOpen({ chain, to: c.address });
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(v) => {
          setSettingsOpen(v);
          if (!v) setNectarLinked(hasNectarLink());
        }}
        onWipe={() => {
          wipeVault();
          onLocked();
          toast.success("Wallet erased from this browser");
        }}
      />

      <SignDialog open={signOpen} onOpenChange={setSignOpen} />
      <MultiSendDialog open={multiOpen} onOpenChange={setMultiOpen} />
      {activeChain && (
        <QrLoginDialog open={qrLoginOpen} onOpenChange={setQrLoginOpen} chain={activeChain} />
      )}
      {xpubOpen && (
        <XpubDialog open={!!xpubOpen} onOpenChange={(v) => !v && setXpubOpen(null)} chain={xpubOpen} />
      )}
    </AppShell>
  );
}