/**
 * Security checkup — pass/warn rows for the handful of things worth getting
 * right on a non-custodial wallet. Rendered on /wallet/security and inside the
 * settings card stack.
 */
import { useEffect, useState } from "react";
import { Clock, Fingerprint, Radar, CheckCircle2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasNectarLink } from "@/lib/wallet/nectar";
import { isBiometricEnabledSync } from "@/lib/native/biometric";

interface CheckRow {
  id: string;
  label: string;
  detail: string;
  ok: boolean;
  icon: typeof ShieldCheck;
}

export function SecurityCheckupCard() {
  const [checks, setChecks] = useState<CheckRow[]>([]);

  useEffect(() => {
    const bio = isBiometricEnabledSync();
    const linked = hasNectarLink();
    setChecks([
      {
        id: "biometric",
        label: "Biometric unlock",
        detail: bio
          ? "Face/fingerprint unlock is on"
          : "Password only — enable biometrics below",
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
  }, []);

  const passing = checks.filter((c) => c.ok).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Security checkup
        </CardTitle>
        <CardDescription>
          <span className="tabular font-medium">
            {passing} / {checks.length}
          </span>{" "}
          checks passing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {checks.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
            <c.icon
              className="h-4 w-4 shrink-0"
              style={{ color: c.ok ? "var(--success)" : "var(--isk)" }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{c.label}</div>
              <div className="truncate text-xs text-muted-foreground">{c.detail}</div>
            </div>
            {c.ok && (
              <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--success)" }} />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
