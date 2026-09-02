import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Plus,
  Download,
  KeyRound,
  Eye,
  Loader2,
  Check,
  Pencil,
  Repeat,
  Trash2,
  QrCode,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CHAIN_LIST, getChain, type ChainId } from "@/lib/chains";
import { checkPassword } from "@/lib/security/password-strength";
import { createMnemonic, getCachedMnemonic, isValidMnemonic } from "@/lib/wallet/seed";
import {
  addSeedAccount,
  getActiveSeedAccountId,
  listSeedAccounts,
  noteActiveAssetId,
  noteActiveFingerprint,
  removeSeedAccount,
  renameSeedAccount,
  switchSeedAccount,
  syncActiveBlob,
  type SeedAccount,
} from "@/lib/wallet/seed-accounts";
import { nectarLinkForFingerprint } from "@/lib/wallet/nectar";
import { QrScanDialog } from "./QrScanDialog";
import {
  addWatchOnly,
  removeWatchOnly,
  useWatchOnly,
  validateWatchAddress,
  watchOnlyBalance,
  watchableChain,
  type WatchOnlyEntry,
} from "@/lib/wallet/watch-only";
import { useHideBalances, maskAmount } from "@/lib/wallet/hide-balances";
import { useQuery } from "@tanstack/react-query";

const watchChains = CHAIN_LIST.filter(watchableChain);

type SeedMode = "idle" | "generate" | "import";

export function YourWalletsSection() {
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Each wallet is a separate seed with its own chains, keys and contacts. One
        password unlocks them all.
      </p>
      <SeedList />
      <SeedActions />
      <WatchOnlyBlock />
      <p className="text-[11px] text-muted-foreground">
        Private keys and watch-only addresses are added to your active wallet as their own tiles.
        Removing a wallet here only forgets it on this device — your seed phrase or coin is still the backup.
      </p>
    </div>
  );
}

function SeedList() {
  const [accounts, setAccounts] = useState<SeedAccount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  function refresh() {
    syncActiveBlob();
    const cached = getCachedMnemonic();
    if (cached) {
      noteActiveFingerprint(cached);
      void noteActiveAssetId(cached).then(() => {
        setAccounts(listSeedAccounts());
      });
    }
    setAccounts(listSeedAccounts());
    setActiveId(getActiveSeedAccountId());
  }

  useEffect(() => {
    refresh();
  }, []);

  function handleSwitch(id: string) {
    try {
      switchSeedAccount(id);
      toast.success("Switched seed — unlock with that seed's password");
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch");
    }
  }

  function handleRemove(id: string) {
    try {
      const wasActive = id === activeId;
      removeSeedAccount(id);
      toast.success("Seed removed from this device");
      setPendingRemove(null);
      if (wasActive) window.location.reload();
      else refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    }
  }

  if (accounts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {accounts.map((a) => {
        const isActive = a.id === activeId;
        const link = a.fingerprint ? nectarLinkForFingerprint(a.fingerprint) : null;
        return (
          <div key={a.id} className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                {renaming === a.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      className="h-7 text-sm"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => {
                        renameSeedAccount(a.id, renameDraft);
                        setRenaming(null);
                        refresh();
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <p className="truncate text-sm font-medium leading-tight">
                    {a.label}
                    {isActive && (
                      <Badge className="ml-2 h-4 px-1.5 text-[10px]">Active</Badge>
                    )}
                  </p>
                )}
                <p className="font-mono text-[10px] text-muted-foreground">
                  {a.assetId
                    ? `coin ${a.assetId}${a.coinChain ? ` · ${a.coinChain}` : ""}`
                    : a.fingerprint
                      ? `vault ${a.fingerprint.slice(0, 8)}`
                      : "unlock once to identify"}
                </p>
                {link ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                      Nectar Pay linked
                    </Badge>
                    {link.merchantName ? ` ${link.merchantName}` : ""}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Rename seed"
                  onClick={() => {
                    setRenaming(a.id);
                    setRenameDraft(a.label);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {!isActive && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Switch to this seed"
                    onClick={() => handleSwitch(a.id)}
                  >
                    <Repeat className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  aria-label="Remove seed"
                  disabled={accounts.length <= 1}
                  onClick={() => setPendingRemove(a.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      <AlertDialog open={!!pendingRemove} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove seed from this device?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const account = accounts.find((a) => a.id === pendingRemove);
                return account ? (
                  <>
                    <span className="font-medium text-foreground">{account.label}</span> will be
                    removed from Beekeeper on this device. The copper coin itself is still the
                    backup, and you can re-add the seed any time.
                  </>
                ) : (
                  "This seed will be removed from Beekeeper on this device."
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingRemove(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => pendingRemove && handleRemove(pendingRemove)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SeedActions() {
  const [mode, setMode] = useState<SeedMode>("idle");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => setMode("generate")}>
          <Plus className="mr-2 h-4 w-4" /> Add new seed
        </Button>
        <Button variant="outline" onClick={() => setMode("import")}>
          <Download className="mr-2 h-4 w-4" /> Import a seed
        </Button>
        <Link to="/wallet/import-key" className="block">
          <Button variant="outline" className="w-full">
            <KeyRound className="mr-2 h-4 w-4" /> Import private key
          </Button>
        </Link>
        <Button variant="outline" className="w-full" onClick={() => { /* watch-only is inline below */ }}>
          <Eye className="mr-2 h-4 w-4" /> Watch-only address
        </Button>
      </div>
      {mode === "generate" && <GenerateSeedForm onDone={() => setMode("idle")} onCancel={() => setMode("idle")} />}
      {mode === "import" && <ImportSeedForm onDone={() => setMode("idle")} onCancel={() => setMode("idle")} />}
    </div>
  );
}

function GenerateSeedForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [phrase, setPhrase] = useState(() => createMnemonic(256));
  const [saved, setSaved] = useState(false);
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordCheck = useMemo(() => checkPassword(password), [password]);

  async function handleCreate() {
    if (!saved) { toast.error("Confirm you have written the seed down"); return; }
    if (!passwordCheck.ok) { toast.error(passwordCheck.problems.join("; ")); return; }
    setBusy(true);
    try {
      await addSeedAccount({ mnemonic: phrase, password, label });
      toast.success("New seed created and encrypted");
      setPhrase("");
      setSaved(false);
      setLabel("");
      setPassword("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create seed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1.5">
        <Label className="text-xs">New recovery phrase</Label>
        <textarea
          readOnly
          value={phrase}
          rows={3}
          className="w-full rounded-md border bg-muted/50 p-2 font-mono text-xs"
        />
        <p className="text-[11px] text-destructive">
          Write this down. It is shown once and never leaves this device unencrypted.
        </p>
      </div>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5" />
        <span>I have written the phrase down and stored it safely.</span>
      </label>
      <div className="space-y-1.5">
        <Label className="text-xs">Name (optional)</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Cold storage #2" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Password for this seed</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" />
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy || !saved || !passwordCheck.ok} onClick={handleCreate}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create seed
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function ImportSeedForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [phrase, setPhrase] = useState("");
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const valid = isValidMnemonic(phrase.trim());
  const passwordCheck = useMemo(() => checkPassword(password), [password]);

  async function handleImport() {
    if (!valid) { toast.error("That phrase doesn't check out"); return; }
    if (!passwordCheck.ok) { toast.error(passwordCheck.reason); return; }
    setBusy(true);
    try {
      await addSeedAccount({ mnemonic: phrase, password, label });
      toast.success("Seed imported");
      setPhrase("");
      setLabel("");
      setPassword("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not import seed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Recovery phrase (12 or 24 words)</Label>
        <textarea
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          rows={3}
          spellCheck={false}
          autoCapitalize="none"
          className="w-full rounded-md border bg-background p-2 font-mono text-xs"
          placeholder="word word word…"
        />
        <Button variant="outline" size="sm" className="w-full" onClick={() => setScanOpen(true)}>
          <QrCode className="mr-2 h-4 w-4" /> Scan a copper coin
        </Button>
        {phrase.trim() && !valid && (
          <p className="text-[11px] text-destructive">That phrase doesn't check out yet.</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Name (optional)</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Cold storage #2" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Password for this seed</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" />
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy || !valid || !passwordCheck.ok} onClick={handleImport}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Import seed
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <QrScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        title="Scan recovery phrase"
        description="Point your camera at the laser-etched recovery phrase inside the coin."
        onResult={(text) => {
          const clean = text.trim().toLowerCase().replace(/\s+/g, " ");
          if (!isValidMnemonic(clean)) {
            toast.error("That QR isn't a valid 12 or 24 word recovery phrase");
            return;
          }
          setPhrase(clean);
          setScanOpen(false);
          toast.success("Phrase captured");
        }}
      />
    </div>
  );
}

function WatchOnlyBlock() {
  const entries = useWatchOnly();
  const [chainId, setChainId] = useState<ChainId>(watchChains[0]?.id ?? "btc");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(entries.length === 0);

  async function add() {
    setBusy(true);
    try {
      const ok = await validateWatchAddress(chainId, address);
      if (!ok) {
        toast.error(`That isn't a valid ${getChain(chainId).ticker} address`);
        return;
      }
      addWatchOnly({ chainId, address, label });
      setAddress("");
      setLabel("");
      toast.success("Watch-only address added");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Watch-only addresses</p>
        {entries.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide" : "Manage"}
          </Button>
        )}
      </div>
      {expanded && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Select value={chainId} onValueChange={(v) => setChainId(v as ChainId)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {watchChains.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.ticker}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={address} placeholder="Public address" spellCheck={false} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Input value={label} placeholder="Label (e.g. Copper coin #4)" onChange={(e) => setLabel(e.target.value)} />
            <Button onClick={add} disabled={busy || !address.trim()} size="icon" aria-label="Add watch-only address">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nothing watched yet. Paste the address printed on a coin to keep an eye on it.
        </p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => (
            <WatchRow key={e.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function WatchRow({ entry }: { entry: WatchOnlyEntry }) {
  const chain = getChain(entry.chainId);
  const hidden = useHideBalances();
  const q = useQuery({
    queryKey: ["watch-only-balance", entry.id],
    queryFn: () => watchOnlyBalance(entry),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });

  const amount =
    q.isLoading ? "…"
    : q.isError ? "—"
    : (q.data ?? 0).toLocaleString("en-US", { maximumFractionDigits: 8 });

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: chain.color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{entry.label}</div>
        <div className="truncate text-[11px] text-muted-foreground">{entry.address}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tabular text-sm font-semibold">
          {maskAmount(amount, hidden)} {chain.ticker}
        </div>
      </div>
      <a
        href={chain.explorerAddr(entry.address)}
        target="_blank"
        rel="noreferrer"
        aria-label="View on explorer"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <button
        type="button"
        onClick={() => {
          removeWatchOnly(entry.id);
          toast.success("Removed from watch list");
        }}
        aria-label={`Stop watching ${entry.label}`}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
