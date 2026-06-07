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
import { secureCopy } from "@/lib/wallet/security";

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
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="create">
                  <Sparkles className="mr-2 h-4 w-4" /> Create new
                </TabsTrigger>
                <TabsTrigger value="import">
                  <KeyRound className="mr-2 h-4 w-4" /> Import phrase
                </TabsTrigger>
                <TabsTrigger value="restore">
                  <Upload className="mr-2 h-4 w-4" /> Restore file
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
  // Multi-step flow: 1=show phrase, 2=verify words, 3=set passphrase, 4=force-download backup
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);

  const words = useMemo(() => mnemonic.split(" "), [mnemonic]);
  // Pick 3 random word indices to verify
  const verifyIndices = useMemo(() => {
    const set = new Set<number>();
    while (set.size < 3) set.add(Math.floor(Math.random() * words.length));
    return [...set].sort((a, b) => a - b);
    // re-computed only when mnemonic changes
  }, [words]);
  const [verifyInputs, setVerifyInputs] = useState<Record<number, string>>({});
  const allVerified = verifyIndices.every(
    (i) => (verifyInputs[i] ?? "").trim().toLowerCase() === words[i],
  );

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
      toast.success("Wallet created — now save your backup file");
      setStep(4);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadBackup() {
    const ok = downloadVaultBackup();
    if (ok) {
      setBackupDownloaded(true);
      toast.success("Encrypted backup saved");
    } else {
      toast.error("No vault to back up");
    }
  }

  return (
    <div className="space-y-4">
      <StepIndicator step={step} />

      {step === 1 && (
        <>
          <div>
            <label className="text-sm font-medium">Recovery phrase (12 words)</label>
            <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-3 font-mono text-sm">
              {words.map((w, i) => (
                <div key={i} className="flex items-baseline gap-1">
                  <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="ghost" onClick={async () => { await secureCopy(mnemonic); toast.success("Phrase copied — auto-clears from clipboard"); }}>Copy</Button>
              <Button size="sm" variant="ghost" onClick={() => { setMnemonic(createMnemonic(128)); setVerifyInputs({}); }}>Regenerate</Button>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
            <span>I have written down my recovery phrase. I understand losing it means losing access to my funds forever.</span>
          </label>
          <Button onClick={() => setStep(2)} disabled={!acknowledged} className="w-full">
            Continue — verify phrase
          </Button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">Prove you wrote it down</p>
            <p className="text-xs text-muted-foreground">Enter the requested words exactly.</p>
          </div>
          <div className="space-y-2">
            {verifyIndices.map((i) => {
              const val = verifyInputs[i] ?? "";
              const ok = val.trim().toLowerCase() === words[i] && val.length > 0;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-16 text-xs text-muted-foreground tabular-nums">Word #{i + 1}</span>
                  <Input
                    value={val}
                    onChange={(e) => setVerifyInputs((s) => ({ ...s, [i]: e.target.value }))}
                    className={`font-mono text-sm ${ok ? "border-emerald-500/50" : ""}`}
                    autoComplete="off"
                    autoCapitalize="none"
                  />
                  {ok && <ShieldCheck className="h-4 w-4 text-emerald-500" />}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(1)} className="flex-1">← Back</Button>
            <Button onClick={() => setStep(3)} disabled={!allVerified} className="flex-1">
              Verified — continue
            </Button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <p className="text-sm text-muted-foreground">Choose a passphrase that encrypts your vault on this device. Minimum 8 characters.</p>
          <Input type="password" placeholder="Choose a passphrase (min 8 chars)" value={pass1} onChange={(e) => setPass1(e.target.value)} />
          <Input type="password" placeholder="Confirm passphrase" value={pass2} onChange={(e) => setPass2(e.target.value)} />
          <Button onClick={handleCreate} disabled={busy} className="w-full">
            {busy ? "Creating…" : "Create wallet"}
          </Button>
        </>
      )}

      {step === 4 && (
        <>
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-amber-200">One more step — save your encrypted backup</p>
            <p className="mt-1 text-xs text-amber-100/80">
              This file plus your passphrase can restore your wallet on any device, even without the seed phrase.
              Store it somewhere safe (USB drive, password manager, encrypted cloud).
            </p>
          </div>
          <Button onClick={handleDownloadBackup} className="w-full" variant={backupDownloaded ? "outline" : "default"}>
            <Download className="mr-2 h-4 w-4" /> {backupDownloaded ? "Download backup again" : "Download encrypted backup"}
          </Button>
          <Button onClick={onReady} disabled={!backupDownloaded} className="w-full">
            {backupDownloaded ? "Open my wallet →" : "Save backup to continue"}
          </Button>
        </>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  const labels = ["Phrase", "Verify", "Passphrase", "Backup"];
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      {labels.map((l, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const active = step === n;
        const done = step > n;
        return (
          <div key={l} className={`flex-1 rounded-full px-2 py-1 text-center font-medium uppercase tracking-wider transition-colors ${done ? "bg-emerald-500/20 text-emerald-300" : active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
            {n}. {l}
          </div>
        );
      })}
    </div>
  );
}

function RestoreFlow({ onReady }: { onReady: () => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importVaultBlob(String(reader.result));
        setFileName(file.name);
        setImported(true);
        toast.success("Backup loaded — enter your passphrase");
      } catch (err) {
        toast.error((err as Error).message);
      }
    };
    reader.readAsText(file);
  }

  async function handleUnlock() {
    if (!pass) return;
    setBusy(true);
    try {
      const { unlockVault } = await import("@/lib/wallet/seed");
      await unlockVault(pass);
      toast.success("Wallet restored");
      onReady();
    } catch {
      toast.error("Incorrect passphrase for this backup");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Restore from an encrypted JSON backup. You'll still need the passphrase you set when creating it.
      </p>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-6 text-sm hover:bg-muted/60">
        <Upload className="h-4 w-4" />
        {fileName ?? "Choose backup file (.json)"}
        <input type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />
      </label>
      {imported && (
        <>
          <Input type="password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleUnlock()} autoFocus />
          <Button onClick={handleUnlock} disabled={busy || !pass} className="w-full">
            {busy ? "Unlocking…" : "Unlock restored wallet"}
          </Button>
        </>
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