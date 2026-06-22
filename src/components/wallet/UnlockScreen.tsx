import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, Upload, Wallet as WalletIcon } from "lucide-react";
import { unlockVault, wipeVault, importVaultBlob } from "@/lib/wallet/seed";
import { useSecurityPrefs } from "@/lib/wallet/security";

export function UnlockScreen({ onUnlocked, onReset }: { onUnlocked: () => void; onReset: () => void }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const prefs = useSecurityPrefs();

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

  function handleReset() {
    if (!confirm("This will erase the encrypted wallet from this browser. Continue?")) return;
    wipeVault();
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
          <Input
            type="password"
            placeholder="Password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handle()}
            autoFocus
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