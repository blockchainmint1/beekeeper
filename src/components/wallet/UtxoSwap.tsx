/**
 * Swap a UTXO chain's native coin into a stablecoin via an external
 * counterparty (ported from HME Wallet's THORChain-backed swap).
 *
 * Beekeeper doesn't have a quote/broadcast adapter wired up yet (see
 * utxo-swap-config.ts), so this renders a friendly "not available" state
 * for every chain today. The shape here is intentionally close to the
 * source so a real adapter can be dropped in later without reworking the UI.
 */
import { ArrowDown } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UtxoChain } from "@/lib/chains";
import type { UtxoSwapConfig } from "@/components/wallet/utxo-swap-config";
import { ExchangeUnavailable } from "@/components/wallet/ExchangeUnavailable";

export function UtxoSwap({ chain, config }: { chain: UtxoChain; config: UtxoSwapConfig }) {
  if (config.destinations.length === 0) {
    return <ExchangeUnavailable chainName={chain.name} />;
  }

  // Real quote/build/broadcast wiring lands here once a counterparty adapter
  // exists — for now the form is a non-functional preview of the layout.
  return (
    <Card>
      <CardHeader>
        <CardTitle>Swap to a stablecoin</CardTitle>
        <CardDescription>
          Your {chain.ticker} is signed on this device; the stablecoin lands in your
          wallet a few minutes later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="swap-amount">You send ({chain.ticker})</Label>
          <Input id="swap-amount" type="number" inputMode="decimal" min="0" placeholder="0.0" className="mt-1" disabled />
        </div>
        <div className="flex justify-center">
          <div className="rounded-full border border-border/60 bg-card/60 p-2">
            <ArrowDown className="h-4 w-4" />
          </div>
        </div>
        <div>
          <Label htmlFor="swap-dest">You receive</Label>
          <select id="swap-dest" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" disabled>
            {config.destinations.map((d) => (
              <option key={d.asset} value={d.asset}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <Button className="w-full" disabled>
          Coming soon
        </Button>
      </CardContent>
    </Card>
  );
}
