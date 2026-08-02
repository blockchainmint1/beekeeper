import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, ShieldAlert, Clock, RefreshCw, Fingerprint, Radar, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { WalletPage } from "@/components/wallet/WalletPage";
import { hasNectarLink } from "@/lib/wallet/nectar";
import {
  getScanGap, setScanGap, SCAN_GAP_MIN, SCAN_GAP_MAX,
} from "@/lib/wallet/scan-prefs";
import { isBiometricEnabledSync } from "@/lib/native/biometric";

export const Route = createFileRoute("/wallet/security")({
  component: SecurityPage,
});

interface CheckRow {
  id: string;
  label: string;
  detail: string;
  ok: boolean;
  icon: typeof ShieldCheck;
  action?: { label: string; run: () => void };
}

function SecurityPage() {
  const qc = useQueryClient();
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [gap, setGap] = useState(SCAN_GAP_MIN);
  const [rescanning, setRescanning] = useState(false);

  function refresh() {
    const backedUp = isVaultBackedUp();
    const last = getLastBackupAt();
    const bio = isBiometricEnabledSync();
    const linked = hasNectarLink();

    setChecks([
      {
        id: "backup",
        label: "Encrypted backup",
        detail: backedUp
          ? `Last saved ${last ? new Date(last).toLocaleDateString() : "recently"}`
          : "No backup saved on this device yet",
        ok: backedUp,
        icon: backedUp ? ShieldCheck : ShieldAlert,
        action: {
          label: "Download",
          run: () => {
            if (downloadVaultBackup()) {
              toast.success("Encrypted backup saved");
              refresh();
            } else {
              toast.error("No vault to back up");
            }
          },
        },
      },
      {
        id: "biometric",
        label: "Biometric unlock",
        detail: bio ? "Face/fingerprint unlock is on" : "Password only — enable biometrics in Settings",
        ok: bio,
        icon: Fingerprint,
      },
      {
        id: "idle",
        label: "Auto-lock on idle",
        detail: "Wallet clears its key from memory when you walk away",
        ok: true,
        icon: Clock,
      },
      {
        id: "nectar",
        label: "Nectar Pay link",
        detail: linked ? "Merchant keys are shared and watching" : "Not linked to a merchant store",
        ok: linked,
        icon: Radar,
      },
    ]);
  }

  useEffect(() => {
    refresh();
    setGap(getScanGap());
  }, []);

  async function deepRescan() {
    setRescanning(true);
    // Widen the HD walker to its maximum, then blow away every cached balance
    // so each chain re-derives and re-checks its full address range.
    setScanGap(SCAN_GAP_MAX);
    setGap(SCAN_GAP_MAX);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["balance"] }),
      qc.invalidateQueries({ queryKey: ["tokens"] }),
      qc.invalidateQueries({ queryKey: ["history"] }),
      qc.invalidateQueries({ queryKey: ["portfolio-total"] }),
      qc.invalidateQueries({ queryKey: ["consolidation-plan"] }),
    ]);
    toast.success("Deep rescan started", {
      description: `Now checking ${SCAN_GAP_MAX} addresses per branch on every chain.`,
    });
    setRescanning(false);
  }

  const passing = checks.filter((c) => c.ok).length;

  return (
    <WalletPage title="Security checkup" subtitle="Four things worth getting right">
      <div className="glass-card rounded-2xl p-4">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Score
        </div>
        <div className="tabular mt-1 text-2xl font-semibold">
          {passing} / {checks.length}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {checks.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
            <c.icon
              className="h-4 w-4 shrink-0"
              style={{ color: c.ok ? "var(--success)" : "var(--isk)" }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{c.label}</div>
              <div className="truncate text-xs text-muted-foreground">{c.detail}</div>
            </div>
            {c.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--success)" }} />
            ) : (
              c.action && (
                <Button size="sm" variant="secondary" className="h-7 shrink-0 text-xs" onClick={c.action.run}>
                  <Download className="mr-1 h-3 w-3" /> {c.action.label}
                </Button>
              )
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Radar className="h-4 w-4" /> Deep rescan
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Missing a payment? Widen the address search. Higher values catch funds parked on high
          derivation indexes but each refresh takes longer.
        </p>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Addresses per branch</span>
            <span className="tabular font-medium">{gap}</span>
          </div>
          <Slider
            value={[gap]}
            min={SCAN_GAP_MIN}
            max={SCAN_GAP_MAX}
            step={5}
            onValueChange={(v) => setGap(v[0] ?? SCAN_GAP_MIN)}
            onValueCommit={(v) => {
              const next = setScanGap(v[0] ?? SCAN_GAP_MIN);
              setGap(next);
              toast.message(`Scan depth set to ${next}`);
            }}
          />
        </div>

        <Button onClick={deepRescan} disabled={rescanning} variant="secondary" className="mt-4 w-full">
          <RefreshCw className={`mr-2 h-4 w-4 ${rescanning ? "animate-spin" : ""}`} />
          Run deep rescan of every chain
        </Button>
      </div>
    </WalletPage>
  );
}
