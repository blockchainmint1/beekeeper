import { useState } from "react";
import { Activity, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NATIVE_API_ORIGIN, isNativeShell } from "@/lib/native/api-origin";
import { mempoolAddressInfo } from "@/lib/wallet/mempool.functions";

type Check = { name: string; ok: boolean; detail: string };

/**
 * On device there is no address bar, no devtools and no way to copy an error,
 * so a broken backend call just looks like "nothing works". This runs the three
 * request classes the wallet depends on and prints the raw outcome of each.
 */
export function ConnectionDiagnosticsCard() {
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);

  async function run() {
    setRunning(true);
    const out: Check[] = [];

    const push = (name: string, ok: boolean, detail: string) =>
      out.push({ name, ok, detail: detail.slice(0, 300) });

    // 1. Plain GET to our public API (no preflight).
    try {
      const res = await fetch("/api/public/apk/latest", { headers: { accept: "application/json" } });
      const text = await res.text();
      push("Public API (GET)", res.ok, `HTTP ${res.status} · ${text.slice(0, 120)}`);
    } catch (error) {
      push("Public API (GET)", false, String(error));
    }

    // 2. Server function POST — needs a successful CORS preflight in the app.
    try {
      const info = await mempoolAddressInfo({
        data: { chainId: "txc", address: "TSs4ZmvGeCRRuJnCyGsyzTLLmk1S6TzHfW" },
      });
      push("Server function (POST)", true, info ? "responded with data" : "responded (no data)");
    } catch (error) {
      push("Server function (POST)", false, String(error));
    }

    // 3. Direct third-party call from the device.
    try {
      const res = await fetch("https://mempool.space/api/blocks/tip/height");
      push("Direct provider", res.ok, `HTTP ${res.status} · ${(await res.text()).slice(0, 40)}`);
    } catch (error) {
      push("Direct provider", false, String(error));
    }

    setChecks(out);
    setRunning(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4 text-primary" aria-hidden="true" />
          Connection test
        </CardTitle>
        <CardDescription>
          Checks the three ways this wallet talks to the network.{" "}
          {isNativeShell() ? `App build · backend ${NATIVE_API_ORIGIN}` : "Browser build."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={run} disabled={running} variant="secondary" size="sm">
          {running ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {running ? "Testing…" : "Run connection test"}
        </Button>
        {checks ? (
          <ul className="space-y-2 text-sm">
            {checks.map((c) => (
              <li key={c.name} className="rounded-md border border-border/60 p-3">
                <span className="flex items-center gap-2 font-medium">
                  {c.ok ? (
                    <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                  ) : (
                    <XCircle className="size-4 text-destructive" aria-hidden="true" />
                  )}
                  {c.name}
                </span>
                <span className="mt-1 block break-words font-mono text-xs text-muted-foreground">
                  {c.detail}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
