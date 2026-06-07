import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet as WalletIcon, LogOut, BookUser, Settings as SettingsIcon, PenLine, Send, ShieldAlert, Download } from "lucide-react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CHAIN_LIST, type ChainConfig } from "@/lib/chains";
import { clearCachedMnemonic, getCachedMnemonic, wipeVault, isVaultBackedUp, downloadVaultBackup } from "@/lib/wallet/seed";
import { deriveUtxoAccount, type UtxoAccount } from "@/lib/wallet/utxo";
import { deriveEvmAccount, type EvmAccount } from "@/lib/wallet/evm";
import { BalanceCard } from "./BalanceCard";
import { SendDialog } from "./SendDialog";
import { ReceiveDialog } from "./ReceiveDialog";
import { HistoryDialog } from "./HistoryDialog";
import { ContactsDialog } from "./ContactsDialog";
import { SettingsDialog } from "./SettingsDialog";
import { SignDialog } from "./SignDialog";
import { MultiSendDialog } from "./MultiSendDialog";
import { fetchAllPrices, priceForChain, formatUsd } from "@/lib/wallet/price";
import { esplora, addressBalanceSats } from "@/lib/wallet/utxo";
import { evmBalance } from "@/lib/wallet/evm";
import { useIdleLock } from "@/lib/wallet/security";
import { useVisibleChainIds } from "@/lib/wallet/visible-chains";

type AccountUnion =
  | { kind: "utxo"; account: UtxoAccount }
  | { kind: "evm"; account: EvmAccount };

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
  const [backedUp, setBackedUp] = useState<boolean>(() => isVaultBackedUp());
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
  const prevIndexRef = useRef(activeIndex);
  const direction = activeIndex >= prevIndexRef.current ? 1 : -1;
  useEffect(() => { prevIndexRef.current = activeIndex; }, [activeIndex]);

  const goTo = useCallback((idx: number) => {
    if (visibleChains.length === 0) return;
    const wrapped = ((idx % visibleChains.length) + visibleChains.length) % visibleChains.length;
    setActiveChainId(visibleChains[wrapped].id);
  }, [visibleChains]);

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable)) return;
      if (e.key === "ArrowRight") goTo(activeIndex + 1);
      else if (e.key === "ArrowLeft") goTo(activeIndex - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, goTo]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    const threshold = 60;
    if (info.offset.x < -threshold || info.velocity.x < -400) goTo(activeIndex + 1);
    else if (info.offset.x > threshold || info.velocity.x > 400) goTo(activeIndex - 1);
  }

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
        } else {
          out[c.id] = { kind: "evm", account: deriveEvmAccount(mnemonic, c, 0) };
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
            } else {
              const wei = await evmBalance(c, (a as { account: EvmAccount }).account.address);
              total += (Number(wei) / 1e18) * price;
            }
          } catch { /* skip chain on error */ }
        }),
      );
      return total;
    },
  });

  const chainColor = activeChain?.color ?? "oklch(0.7 0.18 35)";

  return (
    <div
      className="relative min-h-screen overflow-hidden transition-colors duration-700"
      style={{ ["--chain" as string]: chainColor }}
    >
      {/* Animated chain-tinted ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-background" />
      <AnimatePresence mode="sync">
        <motion.div
          key={activeChain?.id ?? "none"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
        >
          <div
            className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl opacity-30"
            style={{ background: `radial-gradient(circle, ${chainColor} 0%, transparent 70%)` }}
          />
          <div
            className="absolute -bottom-40 right-0 h-[420px] w-[420px] rounded-full blur-3xl opacity-20"
            style={{ background: `radial-gradient(circle, ${chainColor} 0%, transparent 70%)` }}
          />
        </motion.div>
      </AnimatePresence>

      <header className="border-b border-border/50 bg-background/70 backdrop-blur-xl sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2 min-w-0">
            <motion.div
              key={activeChain?.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-background shadow-lg"
              style={{ background: chainColor, boxShadow: `0 6px 24px -6px ${chainColor}` }}
            >
              <WalletIcon className="h-4 w-4" />
            </motion.div>
            <div className="min-w-0">
              <AnimatePresence mode="wait">
                <motion.p
                  key={activeChain?.id ?? "none"}
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -6, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-sm font-bold leading-tight truncate"
                >
                  {activeChain?.name ?? "Honest Money"}
                </motion.p>
              </AnimatePresence>
              <p className="hidden sm:block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Honest Money · {activeChain?.ticker ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon" onClick={() => setMultiOpen(true)} aria-label="Multi-send" title="Multi-send">
              <Send className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setSignOpen(true)} aria-label="Sign" title="Sign">
              <PenLine className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setContactsOpen(true)} aria-label="Contacts" title="Contacts">
              <BookUser className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">
              <SettingsIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLock} aria-label="Lock" title="Lock">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {visibleChains.length > 0 && (
          <div className="border-t border-border/50 bg-background/40">
            <div className="mx-auto max-w-5xl px-3 sm:px-4">
              <div className="flex gap-1.5 overflow-x-auto py-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {visibleChains.map((c) => {
                  const active = c.id === activeChain?.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveChainId(c.id)}
                      className={cn(
                        "relative shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
                        active ? "text-background" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="chain-pill"
                          className="absolute inset-0 rounded-full shadow-md"
                          style={{ background: c.color }}
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />
                      )}
                      <span className="relative flex items-center gap-1.5">
                        {!active && (
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ background: c.color }}
                          />
                        )}
                        {c.ticker}
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="shrink-0 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40"
                  title="Manage wallets"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {!backedUp && (
        <div className="border-b border-amber-500/40 bg-amber-500/10">
          <div className="mx-auto flex max-w-5xl flex-col sm:flex-row flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                <strong>Back up your wallet.</strong> Download the encrypted vault file — without it, losing this browser means losing your funds.
              </span>
            </div>
            <Button size="sm" onClick={handleForceBackup} className="shrink-0">
              <Download className="mr-1.5 h-4 w-4" /> Download backup
            </Button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: chainColor }}>
              Wallet {activeIndex + 1} of {visibleChains.length}
            </p>
            <AnimatePresence mode="wait">
              <motion.h1
                key={activeChain?.id ?? "none"}
                initial={{ x: 12 * direction, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -12 * direction, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="text-3xl font-bold tracking-tight"
              >
                {activeChain?.name ?? "Your wallet"}
              </motion.h1>
            </AnimatePresence>
            <p className="text-sm text-muted-foreground">
              Swipe, drag, or use ← → to switch wallets.
            </p>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Native total</p>
            <p className="text-2xl font-bold tabular-nums">
              {totalQuery.data == null ? "—" : formatUsd(totalQuery.data)}
            </p>
            <p className="text-[10px] text-muted-foreground">across visible wallets</p>
          </div>
        </div>

        {activeChain ? (
          <div className="mx-auto max-w-xl">
            <div className="relative overflow-hidden">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={activeChain.id}
                  custom={direction}
                  initial={{ x: 60 * direction, opacity: 0, scale: 0.98 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ x: -60 * direction, opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 260, damping: 28 }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.18}
                  onDragEnd={handleDragEnd}
                  className="cursor-grab active:cursor-grabbing touch-pan-y"
                >
                  <BalanceCard
                    chain={activeChain}
                    mnemonic={mnemonic}
                    onSend={() => setSendOpen({ chain: activeChain })}
                    onReceive={() => setReceiveOpen(activeChain)}
                    onHistory={() => setHistoryOpen(activeChain)}
                    onSendToken={(symbol) => setSendOpen({ chain: activeChain, tokenSymbol: symbol })}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {visibleChains.length > 1 && (
              <div className="mt-5 flex items-center justify-center gap-1.5">
                {visibleChains.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => goTo(i)}
                    aria-label={`Go to ${c.name}`}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === activeIndex ? "w-6" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                    )}
                    style={i === activeIndex ? { background: chainColor } : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No wallets visible. Open <button className="underline" onClick={() => setSettingsOpen(true)}>Settings</button> to enable some.
          </div>
        )}
      </main>

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
        onOpenChange={setSettingsOpen}
        onWipe={() => {
          wipeVault();
          onLocked();
          toast.success("Wallet erased from this browser");
        }}
      />

      <SignDialog open={signOpen} onOpenChange={setSignOpen} />
      <MultiSendDialog open={multiOpen} onOpenChange={setMultiOpen} />
    </div>
  );
}