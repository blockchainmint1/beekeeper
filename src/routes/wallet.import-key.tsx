import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, QrCode, ArrowDownToLine } from "lucide-react";
import { WalletPage } from "@/components/wallet/WalletPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { QrScanDialog } from "@/components/wallet/QrScanDialog";
import { useWalletSession } from "@/components/wallet/session";
import {
  decodeWifCandidates,
  wifBalance,
  sweepWif,
  type WifCandidate,
} from "@/lib/wallet/wif-import";
import { deriveUtxoAccount, satsToCoin } from "@/lib/wallet/utxo";
import { estimateFeeRate } from "@/lib/wallet/fees";

export const Route = createFileRoute("/wallet/import-key")({
  head: () => ({
    meta: [
      { title: "Import a private key · Beekeeper" },
      {
        name: "description",
        content:
          "Sweep the coins from a paper wallet or single private key straight into your Beekeeper wallet.",
      },
      { property: "og:title", content: "Import a private key · Beekeeper" },
      {
        property: "og:description",
        content: "Sweep a paper wallet or WIF private key into your Beekeeper wallet.",
      },
    ],
  }),
  component: ImportKeyPage,
});

type Row = WifCandidate & { sats: number | null; utxoCount: number | null };

function ImportKeyPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { mnemonic } = useWalletSession();
  const [raw, setRaw] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [checking, setChecking] = useState(false);
  const [sweeping, setSweeping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function inspect(input: string) {
    setError(null);
    setRows([]);
    setChecking(true);
    try {
      const candidates = await decodeWifCandidates(input);
      setRows(candidates.map((c) => ({ ...c, sats: null, utxoCount: null })));
      const filled = await Promise.all(
        candidates.map(async (c) => {
          try {
            const b = await wifBalance(c);
            return { ...c, sats: b.sats, utxoCount: b.utxoCount } as Row;
          } catch {
            return { ...c, sats: null, utxoCount: null } as Row;
          }
        }),
      );
      setRows(filled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that key.");
    } finally {
      setChecking(false);
    }
  }

  async function sweep(row: Row) {
    setSweeping(row.address + row.type);
    try {
      const dest = await deriveUtxoAccount(mnemonic, row.chain, 0, row.chain.defaultAddressType);
      const feeRate = await estimateFeeRate(row.chain, "medium");
      const out = await sweepWif({ candidate: row, toAddress: dest.address, feeRate });
      toast.success(
        `Swept ${satsToCoin(out.sentSats)} ${row.chain.ticker} into your wallet`,
        { description: out.txid },
      );
      qc.invalidateQueries({ queryKey: ["balance"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["portfolio-total"] });
      setRows((prev) =>
        prev.map((r) => (r === row ? { ...r, sats: 0, utxoCount: 0 } : r)),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sweep failed");
    } finally {
      setSweeping(null);
    }
  }

  return (
    <WalletPage
      title="Import a private key"
      subtitle="Move coins off a paper wallet or single key"
    >
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" />
              Private key (WIF)
            </CardTitle>
            <CardDescription>
              Nothing is stored on this device. The key is read once, its balance is swept into
              your own wallet, then it's forgotten.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="K… / L… / 5… / 6… — the private key printed or etched on your coin"
              rows={3}
              className="font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex gap-2">
              <Button onClick={() => inspect(raw)} disabled={checking || !raw.trim()} className="flex-1">
                {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Check balance
              </Button>
              <Button variant="outline" onClick={() => setScanOpen(true)}>
                <QrCode className="mr-2 h-4 w-4" />
                Scan
              </Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
        </Card>

        {rows.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Addresses found</CardTitle>
              <CardDescription>
                Some networks share a key format, so we check every address this key can
                control. Sweep the ones holding coins.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.map((row) => {
                const busy = sweeping === row.address + row.type;
                const empty = row.sats === 0;
                return (
                  <div
                    key={`${row.chain.id}-${row.type}-${row.address}`}
                    className="space-y-2 rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium text-background"
                        style={{ backgroundColor: row.chain.color }}
                      >
                        {row.chain.ticker}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.type === "segwit" ? "SegWit" : "Legacy"}
                      </span>
                    </div>
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {row.address}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {row.sats === null
                          ? "Checking…"
                          : `${satsToCoin(row.sats)} ${row.chain.ticker}`}
                      </p>
                      <Button
                        size="sm"
                        variant={row.sats && row.sats > 0 ? "default" : "outline"}
                        disabled={busy || !row.sats || empty}
                        onClick={() => sweep(row)}
                      >
                        {busy ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowDownToLine className="mr-2 h-4 w-4" />
                        )}
                        Sweep
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        <Button variant="ghost" className="w-full" onClick={() => navigate({ to: "/wallet" })}>
          Back to wallet
        </Button>
      </div>

      <QrScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        title="Scan a private key"
        description="Point your camera at the private key QR from a paper wallet or cold storage coin."
        onResult={(text) => {
          setScanOpen(false);
          setRaw(text.trim());
          void inspect(text);
        }}
      />
    </WalletPage>
  );
}
