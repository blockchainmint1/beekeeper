import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Recycle, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getChain, type ChainId, type UtxoChain } from "@/lib/chains";
import { WalletPage } from "@/components/wallet/WalletPage";
import { useWalletSession } from "@/components/wallet/session";
import { getScanGap } from "@/lib/wallet/scan-prefs";
import { satsToCoin } from "@/lib/wallet/utxo";
import {
  planConsolidation,
  runConsolidation,
  type ConsolidationStep,
} from "@/lib/wallet/consolidate";

export const Route = createFileRoute("/wallet/$chain/consolidate")({
  component: ConsolidatePage,
});

function ConsolidatePage() {
  const { chain: chainId } = Route.useParams();
  const chain = getChain(chainId as ChainId);
  const { mnemonic } = useWalletSession();
  const qc = useQueryClient();
  const [feeRate, setFeeRate] = useState("2");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<ConsolidationStep[]>([]);

  const isUtxo = chain.kind === "utxo";

  const plan = useQuery({
    queryKey: ["consolidation-plan", chain.id],
    enabled: isUtxo && !!mnemonic,
    queryFn: () => planConsolidation(mnemonic, chain as UtxoChain, getScanGap()),
  });

  if (!isUtxo) {
    return (
      <WalletPage title="Consolidate">
        <p className="text-sm text-muted-foreground">
          {chain.name} is an account-based chain — use Scan &amp; sweep instead.
        </p>
      </WalletPage>
    );
  }

  async function run() {
    if (!plan.data) return;
    setBusy(true);
    setSteps([]);
    try {
      const rate = Math.max(1, Number(feeRate) || 1);
      const results = await runConsolidation(
        mnemonic,
        chain as UtxoChain,
        plan.data,
        rate,
        (step) => setSteps((cur) => [...cur, step]),
      );
      const ok = results.filter((r) => r.status === "ok").length;
      if (ok > 0) toast.success(`Swept ${ok} address${ok === 1 ? "" : "es"}`);
      if (ok < results.length) toast.error(`${results.length - ok} sweep(s) failed`);
      qc.invalidateQueries({ queryKey: ["balance"] });
      qc.invalidateQueries({ queryKey: ["portfolio-total"] });
    } finally {
      setBusy(false);
    }
  }

  const p = plan.data;

  return (
    <WalletPage
      title="Consolidate UTXOs"
      subtitle={`Pull scattered ${chain.ticker} back into your primary address`}
    >
      {plan.isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {plan.isError && (
        <p className="text-sm text-destructive">Couldn't scan your addresses. Try again shortly.</p>
      )}

      {p && (
        <div className="space-y-5">
          <div className="glass-card rounded-2xl p-4">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Ready to consolidate
            </div>
            <div className="tabular mt-1 text-2xl font-semibold">
              {satsToCoin(p.totalSats, chain.decimals)} {chain.ticker}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              across {p.sources.length} derived address{p.sources.length === 1 ? "" : "es"} → {p.destination}
            </div>
            {p.skippedChangeSats > 0 && (
              <div className="mt-3 text-xs text-muted-foreground">
                {satsToCoin(p.skippedChangeSats, chain.decimals)} {chain.ticker} sits on change
                addresses and is skipped — it moves automatically the next time you send.
              </div>
            )}
          </div>

          {p.sources.length > 0 && (
            <>
              <div className="max-w-[160px]">
                <Label htmlFor="feeRate">Fee rate (sat/vB)</Label>
                <Input
                  id="feeRate"
                  value={feeRate}
                  onChange={(e) => setFeeRate(e.target.value)}
                  inputMode="decimal"
                  className="mt-1.5"
                />
              </div>

              <Button onClick={run} disabled={busy} className="w-full">
                <Recycle className="mr-2 h-4 w-4" />
                {busy ? "Consolidating…" : `Sweep ${p.sources.length} address${p.sources.length === 1 ? "" : "es"}`}
              </Button>

              <p className="text-xs text-muted-foreground">
                Each address is swept in its own transaction, so you'll see one fee per address.
              </p>
            </>
          )}

          {p.sources.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing to consolidate — all your {chain.ticker} already lives on the primary address.
            </p>
          )}

          {steps.length > 0 && (
            <div className="space-y-2">
              {steps.map((s) => (
                <div
                  key={s.address}
                  className="flex items-start gap-2 rounded-xl border border-border p-3 text-xs"
                >
                  {s.status === "ok" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--success)" }} />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="tabular truncate font-medium">
                      #{s.index} · {satsToCoin(s.sats, chain.decimals)} {chain.ticker}
                    </div>
                    <div className="truncate text-muted-foreground">
                      {s.status === "ok" ? s.txid : s.error}
                    </div>
                  </div>
                  {s.txid && chain.explorerTx && (
                    <a
                      href={chain.explorerTx.replace("{txid}", s.txid)}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </WalletPage>
  );
}
