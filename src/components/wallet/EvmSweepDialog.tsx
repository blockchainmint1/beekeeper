// "Scan & Sweep" dialog for EVM HD wallets.
// Lists every derived address with a balance and lets you consolidate
// native + ERC-20 funds to a destination (defaults to receive index 0).
import { useEffect, useMemo, useState } from "react";
import { Loader2, Copy, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { Address } from "viem";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EvmChain, Erc20Token } from "@/lib/chains";
import {
  scanEvmHd,
  estimateNativeSweep,
  sweepEvmNative,
  sweepEvmToken,
  formatEth,
  type EvmHdAddress,
} from "@/lib/wallet/evm-sweep";
import { deriveEvmAccount } from "@/lib/wallet/evm";

export function EvmSweepDialog({
  open,
  onOpenChange,
  chain,
  mnemonic,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chain: EvmChain;
  mnemonic: string;
}) {
  const defaultDest = useMemo(
    () => (mnemonic ? (deriveEvmAccount(mnemonic, chain, 0).address as Address) : ("" as Address)),
    [mnemonic, chain],
  );
  const [destination, setDestination] = useState<string>(defaultDest);
  const [count, setCount] = useState(20);
  const [scanning, setScanning] = useState(false);
  const [rows, setRows] = useState<EvmHdAddress[]>([]);
  const [scanned, setScanned] = useState<number | null>(null);
  const [hideNative, setHideNative] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (open) {
      setDestination(defaultDest);
      setRows([]);
      setScanned(null);
    }
  }, [open, defaultDest]);

  async function scan() {
    setScanning(true);
    setRows([]);
    setScanned(null);
    try {
      const res = await scanEvmHd(mnemonic, chain, { count });
      setRows(res.active);
      setScanned(res.scanned);
      if (res.active.length === 0) toast.info("No balances found in scanned range");
      else toast.success(`Found ${res.active.length} address${res.active.length === 1 ? "" : "es"} with balance`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  function validDest(): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(destination.trim());
  }

  async function sweepNative(row: EvmHdAddress) {
    if (!validDest()) return toast.error("Set a valid destination address first");
    if (destination.trim().toLowerCase() === row.address.toLowerCase())
      return toast.error("Destination is the same as source");
    const key = `${row.index}-native`;
    setBusyKey(key);
    setStatus("Estimating gas…");
    try {
      const est = await estimateNativeSweep(chain, row.address);
      if (est.sendable <= 0n) throw new Error(`Balance too low to cover gas (need ~${est.formattedCost} ${chain.nativeSymbol})`);
      if (!confirm(`Sweep ${est.formattedSendable} ${chain.nativeSymbol} (after ~${est.formattedCost} gas) from #${row.index} → ${destination}?`)) return;
      setStatus("Signing & broadcasting…");
      const hash = await sweepEvmNative({
        mnemonic,
        chain,
        fromIndex: row.index,
        to: destination.trim() as Address,
      });
      toast.success("Broadcast: " + hash.slice(0, 12) + "…");
      window.open(chain.explorerTx(hash), "_blank");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyKey(null);
      setStatus("");
    }
  }

  async function sweepToken(row: EvmHdAddress, token: Erc20Token, formatted: string) {
    if (!validDest()) return toast.error("Set a valid destination address first");
    if (destination.trim().toLowerCase() === row.address.toLowerCase())
      return toast.error("Destination is the same as source");
    if (!confirm(`Sweep ${formatted} ${token.symbol} from #${row.index} → ${destination}? (gas paid in ${chain.nativeSymbol})`)) return;
    const key = `${row.index}-${token.address}`;
    setBusyKey(key);
    setStatus("Signing & broadcasting…");
    try {
      const hash = await sweepEvmToken({
        mnemonic,
        chain,
        fromIndex: row.index,
        token,
        to: destination.trim() as Address,
      });
      toast.success("Broadcast: " + hash.slice(0, 12) + "…");
      window.open(chain.explorerTx(hash), "_blank");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyKey(null);
      setStatus("");
    }
  }

  async function sweepAll() {
    if (!validDest()) return toast.error("Set a valid destination address first");
    type Job = { row: EvmHdAddress; kind: "native" | "token"; token?: Erc20Token; formatted?: string };
    const dest = destination.trim().toLowerCase();
    const jobs: Job[] = [];
    const visible = rows.filter((r) => r.tokens.length > 0 || !hideNative);
    // Tokens first per row (they need native gas at source).
    for (const row of visible) {
      if (row.address.toLowerCase() === dest) continue;
      for (const t of row.tokens) jobs.push({ row, kind: "token", token: t.token, formatted: t.formatted });
    }
    if (!hideNative) {
      for (const row of visible) {
        if (row.address.toLowerCase() === dest) continue;
        if (row.nativeWei > 0n) jobs.push({ row, kind: "native" });
      }
    }
    if (jobs.length === 0) return toast.info("Nothing to sweep");
    if (!confirm(`Sweep ALL ${jobs.length} balance${jobs.length === 1 ? "" : "s"} → ${destination}?\n\nFailures will be skipped and reported at the end.`))
      return;
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      const key = `${j.row.index}-${j.kind === "native" ? "native" : j.token!.address}`;
      setBusyKey(key);
      setStatus(`Sweeping ${i + 1}/${jobs.length}…`);
      try {
        const hash =
          j.kind === "native"
            ? await sweepEvmNative({ mnemonic, chain, fromIndex: j.row.index, to: destination.trim() as Address })
            : await sweepEvmToken({ mnemonic, chain, fromIndex: j.row.index, token: j.token!, to: destination.trim() as Address });
        ok++;
        toast.success(`#${j.row.index} ${j.kind === "native" ? chain.nativeSymbol : j.token!.symbol}: ${hash.slice(0, 12)}…`);
      } catch (e) {
        failed++;
        toast.error(`#${j.row.index} ${j.kind === "native" ? chain.nativeSymbol : j.token!.symbol}: ${(e as Error).message}`);
      }
    }
    setBusyKey(null);
    setStatus("");
    if (failed === 0) toast.success(`Swept ${ok}/${jobs.length} balances`);
    else toast.warning(`Swept ${ok}/${jobs.length} — ${failed} failed`);
  }

  const visibleRows = rows.filter((r) => r.tokens.length > 0 || !hideNative);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scan &amp; Sweep — {chain.name}</DialogTitle>
          <DialogDescription>
            EVM addresses are derived from one xpub. We scan a range of indices and let you
            consolidate dust back to a single destination.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scan controls */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Indices to scan</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
              />
            </div>
            <Button onClick={scan} disabled={scanning || !mnemonic}>
              {scanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…
                </>
              ) : (
                "Scan"
              )}
            </Button>
          </div>

          {/* Destination */}
          <div>
            <Label className="text-xs">Sweep destination</Label>
            <div className="flex gap-2">
              <Input
                placeholder="0x… destination address"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={() => setDestination(defaultDest)}>
                Use #0
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sweep native last — token sweeps need native gas at the source address.
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={hideNative}
                onChange={(e) => setHideNative(e.target.checked)}
              />
              Hide {chain.nativeSymbol} (don't sweep)
            </label>
          </div>

          {/* Results */}
          {scanned !== null && (
            <div className="text-xs text-muted-foreground">
              Scanned {scanned} address{scanned === 1 ? "" : "es"} ·{" "}
              {visibleRows.length} with balance
            </div>
          )}

          {visibleRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={sweepAll} disabled={busyKey !== null}>
                  {busyKey !== null ? status || "Sweeping…" : "Sweep All"}
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>

              {visibleRows.map((row) => (
                <div key={row.index} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-xs text-muted-foreground">
                      #{row.index} · {row.address.slice(0, 10)}…{row.address.slice(-6)}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        navigator.clipboard.writeText(row.address);
                        toast.success("Address copied");
                      }}
                    >
                      <Copy className="mr-1 h-3 w-3" /> Copy
                    </Button>
                  </div>
                  <div className="mt-2 space-y-2">
                    {row.nativeWei > 0n && !hideNative && (
                      <div className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2.5 py-2">
                        <div>
                          <div className="text-sm font-mono">
                            {formatEth(row.nativeWei)} {chain.nativeSymbol}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Native
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => sweepNative(row)}
                          disabled={busyKey !== null}
                        >
                          {busyKey === `${row.index}-native` ? "…" : "Sweep"}
                        </Button>
                      </div>
                    )}
                    {row.tokens.map((t) => (
                      <div
                        key={t.token.address}
                        className="flex items-center justify-between gap-2 rounded border px-2.5 py-2"
                      >
                        <div>
                          <div className="text-sm font-mono">
                            {t.formatted} {t.token.symbol}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {t.token.name}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => sweepToken(row, t.token, t.formatted)}
                          disabled={busyKey !== null}
                        >
                          {busyKey === `${row.index}-${t.token.address}` ? "…" : "Sweep"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {busyKey && status && (
            <p className="text-xs text-muted-foreground">{status}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
