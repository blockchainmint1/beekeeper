import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet as WalletIcon, LogOut, BookUser, Settings as SettingsIcon, PenLine, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CHAIN_LIST, type ChainConfig } from "@/lib/chains";
import { clearCachedMnemonic, getCachedMnemonic, wipeVault } from "@/lib/wallet/seed";
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

  useEffect(() => {
    if (!mnemonic) onLocked();
  }, [mnemonic, onLocked]);

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
          out[c.id] = { kind: "utxo", account: await deriveUtxoAccount(mnemonic, c, 0, "segwit") };
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <WalletIcon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Quad-Chain Wallet</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                TXC · ISK · ETH · BNB · BASE · POL · ZCU
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setMultiOpen(true)}>
              <Send className="mr-1.5 h-4 w-4" /> Multi-send
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSignOpen(true)}>
              <PenLine className="mr-1.5 h-4 w-4" /> Sign
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setContactsOpen(true)}>
              <BookUser className="mr-1.5 h-4 w-4" /> Contacts
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon className="mr-1.5 h-4 w-4" /> Settings
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLock}>
              <LogOut className="mr-1.5 h-4 w-4" /> Lock
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Your wallets</h1>
            <p className="text-sm text-muted-foreground">
              One recovery phrase, seven networks, real keys held only in this browser.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Native total</p>
            <p className="text-2xl font-bold tabular-nums">
              {totalQuery.data == null ? "—" : formatUsd(totalQuery.data)}
            </p>
            <p className="text-[10px] text-muted-foreground">excl. tokens</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CHAIN_LIST.map((chain) => (
            <BalanceCard
              key={chain.id}
              chain={chain}
              mnemonic={mnemonic}
              onSend={() => setSendOpen({ chain })}
              onReceive={() => setReceiveOpen(chain)}
              onHistory={() => setHistoryOpen(chain)}
              onSendToken={(symbol) => setSendOpen({ chain, tokenSymbol: symbol })}
            />
          ))}
        </div>
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