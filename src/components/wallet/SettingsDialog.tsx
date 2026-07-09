import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Eye, EyeOff, KeyRound, Loader2, ShieldAlert, ShieldCheck, Layers, Share2, ArrowUp, ArrowDown, Plus, X, Link2, Unlink, Bell, Mail, Send, Key, HardDriveDownload, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CHAIN_LIST, type ChainId } from "@/lib/chains";
import { changePassword, exportVaultJson, unlockVault } from "@/lib/wallet/seed";
import { getBiometricStatus, enableBiometric, disableBiometric } from "@/lib/native/biometric";
import { Fingerprint } from "lucide-react";
import { deriveUtxoAccount, utxoWif } from "@/lib/wallet/utxo";
import { evmPrivateKey, evmAccountXpub, deriveEvmAddressesFromXpub } from "@/lib/wallet/evm";
import { useSecurityPrefs, setSecurityPrefs, secureCopy } from "@/lib/wallet/security";
import { useVisibleChainIds, setVisibleChainIds } from "@/lib/wallet/visible-chains";
import { loadNectarLink, clearNectarLink, type NectarLinkRecord } from "@/lib/wallet/nectar";
import { savePrefs, useNotifPrefs } from "@/lib/wallet/notifications";
import { Switch } from "@/components/ui/switch";
import { NectarLinkDialog } from "./NectarLinkDialog";

type SectionId =
  | "security" | "wallets" | "alerts" | "nectar"
  | "backup" | "password" | "reveal" | "xpub" | "danger";

interface SectionDef {
  id: SectionId;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  destructive?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: "security", label: "Security",     hint: "Auto-lock, biometrics, anti-phishing",    icon: ShieldCheck },
  { id: "wallets",  label: "Wallets",      hint: "Show, hide, and reorder chains",          icon: Layers },
  { id: "alerts",   label: "Alerts",       hint: "In-app, email, and Telegram alerts",      icon: Bell },
  { id: "nectar",   label: "Nectar Pay",   hint: "Link this vault to a merchant account",   icon: Link2 },
  { id: "backup",   label: "Backup",       hint: "Download the encrypted vault file",       icon: HardDriveDownload },
  { id: "password", label: "Password",     hint: "Re-encrypt with a new password",          icon: Lock },
  { id: "reveal",   label: "Private key",  hint: "Export a per-chain private key or WIF",   icon: Key },
  { id: "xpub",     label: "xpub",         hint: "Share your EVM account xpub",             icon: Share2 },
  { id: "danger",   label: "Danger zone",  hint: "Erase the encrypted vault from this device", icon: Trash2, destructive: true },
];

export function SettingsDialog({
  open,
  onOpenChange,
  onWipe,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onWipe: () => void;
}) {
  const [active, setActive] = useState<SectionId | null>(null);

  // Reset to the section list every time the dialog closes.
  useEffect(() => {
    if (!open) setActive(null);
  }, [open]);

  const section = active ? SECTIONS.find((s) => s.id === active) ?? null : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none p-0
          sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-lg
        "
      >
        {section ? (
          <>
            <div className="flex items-center gap-1 border-b px-2 py-2 sm:px-4 sm:py-3">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-1 gap-1 px-2 text-sm"
                onClick={() => setActive(null)}
              >
                <ChevronLeft className="h-4 w-4" /> Settings
              </Button>
              <DialogTitle className="ml-1 truncate text-base font-semibold">
                {section.label}
              </DialogTitle>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {section.id === "security" && <SecurityPanel />}
              {section.id === "wallets"  && <WalletsPanel />}
              {section.id === "alerts"   && <AlertsPanel />}
              {section.id === "nectar"   && <NectarPanel />}
              {section.id === "backup"   && <BackupPanel />}
              {section.id === "password" && <PasswordPanel />}
              {section.id === "reveal"   && <RevealPanel />}
              {section.id === "xpub"     && <XpubPanel />}
              {section.id === "danger"   && <DangerPanel onWipe={onWipe} />}
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="border-b px-4 py-3 text-left sm:px-6 sm:py-4">
              <DialogTitle>Wallet settings</DialogTitle>
              <DialogDescription>
                Manage your encrypted vault. Everything here stays in this browser.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
              <ul className="space-y-1.5">
                {SECTIONS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setActive(s.id)}
                        className={`
                          flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition
                          hover:bg-muted/50 active:bg-muted
                          ${s.destructive ? "border-destructive/40 hover:bg-destructive/5" : ""}
                        `}
                      >
                        <span
                          className={`
                            grid h-9 w-9 shrink-0 place-items-center rounded-md
                            ${s.destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}
                          `}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm font-medium ${s.destructive ? "text-destructive" : ""}`}>
                            {s.label}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {s.hint}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}


function NectarPanel() {
  const [link, setLink] = useState<NectarLinkRecord | null>(() => loadNectarLink());
  const [linkOpen, setLinkOpen] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Link this wallet to a Nectar Pay merchant account. We send your BTC, TEXITcoin, and EVM extended public keys — never your seed or private keys.
      </p>
      {link ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          <div className="font-medium text-emerald-200">
            Linked{link.merchantName ? ` to ${link.merchantName}` : ""}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground break-all">
            {link.url}
          </div>
          {link.merchantId && (
            <div className="text-[11px] text-muted-foreground">Merchant ID: {link.merchantId}</div>
          )}
          <div className="text-[11px] text-muted-foreground">
            Linked {new Date(link.linkedAt).toLocaleString()}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          Not linked yet. Scan the QR code from your Nectar Pay merchant dashboard to connect.
        </div>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setLinkOpen(true)}>
          <Link2 className="mr-2 h-4 w-4" /> {link ? "Re-link" : "Scan Nectar Pay QR"}
        </Button>
        {link && (
          <Button
            variant="outline"
            onClick={() => {
              clearNectarLink();
              setLink(null);
              toast.success("Nectar Pay link removed from this device");
            }}
          >
            <Unlink className="mr-2 h-4 w-4" /> Unlink
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        "Unlink" only forgets the connection on this device. To stop Nectar Pay from watching these xpubs, also remove this wallet inside the Nectar Pay merchant dashboard.
      </p>
      <NectarLinkDialog open={linkOpen} onOpenChange={setLinkOpen} onLinked={(r) => setLink(r)} />
    </div>
  );
}

function WalletsPanel() {
  const visible = useVisibleChainIds();
  const visibleChains = visible
    .map((id) => CHAIN_LIST.find((c) => c.id === id))
    .filter((c): c is (typeof CHAIN_LIST)[number] => !!c);
  const hiddenChains = CHAIN_LIST.filter((c) => !visible.includes(c.id));

  function move(idx: number, delta: number) {
    const next = [...visible];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setVisibleChainIds(next);
  }
  function remove(id: ChainId) {
    if (visible.length <= 1) return;
    setVisibleChainIds(visible.filter((x) => x !== id));
  }
  function add(id: ChainId) {
    if (visible.includes(id)) return;
    setVisibleChainIds([...visible, id]);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Reorder to control swipe order. Hidden chains stay derived from your seed — they just don't render.
      </p>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">On dashboard</p>
        <div className="space-y-1.5">
          {visibleChains.map((c, idx) => {
            const last = visible.length === 1;
            return (
              <div
                key={c.id}
                className="flex w-full min-w-0 items-center gap-2 rounded-md border bg-muted/30 p-2"
              >
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground">{c.ticker} · {c.kind.toUpperCase()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === visibleChains.length - 1} onClick={() => move(idx, 1)} aria-label="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={last}
                    onClick={() => remove(c.id)}
                    aria-label="Hide"
                    title={last ? "At least one chain must stay visible" : "Hide"}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {hiddenChains.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add</p>
          <div className="space-y-1.5">
            {hiddenChains.map((c) => (
              <div
                key={c.id}
                className="flex w-full min-w-0 items-center gap-2 rounded-md border p-2"
              >
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground">{c.ticker} · {c.kind.toUpperCase()}</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => add(c.id)}>
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityPanel() {
  const prefs = useSecurityPrefs();
  return (
    <div className="space-y-4">
      <BiometricRow />

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

function BiometricRow() {
  const [status, setStatus] = useState<{ available: boolean; enabled: boolean }>({ available: false, enabled: false });
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    void getBiometricStatus().then(setStatus);
  }, []);

  if (!status.available) return null;

  async function enable() {
    if (!pw) { toast.error("Enter your wallet password to enable biometrics"); return; }
    setBusy(true);
    try {
      // Verify password is correct before storing it in the Keychain/Keystore.
      await unlockVault(pw);
      await enableBiometric(pw);
      setStatus({ available: true, enabled: true });
      setPw(""); setShowPw(false);
      toast.success("Biometric unlock enabled");
    } catch (err) {
      toast.error((err as Error).message ?? "Could not enable biometrics");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await disableBiometric();
      setStatus({ available: true, enabled: false });
      toast.success("Biometric unlock disabled");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Fingerprint className="h-4 w-4 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium">Biometric unlock</p>
          <p className="text-[11px] text-muted-foreground">
            Unlock with Face ID / fingerprint. Your password is stored in the OS Keychain / Keystore, released only after biometric verification.
          </p>
        </div>
      </div>
      {status.enabled ? (
        <Button size="sm" variant="outline" onClick={disable} disabled={busy} className="w-full">
          Disable biometric unlock
        </Button>
      ) : showPw ? (
        <div className="space-y-2">
          <Input
            type="password"
            placeholder="Wallet password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={enable} disabled={busy || !pw} className="flex-1">
              {busy ? "Enabling…" : "Confirm & enable"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowPw(false); setPw(""); }} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={() => setShowPw(true)} className="w-full">
          Enable biometric unlock
        </Button>
      )}
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
        Download the encrypted vault as a JSON file. It contains your seed for every chain, encrypted with your password.
      </p>
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
        <strong>Reminder:</strong> A backup is only as strong as your password. Use a long, unique one and keep the file somewhere you trust.
      </div>
      <Button className="w-full" onClick={download}>
        <Download className="mr-2 h-4 w-4" /> Download encrypted backup
      </Button>
    </div>
  );
}

function PasswordPanel() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (next !== confirm) { toast.error("New passwords don't match"); return; }
    setBusy(true);
    try {
      await changePassword(current, next);
      toast.success("Password changed");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change password");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Re-encrypts your vault under a new password. The old one stops working immediately.
      </p>
      <div><Label className="text-xs">Current password</Label>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus /></div>
      <div><Label className="text-xs">New password (min 8)</Label>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
      <div><Label className="text-xs">Confirm new password</Label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
      <Button className="w-full" disabled={busy || !current || !next || !confirm} onClick={submit}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        <KeyRound className="mr-2 h-4 w-4" /> Change password
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
      } else if (cfg.kind === "evm") {
        out = evmPrivateKey(mnemonic, cfg, 0);
      } else if (cfg.kind === "tron") {
        const { deriveTronAccount } = await import("@/lib/wallet/tron");
        const acct = deriveTronAccount(mnemonic, cfg, 0);
        out = "0x" + Array.from(acct.privateKey).map((b) => b.toString(16).padStart(2, "0")).join("");
      } else {
        const { deriveSolanaAccount } = await import("@/lib/wallet/solana");
        const acct = deriveSolanaAccount(mnemonic, cfg, 0);
        // Solana secret key is 64 bytes (priv + pub). Phantom-compatible base58.
        const bs58 = (await import("bs58")).default as { encode: (b: Uint8Array) => string };
        out = bs58.encode(acct.keypair.secretKey);
      }
      setKey(out); setPass(""); setShow(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wrong password");
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
          {cfg.kind === "utxo"
            ? "WIF (compressed) — import in any UTXO wallet."
            : cfg.kind === "evm"
              ? "0x-hex private key — import in MetaMask, Rabby, etc."
              : cfg.kind === "tron"
                ? "Hex private key — import in TronLink."
                : "Base58 secret key (64 bytes) — import in Phantom or Solflare."}
        </p>
      </div>

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
        <span>I am alone, no one is watching my screen, and I have not screen-shared this tab.</span>
      </label>

      {!key ? (
        <>
          <div>
            <Label className="text-xs">Vault password</Label>
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
            <Label className="text-xs">
              {cfg.kind === "utxo" ? "Private key (WIF)"
                : cfg.kind === "evm" ? "Private key (0x)"
                : cfg.kind === "tron" ? "Private key (hex)"
                : "Secret key (base58)"}
            </Label>
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
      toast.error(e instanceof Error ? e.message : "Wrong password");
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
            <Label className="text-xs">Vault password</Label>
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
function AlertsPanel() {
  const prefs = useNotifPrefs();
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Get notified the moment funds arrive in your wallet. Detection runs in this browser whenever the wallet is open — leave the tab open to keep watching.
      </p>

      {/* In-app */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Bell className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">In-app alerts</div>
              <div className="text-[11px] text-muted-foreground">Toast + bell dropdown when this tab is open.</div>
            </div>
          </div>
          <Switch
            checked={prefs.inApp}
            onCheckedChange={(v) => savePrefs({ inApp: v })}
          />
        </div>
      </div>

      {/* Email */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">Email alerts</div>
              <div className="text-[11px] text-muted-foreground">We'll email you when funds land — even if this tab is closed (coming soon).</div>
            </div>
          </div>
          <Switch
            checked={prefs.emailEnabled}
            disabled
            onCheckedChange={(v) => savePrefs({ emailEnabled: v })}
          />
        </div>
        <Input
          type="email"
          placeholder="you@example.com"
          value={prefs.email}
          onChange={(e) => savePrefs({ email: e.target.value })}
        />
      </div>

      {/* Telegram */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Send className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">Telegram alerts</div>
              <div className="text-[11px] text-muted-foreground">Send alerts to a Telegram chat (coming soon).</div>
            </div>
          </div>
          <Switch
            checked={prefs.telegramEnabled}
            disabled
            onCheckedChange={(v) => savePrefs({ telegramEnabled: v })}
          />
        </div>
        <Input
          placeholder="Telegram chat ID (e.g. 1234567890)"
          value={prefs.telegramChatId}
          onChange={(e) => savePrefs({ telegramChatId: e.target.value })}
        />
        <p className="text-[11px] text-muted-foreground">
          To get your chat ID, message <span className="font-mono">@userinfobot</span> on Telegram and copy the number it sends back.
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Notification settings only live in this browser. Use the same email / chat ID on each device you want alerts on.
      </p>
    </div>
  );
}
