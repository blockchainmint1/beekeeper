import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, Upload, Wallet as WalletIcon, Fingerprint, Repeat } from "lucide-react";
import { unlockVault, wipeVault, importVaultBlob, cacheMnemonic } from "@/lib/wallet/seed";
import {
  listSeedAccounts,
  getActiveSeedAccountId,
  switchSeedAccount,
  wipeSeedRegistry,
  type SeedAccount,
} from "@/lib/wallet/seed-accounts";
import { useSecurityPrefs } from "@/lib/wallet/security";
import { getBiometricStatus, unlockWithBiometric } from "@/lib/native/biometric";

export function UnlockScreen({ onUnlocked, onReset }: { onUnlocked: () => void; onReset: () => void }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [accounts, setAccounts] = useState<SeedAccount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const prefs = useSecurityPrefs();

  useEffect(() => {
    setAccounts(listSeedAccounts());
    setActiveId(getActiveSeedAccountId());
  }, []);

  /** Each wallet has its own password, so a forgotten one must never trap the
   *  others — switching the active vault here needs no password at all. */
  function handleSwitch(id: string) {
    try {
      switchSeedAccount(id);
      // Start this vault with a fresh query/session tree so no balance,
      // history, or token cache from the previously active seed survives.
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch wallet");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await getBiometricStatus();
      if (!cancelled && status.available && status.enabled) {
        setBioEnabled(true);
        // Auto-prompt on mount for a native-feeling unlock.
        void handleBiometric();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handle() {
    setBusy(true);
    try {
      await unlockVault(pass);
      onUnlocked();
    } catch {
      toast.error("Incorrect password");
    } finally {
      setBusy(false);
    }
  }

  async function handleBiometric() {
    setBioBusy(true);
    try {
      const pw = await unlockWithBiometric();
      if (!pw) return;
      const mnemonic = await unlockVault(pw);
      cacheMnemonic(mnemonic);
      onUnlocked();
    } catch {
      toast.error("Biometric unlock failed — use your password");
    } finally {
      setBioBusy(false);
    }
  }

  function handleReset() {
    const count = listSeedAccounts().length;
    const what =
      count > 1
        ? `This erases ALL ${count} wallets stored in this browser, not just this one.`
        : "This will erase the encrypted wallet from this browser.";
    if (!confirm(`${what} You'll need your copper coin or recovery phrase to get back in. Continue?`))
      return;
    wipeVault();
    wipeSeedRegistry();
    onReset();
  }

  function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importVaultBlob(String(reader.result));
        toast.success("Backup loaded — enter its password to unlock");
      } catch (err) {
        toast.error((err as Error).message);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-2">
            <WalletIcon className="h-7 w-7" />
          </div>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Enter your password to unlock the wallet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {prefs.antiPhishingPhrase && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-emerald-300/80">Your anti-phishing phrase</p>
              <p className="mt-0.5 font-mono text-sm text-emerald-200">{prefs.antiPhishingPhrase}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                If you don't see this, you may be on a fake site — don't enter your password.
              </p>
            </div>
          )}
          {accounts.length > 1 && (
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Which wallet?
              </p>
              {accounts.map((a) => {
                const isActive = a.id === activeId;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => !isActive && handleSwitch(a.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                      isActive
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {a.label}
                      {a.assetId ? (
                        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                          {a.assetId}
                        </span>
                      ) : null}
                    </span>
                    {isActive ? (
                      <Badge className="h-4 px-1.5 text-[10px]">Unlocking</Badge>
                    ) : (
                      <Repeat className="h-3.5 w-3.5 shrink-0" />
                    )}
                  </button>
                );
              })}
              <p className="text-[10px] text-muted-foreground">
                Each wallet has its own password. Forgot one? Pick another wallet — the
                rest still open normally.
              </p>
            </div>
          )}
          {bioEnabled && (
            <Button
              variant="outline"
              onClick={handleBiometric}
              disabled={bioBusy}
              className="w-full"
            >
              <Fingerprint className="mr-2 h-4 w-4" />
              {bioBusy ? "Waiting…" : "Unlock with biometrics"}
            </Button>
          )}
          <Input
            type="password"
            placeholder="Password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handle()}
            autoFocus={!bioEnabled}
          />
          <Button onClick={handle} disabled={busy || !pass} className="w-full">
            <Lock className="mr-2 h-4 w-4" /> {busy ? "Unlocking…" : "Unlock"}
          </Button>
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs text-muted-foreground hover:bg-muted/40">
            <Upload className="h-3.5 w-3.5" /> Restore from backup file
            <input type="file" accept="application/json,.json" className="hidden" onChange={handleRestoreFile} />
          </label>
          <Button variant="ghost" onClick={handleReset} className="w-full text-xs text-muted-foreground">
            Forgot password — reset wallet
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
