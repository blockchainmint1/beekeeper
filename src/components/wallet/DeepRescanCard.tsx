/**
 * Deep rescan — widen the HD address search and drop every cached balance so
 * each chain re-derives and re-checks its full range. The escape hatch for a
 * payment that landed on a high derivation index.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Radar, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getScanGap, setScanGap, SCAN_GAP_MIN, SCAN_GAP_MAX } from "@/lib/wallet/scan-prefs";

export function DeepRescanCard() {
  const qc = useQueryClient();
  const [gap, setGap] = useState(SCAN_GAP_MIN);
  const [rescanning, setRescanning] = useState(false);

  useEffect(() => {
    setGap(getScanGap());
  }, []);

  async function deepRescan() {
    setRescanning(true);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radar className="h-5 w-5" /> Deep rescan
        </CardTitle>
        <CardDescription>
          Missing a payment? Widen the address search. Higher values catch funds parked on high
          derivation indexes, but each refresh takes longer.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
        <Button onClick={deepRescan} disabled={rescanning} variant="secondary" className="mt-4 w-full">
          <RefreshCw className={`mr-2 h-4 w-4 ${rescanning ? "animate-spin" : ""}`} />
          Run deep rescan of every chain
        </Button>
      </CardContent>
    </Card>
  );
}
