import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet as WalletIcon, LogOut, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CHAIN_LIST, type ChainConfig } from "@/lib/chains";
import { clearCachedMnemonic, getCachedMnemonic, wipeVault } from "@/lib/wallet/seed";
import { deriveUtxoAccount, type UtxoAccount } from "@/lib/wallet/utxo";
import { deriveEvmAccount, type EvmAccount } from "@/lib/wallet/evm";
import { BalanceCard } from "./BalanceCard";
import { SendDialog } from "./SendDialog";
import { ReceiveDialog } from "./ReceiveDialog";

type AccountUnion =
  | { kind: "utxo"; account: UtxoAccount }
  | { kind: "evm"; account: EvmAccount };

export function Wallet({ onLocked }: { onLocked: () => void }) {
  const qc = useQueryClient();
  const mnemonic = useMemo(() => getCachedMnemonic() ?? "", []);
  const [sendOpen, setSendOpen] = useState<ChainConfig | null>(null);
  const [receiveOpen, setReceiveOpen] = useState<ChainConfig | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);

  useEffect(() => {
    if (!mnemonic) onLocked();
  }, [mnemonic, onLocked]);

  function handleLock() {
    clearCachedMnemonic();
    onLocked();
  }

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

  const activeAccount = sendOpen ? accountQuery.data?.[sendOpen.id] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <WalletIcon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Tri-Chain Wallet</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                TXC · ISK · ETH
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setBackupOpen(true)}>
              <ShieldCheck className="mr-1.5 h-4 w-4" /> Backup
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLock}>
              <LogOut className="mr-1.5 h-4 w-4" /> Lock
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Your wallets</h1>
          <p className="text-sm text-muted-foreground">
            One recovery phrase, three chains, real keys held only in this browser.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CHAIN_LIST.map((chain) => (
            <BalanceCard
              key={chain.id}
              chain={chain}
              mnemonic={mnemonic}
              onSend={() => setSendOpen(chain)}
              onReceive={() => setReceiveOpen(chain)}
            />
          ))}
        </div>

        <Card className="mt-8 border-dashed">
          <CardHeader>
            <CardTitle className="text-base">How this works</CardTitle>
            <CardDescription>
              Your single BIP39 seed derives keys for all three chains:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DerivationRow chain="TXC" path="m/84'/696969'/0'/0/0" type="Native SegWit (txc1…)" />
            <DerivationRow chain="ISK" path="m/84'/969696'/0'/0/0" type="Native SegWit (isk1…)" />
            <DerivationRow chain="ETH" path="m/44'/60'/0'/0/0" type="Standard EVM account" />
          </CardContent>
        </Card>
      </main>

      {sendOpen && activeAccount && (
        <SendDialog
          open={!!sendOpen}
          onOpenChange={(v) => !v && setSendOpen(null)}
          chain={sendOpen}
          account={activeAccount}
          onSent={() => qc.invalidateQueries({ queryKey: ["balance"] })}
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

      <BackupDialog
        open={backupOpen}
        onOpenChange={setBackupOpen}
        mnemonic={mnemonic}
        onWipe={() => {
          wipeVault();
          onLocked();
          toast.success("Wallet erased from this browser");
        }}
      />
    </div>
  );
}

function DerivationRow({ chain, path, type }: { chain: string; path: string; type: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
      <span className="font-semibold text-xs">{chain}</span>
      <code className="flex-1 text-center font-mono text-xs">{path}</code>
      <span className="text-xs text-muted-foreground">{type}</span>
    </div>
  );
}

function BackupDialog({
  open,
  onOpenChange,
  mnemonic,
  onWipe,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mnemonic: string;
  onWipe: () => void;
}) {
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    if (!open) setReveal(false);
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recovery phrase</DialogTitle>
          <DialogDescription>
            Anyone with this phrase controls all three wallets. Never share it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {reveal ? (
            <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-3 font-mono text-sm">
              {mnemonic.split(" ").map((w, i) => (
                <div key={i} className="flex items-baseline gap-1">
                  <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setReveal(true)}>
              <Eye className="mr-2 h-4 w-4" /> Reveal phrase
            </Button>
          )}
          {reveal && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(mnemonic);
                toast.success("Phrase copied");
              }}
            >
              Copy phrase
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm("This will erase the wallet from this browser. Make sure you have the phrase saved.")) {
                onWipe();
                onOpenChange(false);
              }
            }}
          >
            <EyeOff className="mr-2 h-4 w-4" /> Erase wallet from this browser
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}