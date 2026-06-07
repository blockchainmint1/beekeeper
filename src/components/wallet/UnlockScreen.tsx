import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, Wallet as WalletIcon } from "lucide-react";
import { unlockVault, wipeVault } from "@/lib/wallet/seed";

export function UnlockScreen({ onUnlocked, onReset }: { onUnlocked: () => void; onReset: () => void }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  async function handle() {
    setBusy(true);
    try {
      await unlockVault(pass);
      onUnlocked();
    } catch {
      toast.error("Incorrect passphrase");
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    if (!confirm("This will erase the encrypted wallet from this browser. Continue?")) return;
    wipeVault();
    onReset();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-2">
            <WalletIcon className="h-7 w-7" />
          </div>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Enter your passphrase to unlock the wallet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="password"
            placeholder="Passphrase"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handle()}
            autoFocus
          />
          <Button onClick={handle} disabled={busy || !pass} className="w-full">
            <Lock className="mr-2 h-4 w-4" /> {busy ? "Unlocking…" : "Unlock"}
          </Button>
          <Button variant="ghost" onClick={handleReset} className="w-full text-xs text-muted-foreground">
            Forgot passphrase — reset wallet
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}