import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet as WalletIcon, KeyRound, Sparkles, Download, Upload, ShieldCheck } from "lucide-react";
import {
  createMnemonic,
  isValidMnemonic,
  createVault,
  downloadVaultBackup,
  importVaultBlob,
} from "@/lib/wallet/seed";

export function OnboardScreen({ onReady }: { onReady: () => void }) {
  const [tab, setTab] = useState<"create" | "import">("create");
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/40 p-4">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
            <WalletIcon className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">One Wallet to Rule Them All</h1>
          <p className="mt-2 text-muted-foreground">
            One seed phrase. TEXITcoin, Iskander Coin, Zero Chill, Ethereum, BNB, Base, Polygon — plus USDC/USDT/DAI — all in your browser.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Your keys never leave this device. Save your recovery phrase somewhere safe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "create" | "import")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create">
                  <Sparkles className="mr-2 h-4 w-4" /> Create new
                </TabsTrigger>
                <TabsTrigger value="import">
                  <KeyRound className="mr-2 h-4 w-4" /> Import phrase
                </TabsTrigger>
              </TabsList>
              <TabsContent value="create" className="pt-4">
                <CreateFlow onReady={onReady} />
              </TabsContent>
              <TabsContent value="import" className="pt-4">
                <ImportFlow onReady={onReady} />
              </TabsContent>
              <TabsContent value="restore" className="pt-4">
                <RestoreFlow onReady={onReady} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CreateFlow({ onReady }: { onReady: () => void }) {
  const [mnemonic, setMnemonic] = useState<string>(() => createMnemonic(128));
  const [confirmed, setConfirmed] = useState(false);
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (pass1.length < 8) {
      toast.error("Passphrase must be at least 8 characters");
      return;
    }
    if (pass1 !== pass2) {
      toast.error("Passphrases do not match");
      return;
    }
    setBusy(true);
    try {
      await createVault(mnemonic, pass1);
      toast.success("Wallet created");
      onReady();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Recovery phrase (12 words)</label>
        <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-3 font-mono text-sm">
          {mnemonic.split(" ").map((w, i) => (
            <div key={i} className="flex items-baseline gap-1">
              <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              navigator.clipboard.writeText(mnemonic);
              toast.success("Phrase copied");
            }}
          >
            Copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMnemonic(createMnemonic(128))}
          >
            Regenerate
          </Button>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I have written down my recovery phrase. I understand losing it means losing access
          to my funds forever.
        </span>
      </label>

      {confirmed && (
        <div className="space-y-2">
          <Input
            type="password"
            placeholder="Choose a passphrase (min 8 chars)"
            value={pass1}
            onChange={(e) => setPass1(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Confirm passphrase"
            value={pass2}
            onChange={(e) => setPass2(e.target.value)}
          />
          <Button onClick={handleCreate} disabled={busy} className="w-full">
            {busy ? "Creating…" : "Create wallet"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ImportFlow({ onReady }: { onReady: () => void }) {
  const [mnemonic, setMnemonic] = useState("");
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleImport() {
    const m = mnemonic.trim().toLowerCase();
    if (!isValidMnemonic(m)) {
      toast.error("Invalid recovery phrase");
      return;
    }
    if (pass1.length < 8) {
      toast.error("Passphrase must be at least 8 characters");
      return;
    }
    if (pass1 !== pass2) {
      toast.error("Passphrases do not match");
      return;
    }
    setBusy(true);
    try {
      await createVault(m, pass1);
      toast.success("Wallet imported");
      onReady();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Textarea
        placeholder="Enter your 12 or 24 word recovery phrase, separated by spaces"
        rows={4}
        value={mnemonic}
        onChange={(e) => setMnemonic(e.target.value)}
        className="font-mono"
      />
      <Input
        type="password"
        placeholder="Choose a passphrase (min 8 chars)"
        value={pass1}
        onChange={(e) => setPass1(e.target.value)}
      />
      <Input
        type="password"
        placeholder="Confirm passphrase"
        value={pass2}
        onChange={(e) => setPass2(e.target.value)}
      />
      <Button onClick={handleImport} disabled={busy} className="w-full">
        {busy ? "Importing…" : "Import wallet"}
      </Button>
    </div>
  );
}