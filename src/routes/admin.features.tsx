import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { WalletPage } from "@/components/wallet/WalletPage";
import { useAdminFeatureStatus, writeLocalOverride } from "@/lib/admin/use-admin-features";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/features")({
  head: () => ({
    meta: [
      { title: "Feature flags — Beekeeper admin" },
      {
        name: "description",
        content: "Admin kill-switches for Beekeeper wallet features.",
      },
      { property: "og:title", content: "Feature flags — Beekeeper admin" },
      { property: "og:description", content: "Admin kill-switches for Beekeeper wallet features." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminFeaturesPage,
});

function AdminFeaturesPage() {
  const [key, setKey] = useState("");
  const [submittedKey, setSubmittedKey] = useState("");
  const { status, isLoading, error, refetch } = useAdminFeatureStatus();
  const [localTopup, setLocalTopup] = useState(false);
  const [localCashout, setLocalCashout] = useState(false);

  useEffect(() => {
    if (!status) return;
    setLocalTopup(status.localTopupDisabled);
    setLocalCashout(status.localCashoutDisabled);
  }, [status]);

  const show = submittedKey.length >= 8;

  return (
    <WalletPage title="Feature flags" subtitle="Kill-switches for wallet on- and off-ramps">
      <div className="space-y-5">
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Admin key
          </div>
          <p className="text-sm text-muted-foreground">
            Paste the admin console key. This page is read-only for the global flags; the local
            override only affects this browser.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmittedKey(key);
              void refetch();
            }}
          >
            <Input
              type="password"
              value={key}
              autoComplete="off"
              placeholder="Admin console key"
              onChange={(e) => setKey(e.target.value)}
            />
            <Button type="submit" disabled={key.length < 8 || isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open"}
            </Button>
          </form>
          {error && (
            <p className="text-[12px] text-destructive">
              {error instanceof Error ? error.message : "Couldn't load feature flags."}
            </p>
          )}
        </Card>

        {show && (
          <Card className="space-y-5 p-5">
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1 text-muted-foreground">
                <p>
                  <strong className="text-foreground">Global flags</strong> come from the
                  server-side secrets <code>ADMIN_DISABLE_TOPUP</code> and{" "}
                  <code>ADMIN_DISABLE_CASHOUT</code>. Update them in Project Settings → Secrets and
                  publish to apply everywhere.
                </p>
                <p>
                  <strong className="text-foreground">Local override</strong> only affects this
                  browser and is useful for testing before you flip the global switch.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <FlagRow
                label="Top Up (onramp)"
                description="Buy crypto with dollars via VectorPay."
                globalDisabled={status.globalTopupDisabled}
                localDisabled={localTopup}
                onLocalChange={(next) => {
                  setLocalTopup(next);
                  writeLocalOverride({
                    topupDisabled: next,
                    cashoutDisabled: localCashout,
                  });
                }}
              />
              <FlagRow
                label="Cash Out (offramp)"
                description="Sell crypto and receive dollars in your bank."
                globalDisabled={status.globalCashoutDisabled}
                localDisabled={localCashout}
                onLocalChange={(next) => {
                  setLocalCashout(next);
                  writeLocalOverride({
                    topupDisabled: localTopup,
                    cashoutDisabled: next,
                  });
                }}
              />
            </div>
          </Card>
        )}
      </div>
    </WalletPage>
  );
}

function FlagRow({
  label,
  description,
  globalDisabled,
  localDisabled,
  onLocalChange,
}: {
  label: string;
  description: string;
  globalDisabled: boolean;
  localDisabled: boolean;
  onLocalChange: (v: boolean) => void;
}) {
  const effective = globalDisabled || localDisabled;
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
      <div className="space-y-1">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge active={!globalDisabled} label={globalDisabled ? "Global: disabled" : "Global: enabled"} />
          <Badge active={!localDisabled} label={localDisabled ? "Local: disabled" : "Local: enabled"} />
          <Badge active={!effective} label={effective ? "Effective: hidden" : "Effective: visible"} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor={`local-${label}`} className="text-xs text-muted-foreground">
          Local off
        </Label>
        <Switch
          id={`local-${label}`}
          checked={localDisabled}
          onCheckedChange={onLocalChange}
        />
      </div>
    </div>
  );
}

function Badge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        active
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-destructive/10 text-destructive"
      }`}
    >
      {active ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}
