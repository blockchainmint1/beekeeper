import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, EyeOff, KeyRound, Loader2, ShieldAlert, ShieldCheck, Layers, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CHAIN_LIST, type ChainId } from "@/lib/chains";
import { changePassphrase, exportVaultJson, unlockVault } from "@/lib/wallet/seed";
import { deriveUtxoAccount, utxoWif } from "@/lib/wallet/utxo";
import { evmPrivateKey, evmAccountXpub, deriveEvmAddressesFromXpub } from "@/lib/wallet/evm";
import { useSecurityPrefs, setSecurityPrefs, secureCopy } from "@/lib/wallet/security";
import { useVisibleChainIds, toggleChainVisible } from "@/lib/wallet/visible-chains";

export function SettingsDialog({
  open,
  onOpenChange,
  onWipe,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onWipe: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Wallet settings</DialogTitle>
          <DialogDescription>
            Manage your encrypted vault. Everything here stays in this browser.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="security">
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="security"><ShieldCheck className="mr-1 h-3.5 w-3.5" />Security</TabsTrigger>
            <TabsTrigger value="wallets"><Layers className="mr-1 h-3.5 w-3.5" />Wallets</TabsTrigger>
            <TabsTrigger value="backup">Backup</TabsTrigger>
            <TabsTrigger value="passphrase">Passphrase</TabsTrigger>
            <TabsTrigger value="reveal">Private key</TabsTrigger>
            <TabsTrigger value="xpub"><Share2 className="mr-1 h-3.5 w-3.5" />xpub</TabsTrigger>
            <TabsTrigger value="danger">Danger</TabsTrigger>
          </TabsList>

          <TabsContent value="security" className="pt-4"><SecurityPanel /></TabsContent>
          <TabsContent value="wallets" className="pt-4"><WalletsPanel /></TabsContent>
          <TabsContent value="backup" className="pt-4"><BackupPanel /></TabsContent>
          <TabsContent value="passphrase" className="pt-4"><PassphrasePanel /></TabsContent>
          <TabsContent value="reveal" className="pt-4"><RevealPanel /></TabsContent>
          <TabsContent value="xpub" className="pt-4"><XpubPanel /></TabsContent>
          <TabsContent value="danger" className="pt-4"><DangerPanel onWipe={onWipe} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function WalletsPanel() {
  const visible = useVisibleChainIds();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Choose which chains appear on your dashboard. Hidden chains keep working — addresses and keys are still derived from your seed — they just don't render.
      </p>
      <div className="space-y-2">
        {CHAIN_LIST.map((c) => {
          const on = visible.includes(c.id);
          const last = visible.length === 1 && on;
          return (
            <label
              key={c.id}
              className={`flex items-center justify-between gap-3 rounded-md border p-2.5 ${on ? "bg-muted/40" : "bg-background"} ${last ? "opacity-80" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: c.color }} />
                <div>
                  <p className="text-sm font-medium leading-tight">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{c.ticker} · {c.kind === "utxo" ? "UTXO" : "EVM"}</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={on}
                disabled={last}
                onChange={() => toggleChainVisible(c.id)}
                className="h-4 w-4"
                title={last ? "At least one chain must stay visible" : ""}
              />
            </label>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">At least one chain must stay visible.</p>
    </div>
  );
}

function SecurityPanel() {
  const prefs = useSecurityPrefs();
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Auto-lock after idle (minutes)</Label>
        <Select
          value={String(prefs.autoLockMinutes)}
          onValueChange={(v) => setSecurityPrefs({ autoLockMinutes: Number(v) })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Disabled</SelectItem>
            <SelectItem value="1">1 minute</SelectItem>
            <SelectItem value="5">5 minutes</SelectItem>
            <SelectItem value="15">15 minutes</SelectItem>
            <SelectItem value="30">30 minutes</SelectItem>
            <SelectItem value="60">1 hour</SelectItem>
          </SelectContent>
        </Select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Wallet locks automatically after this much mouse/keyboard inactivity.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.lockOnHidden}
          onChange={(e) => setSecurityPrefs({ lockOnHidden: e.target.checked })}
          className="mt-0.5"
        />
        <span>Lock when this tab is hidden for &gt; 60 seconds</span>
      </label>

      <div>
        <Label className="text-xs">Anti-phishing phrase</Label>
        <Input
          value={prefs.antiPhishingPhrase}
          onChange={(e) => setSecurityPrefs({ antiPhishingPhrase: e.target.value.slice(0, 64) })}
          placeholder="e.g. blue rhino monday"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Shown on the unlock screen so you can spot fake clones of this site.
          A phishing site won't know your phrase.
        </p>
      </div>

      <div>
        <Label className="text-xs">Auto-clear clipboard after</Label>
        <Select
          value={String(prefs.clipboardClearSeconds)}
          onValueChange={(v) => setSecurityPrefs({ clipboardClearSeconds: Number(v) })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Never</SelectItem>
            <SelectItem value="15">15 seconds</SelectItem>
            <SelectItem value="30">30 seconds</SelectItem>
            <SelectItem value="60">1 minute</SelectItem>
          </SelectContent>
        </Select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Sensitive copies (seed phrase, private keys, WIF) are wiped from the clipboard after this delay.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.firstSendWarning}
          onChange={(e) => setSecurityPrefs({ firstSendWarning: e.target.checked })}
          className="mt-0.5"
        />
        <span>Warn me before sending to an address I've never used before</span>
      </label>
    </div>
  );
}

function BackupPanel() {
  const download = () => {
    const text = exportVaultJson();
    if (!text) { toast.error("No vault to back up"); return; }
    const file = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallet-backup-${new Date().toISOString().slice(0, 19).replace(/[:]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Encrypted backup saved");
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Download the encrypted vault as a JSON file. It contains your seed for every chain, encrypted with your passphrase.
      </p>
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
        <strong>Reminder:</strong> A backup is only as strong as your passphrase. Use a long, unique one and keep the file somewhere you trust.
      </div>
      <Button className="w-full" onClick={download}>
        <Download className="mr-2 h-4 w-4" /> Download encrypted backup
      </Button>
    </div>
  );
}

function PassphrasePanel() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next.length < 8) { toast.error("New passphrase must be at least 8 characters"); return; }
    if (next !== confirm) { toast.error("New passphrases don't match"); return; }
    setBusy(true);
    try {
      await changePassphrase(current, next);
      toast.success("Passphrase changed");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change passphrase");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Re-encrypts your vault under a new passphrase. The old one stops working immediately.
      </p>
      <div><Label className="text-xs">Current passphrase</Label>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus /></div>
      <div><Label className="text-xs">New passphrase (min 8)</Label>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
      <div><Label className="text-xs">Confirm new passphrase</Label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
      <Button className="w-full" disabled={busy || !current || !next || !confirm} onClick={submit}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        <KeyRound className="mr-2 h-4 w-4" /> Change passphrase
      </Button>
    </div>
  );
}

function RevealPanel() {
  const [chainId, setChainId] = useState<ChainId>("txc");
  const [pass, setPass] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);

  useEffect(() => { setKey(null); setShow(false); }, [chainId]);
  useEffect(() => {
    if (!key) return;
    const t = window.setTimeout(() => { setKey(null); setShow(false); toast.message("Private key hidden", { description: "Auto-cleared after 1 minute." }); }, 60_000);
    return () => window.clearTimeout(t);
  }, [key]);

  const reveal = async () => {
    if (!ack || !pass) return;
    setBusy(true);
    try {
      const mnemonic = await unlockVault(pass);
      const cfg = CHAIN_LIST.find((c) => c.id === chainId)!;
      let out: string;
      if (cfg.kind === "utxo") {
        const acct = await deriveUtxoAccount(mnemonic, cfg, 0, cfg.defaultAddressType);
        out = await utxoWif(acct);
      } else {
        out = evmPrivateKey(mnemonic, cfg, 0);
      }
      setKey(out); setPass(""); setShow(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wrong passphrase");
    } finally { setBusy(false); }
  };

  const cfg = CHAIN_LIST.find((c) => c.id === chainId)!;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>Anyone with this private key controls the funds at that address. Never paste it into a website, app, or chat you don't fully trust.</div>
        </div>
      </div>

      <div>
        <Label className="text-xs">Chain</Label>
        <Select value={chainId} onValueChange={(v) => setChainId(v as ChainId)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CHAIN_LIST.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name} ({c.ticker})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {cfg.kind === "utxo" ? "WIF (compressed) — import in any UTXO wallet." : "0x-hex private key — import in MetaMask, Rabby, etc."}
        </p>
      </div>

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
        <span>I am alone, no one is watching my screen, and I have not screen-shared this tab.</span>
      </label>

      {!key ? (
        <>
          <div>
            <Label className="text-xs">Vault passphrase</Label>
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ack && pass && reveal()} />
          </div>
          <Button className="w-full" disabled={busy || !pass || !ack} onClick={reveal}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Eye className="mr-2 h-4 w-4" /> Reveal private key
          </Button>
        </>
      ) : (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{cfg.kind === "utxo" ? "Private key (WIF)" : "Private key (0x)"}</Label>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{cfg.ticker}</Badge>
              <Button size="sm" variant="ghost" onClick={() => setShow((s) => !s)}>
                {show ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                {show ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
          <div className="break-all rounded bg-background p-2 font-mono text-xs">
            {show ? key : "•".repeat(Math.min(64, key.length))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1"
              onClick={async () => { await secureCopy(key); toast.success("Copied — auto-clears from clipboard"); }}>Copy</Button>
            <Button size="sm" variant="ghost" onClick={() => { setKey(null); setShow(false); }}>Hide now</Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Auto-hides after 1 minute.</p>
        </div>
      )}
    </div>
  );
}

function DangerPanel({ onWipe }: { onWipe: () => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
        Erasing wipes the encrypted vault from this browser. Without your recovery phrase you cannot get back in.
      </div>
      <Button
        variant="destructive"
        className="w-full"
        onClick={() => {
          if (confirm("Erase the wallet from this browser? Make sure you have the recovery phrase saved.")) {
            onWipe();
          }
        }}
      >
        Erase wallet from this browser
      </Button>
    </div>
  );
}

function XpubPanel() {
  const [pass, setPass] = useState("");
  const [xpub, setXpub] = useState<string | null>(null);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [addrs, setAddrs] = useState<{ address: string; path: string; index: number }[]>([]);

  const reveal = async () => {
    if (!pass) return;
    setBusy(true);
    try {
      const mnemonic = await unlockVault(pass);
      const x = evmAccountXpub(mnemonic);
      setXpub(x);
      setAddrs(deriveEvmAddressesFromXpub(x, count));
      setPass("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wrong passphrase");
    } finally { setBusy(false); }
  };

  const more = () => {
    if (!xpub) return;
    const next = count + 5;
    setAddrs(deriveEvmAddressesFromXpub(xpub, next));
    setCount(next);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/30 p-3 text-xs">
        <strong>Account xpub (m/44'/60'/0')</strong> — a public key for every EVM chain (ETH, BNB, Base, Polygon, ZCU). Safe to share: it lets watchers derive your addresses but <strong>never your private keys</strong>.
      </div>

      {!xpub ? (
        <>
          <div>
            <Label className="text-xs">Vault passphrase</Label>
            <Input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pass && reveal()}
            />
          </div>
          <Button className="w-full" disabled={busy || !pass} onClick={reveal}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Eye className="mr-2 h-4 w-4" /> Reveal xpub
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1 rounded-md border bg-background p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">xpub</Label>
              <Button size="sm" variant="ghost" onClick={async () => { await secureCopy(xpub); toast.success("xpub copied"); }}>Copy</Button>
            </div>
            <div className="break-all font-mono text-[10px] leading-relaxed">{xpub}</div>
          </div>

          <div>
            <Label className="text-xs">Derived addresses (m/44'/60'/0'/0/n)</Label>
            <div className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-md border bg-background p-2">
              {addrs.map((a) => (
                <div key={a.path} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="w-6 shrink-0 text-muted-foreground">#{a.index}</span>
                  <span className="flex-1 break-all font-mono">{a.address}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2"
                    onClick={async () => { await secureCopy(a.address); toast.success("Address copied"); }}>
                    Copy
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={more}>Show 5 more</Button>
            <Button variant="ghost" onClick={() => { setXpub(null); setAddrs([]); setCount(5); }}>Hide</Button>
          </div>
        </div>
      )}
    </div>
  );
}