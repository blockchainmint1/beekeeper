import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Plus, QrCode, Repeat, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  addSeedAccount,
  getActiveSeedAccountId,
  listSeedAccounts,
  noteActiveFingerprint,
  noteActiveAssetId,
  removeSeedAccount,
  renameSeedAccount,
  switchSeedAccount,
  syncActiveBlob,
  type SeedAccount,
} from "@/lib/wallet/seed-accounts";
import { getCachedMnemonic, isValidMnemonic } from "@/lib/wallet/seed";
import { QrScanDialog } from "./QrScanDialog";
import { nectarLinkForFingerprint } from "@/lib/wallet/nectar";

export function SeedsPanel() {
  const [accounts, setAccounts] = useState<SeedAccount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  function refresh() {
    setAccounts(listSeedAccounts());
    setActiveId(getActiveSeedAccountId());
  }

  useEffect(() => {
    syncActiveBlob();
    const cached = getCachedMnemonic();
    if (cached) {
      noteActiveFingerprint(cached);
      void noteActiveAssetId(cached).then(refresh);
    }
    refresh();
  }, []);

  async function handleAdd() {
    setBusy(true);
    try {
      await addSeedAccount({ mnemonic: phrase, password, label });
      toast.success("Seed added");
      setPhrase("");
      setLabel("");
      setPassword("");
      setAdding(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add that seed");
    } finally {
      setBusy(false);
    }
  }

  function handleSwitch(id: string) {
    try {
      switchSeedAccount(id);
      toast.success("Switched seed — unlock with that seed's password");
      // Locking the vault means the app has to re-read it from scratch.
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
      if (wasActive) window.location.reload();
      else refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Each seed is its own encrypted vault on this device, with its own
        password. One seed is active at a time — switching locks the wallet so
        you can unlock the other one.
      </p>

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
                      ? `coin ${a.assetId}`
                      : a.fingerprint
                        ? `vault ${a.fingerprint.slice(0, 8)}`
                        : "unlock once to identify"}
                  </p>
                  {link ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      <Badge
                        variant="secondary"
                        className="h-4 px-1.5 text-[10px] font-normal"
                      >
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
                    onClick={() => handleRemove(a.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {adding ? (
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
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setScanOpen(true)}
            >
              <QrCode className="mr-2 h-4 w-4" /> Scan a copper coin
            </Button>
            {phrase.trim() && !isValidMnemonic(phrase) && (
              <p className="text-[11px] text-destructive">
                That phrase doesn't check out yet.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Name (optional)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Cold storage #2"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Password for this seed</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={busy || !isValidMnemonic(phrase) || password.length < 8}
              onClick={handleAdd}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add seed
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add another seed
        </Button>
      )}

      <p className="text-[11px] text-muted-foreground">
        Beekeeper never uploads a seed. Removing one here only forgets it on this
        device — the copper coin is still the backup.
      </p>

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
