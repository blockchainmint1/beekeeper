import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScanLine, ShieldCheck, Link2, CheckCircle2, Loader2 } from "lucide-react";
import { createVault, isValidMnemonic } from "@/lib/wallet/seed";
import { QrScanDialog } from "./QrScanDialog";
import { NectarLinkDialog } from "./NectarLinkDialog";
import { hasNectarLink } from "@/lib/wallet/nectar";

type Step = 1 | 2 | 3 | 4;

const DISCLAIMERS = [
  "I understand my Copper Coin is my only backup. If I lose it, my account is gone forever.",
  "I will keep my Copper Coin safe. Anyone who finds it has unlimited access to my funds. I will store it in a safe or safe deposit box.",
  "I will never share my Copper Coin. No support agent, no app, and no website will ever ask me to scan it elsewhere. It is for me only.",
  "I understand this wallet is non-custodial. No one — not Nectar Pay, not the hive — can recover my funds or reverse a transaction.",
];

export function OnboardScreen({ onReady }: { onReady: () => void }) {
  const [step, setStep] = useState<Step>(1);
  const [mnemonic, setMnemonic] = useState<string>("");
  const [scanOpen, setScanOpen] = useState(false);
  const [acks, setAcks] = useState<boolean[]>(() => DISCLAIMERS.map(() => false));
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linked, setLinked] = useState<boolean>(() => hasNectarLink());

  function handleScan(text: string) {
    setScanOpen(false);
    const m = text.trim().toLowerCase().replace(/\s+/g, " ");
    const wordCount = m.split(" ").filter(Boolean).length;
    if (wordCount !== 24) {
      toast.error("Copper Coin must be 24 words");
      return;
    }
    if (!isValidMnemonic(m)) {
      toast.error("That doesn't look like a valid Copper Coin recovery phrase");
      return;
    }
    setMnemonic(m);
    toast.success("Copper Coin recognized");
    setStep(2);
  }

  async function handleCreate() {
    if (pass1.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (pass1 !== pass2) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await createVault(mnemonic, pass1);
      // Wipe the in-component copy now that the vault is encrypted and cached.
      setMnemonic("");
      setPass1("");
      setPass2("");
      toast.success("Wallet ready — last step: link Nectar Pay");
      setStep(4);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const allAcked = acks.every(Boolean);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/40 p-4">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <HoneycombMark />
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.32em] text-amber-400/90">
            Nectar · Pollinated Payments
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Activate your Beekeeper Wallet</h1>
          <p className="mt-2 text-muted-foreground whitespace-pre-line">
            Scan your Cold Storage Coin and the hive comes to life —{"\n"}
            Bitcoin, TEXITcoin, and EVM wallets, all from one queen seed.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{titleFor(step)}</CardTitle>
            <CardDescription>{descFor(step)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <StepIndicator step={step} />

            {step === 1 && (
              <div className="space-y-3">
                <Button className="w-full" size="lg" onClick={() => setScanOpen(true)}>
                  <ScanLine className="mr-2 h-5 w-5" /> Scan my Copper Coin
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Don't have one yet?{" "}
                  <a
                    href="https://coldstoragecoins.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Get a Cold Storage Coin
                  </a>
                </p>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                {DISCLAIMERS.map((text, i) => (
                  <label key={i} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={acks[i]}
                      onChange={(e) =>
                        setAcks((s) => s.map((v, idx) => (idx === i ? e.target.checked : v)))
                      }
                      className="mt-1"
                    />
                    <span>{text}</span>
                  </label>
                ))}
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setStep(1)} className="flex-1">
                    ← Back
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={!allAcked} className="flex-1">
                    I agree — continue
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Choose a password that unlocks this wallet on this device. You'll enter it every time you open the app. Minimum 8 characters.
                </p>
                <Input
                  type="password"
                  placeholder="Choose a password (min 8 chars)"
                  value={pass1}
                  onChange={(e) => setPass1(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Confirm password"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                />
                <Button onClick={handleCreate} disabled={busy} className="w-full">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  {busy ? "Creating wallet…" : "Create wallet"}
                </Button>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">Link your Nectar Pay merchant account</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Open Nectar Pay on your merchant account, choose "Link wallet", and scan the QR code it shows. We'll share your BTC, TEXITcoin and EVM xpubs so Nectar Pay can watch for incoming payments — your seed and private keys stay here.
                  </p>
                </div>
                {linked ? (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                    <CheckCircle2 className="h-4 w-4" /> Nectar Pay linked
                  </div>
                ) : (
                  <Button className="w-full" onClick={() => setLinkOpen(true)}>
                    <Link2 className="mr-2 h-4 w-4" /> Scan Nectar Pay QR
                  </Button>
                )}
                <Button variant={linked ? "default" : "outline"} className="w-full" onClick={onReady}>
                  {linked ? "Open my wallet →" : "Skip for now — link later in Settings"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <QrScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onResult={handleScan}
        title="Scan your Copper Coin"
        description="Point your camera at the QR code on the back of your Cold Storage Coin. Your 24-word recovery phrase stays on this device."
      />
      <NectarLinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onLinked={() => setLinked(true)}
      />
    </div>
  );
}

function titleFor(step: Step): string {
  return step === 1
    ? "Scan your Copper Coin"
    : step === 2
      ? "Acknowledge the rules"
      : step === 3
        ? "Set a device password"
        : "Link Nectar Pay";
}
function descFor(step: Step): string {
  return step === 1
    ? "Your Cold Storage Coin is the only way to activate this wallet. No phrase, no wallet."
    : step === 2
      ? "These four rules keep your funds yours. Please read each one."
      : step === 3
        ? "This password encrypts your wallet on this device. It can't recover your funds — only your Copper Coin can do that."
        : "Connect this wallet to your merchant account so Nectar Pay can track payments.";
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ["Scan", "Rules", "Password", "Link"];
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      {labels.map((l, i) => {
        const n = (i + 1) as Step;
        const active = step === n;
        const done = step > n;
        return (
          <div
            key={l}
            className={`flex-1 rounded-full px-2 py-1 text-center font-medium uppercase tracking-wider transition-colors ${
              done
                ? "bg-emerald-500/20 text-emerald-300"
                : active
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {n}. {l}
          </div>
        );
      })}
    </div>
  );
}

function HoneycombMark() {
  // Inline honeycomb + bee silhouette — pure SVG, themed in amber.
  return (
    <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
      <div
        className="absolute inset-0 rounded-full blur-xl opacity-60"
        style={{ background: "radial-gradient(circle, #f5b942 0%, transparent 70%)" }}
        aria-hidden
      />
      <svg viewBox="0 0 64 64" className="relative h-20 w-20" aria-label="Nectar hive mark" role="img">
        <defs>
          <linearGradient id="combFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fcd34d" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>
        {/* Honeycomb hex cluster */}
        {[
          [32, 14], [20, 21], [44, 21], [32, 28], [20, 35], [44, 35], [32, 42],
        ].map(([cx, cy], i) => (
          <polygon
            key={i}
            points={hexPoints(cx, cy, 6.5)}
            fill="url(#combFill)"
            stroke="#78350f"
            strokeWidth="0.8"
            opacity={0.95}
          />
        ))}
        {/* Bee */}
        <g transform="translate(40 46) rotate(20)">
          <ellipse cx="0" cy="0" rx="7" ry="4.5" fill="#facc15" stroke="#1c1917" strokeWidth="0.9" />
          <rect x="-4" y="-4.5" width="2" height="9" fill="#1c1917" />
          <rect x="0" y="-4.5" width="2" height="9" fill="#1c1917" />
          <ellipse cx="-3" cy="-3" rx="4" ry="2.2" fill="#ffffff" opacity="0.85" transform="rotate(-25 -3 -3)" />
          <ellipse cx="3" cy="-3" rx="4" ry="2.2" fill="#ffffff" opacity="0.85" transform="rotate(25 3 -3)" />
        </g>
      </svg>
    </div>
  );
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}
