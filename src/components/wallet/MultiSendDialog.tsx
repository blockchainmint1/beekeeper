import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ExternalLink, Loader2, Send, XCircle } from "lucide-react";
import { CHAIN_LIST, type ChainConfig, type EvmChain, type UtxoChain, type Erc20Token } from "@/lib/chains";
import { getCachedMnemonic } from "@/lib/wallet/seed";
import { deriveUtxoAccount, esplora, coinToSats, satsToCoin, validateUtxoAddress } from "@/lib/wallet/utxo";
import { deriveEvmAccount, isValidEvmAddress } from "@/lib/wallet/evm";
import { buildAndSignMultiUtxo, sendEvmMulti, type MultiSendProgress } from "@/lib/wallet/multisend";
import type { Address } from "viem";

interface Row { to: string; amount: string }

export function MultiSendDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const mnemonic = useMemo(() => getCachedMnemonic() ?? "", []);
  const [chainId, setChainId] = useState<string>(CHAIN_LIST[0].id);
  const chain = CHAIN_LIST.find((c) => c.id === chainId)!;
  const [bulk, setBulk] = useState("");
  const [rows, setRows] = useState<Row[]>([{ to: "", amount: "" }]);
  const [asset, setAsset] = useState<string>("native");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<MultiSendProgress[]>([]);
  const [utxoTxid, setUtxoTxid] = useState<string | null>(null);

  const evmChain = chain.kind === "evm" ? (chain as EvmChain) : null;
  const token: Erc20Token | null = evmChain && asset !== "native"
    ? (evmChain.tokens.find((t) => t.symbol === asset) ?? null) : null;

  function parseBulk() {
    const out: Row[] = [];
    for (const line of bulk.split(/\r?\n/)) {
      const cleaned = line.trim();
      if (!cleaned || cleaned.startsWith("#")) continue;
      const parts = cleaned.split(/[,\s]+/);
      if (parts.length < 2) continue;
      out.push({ to: parts[0], amount: parts[1] });
    }
    if (out.length === 0) { toast.error("No valid lines (use: address,amount per line)"); return; }
    setRows(out);
    toast.success(`Loaded ${out.length} recipients`);
  }

  function addRow() { setRows((r) => [...r, { to: "", amount: "" }]); }
  function removeRow(i: number) { setRows((r) => r.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function reset() {
    setRows([{ to: "", amount: "" }]);
    setBulk("");
    setResults([]);
    setUtxoTxid(null);
  }

  async function handleSend() {
    const cleanRows = rows.filter((r) => r.to.trim() && r.amount.trim());
    if (cleanRows.length === 0) { toast.error("Add at least one recipient"); return; }
    setBusy(true);
    setResults([]);
    setUtxoTxid(null);
    try {
      if (chain.kind === "utxo") {
        const c = chain as UtxoChain;
        // validate addresses + amounts
        for (const r of cleanRows) {
          const ok = await validateUtxoAddress(r.to, c);
          if (!ok) throw new Error(`Invalid ${c.ticker} address: ${r.to}`);
        }
        const outputs = cleanRows.map((r) => ({ address: r.to.trim(), amountSats: coinToSats(r.amount, c.decimals) }));
        const account = await deriveUtxoAccount(mnemonic, c, 0, "segwit");
        const { hex, feeSats, totalSpentSats } = await buildAndSignMultiUtxo({ account, outputs, feeRate: c.defaultFeeRate });
        const id = await esplora.broadcast(c, hex);
        setUtxoTxid(id);
        toast.success(`Batched ${outputs.length} outputs · fee ${satsToCoin(feeSats, c.decimals)} ${c.ticker} · total ${satsToCoin(totalSpentSats, c.decimals)}`);
      } else if (evmChain) {
        for (const r of cleanRows) {
          if (!isValidEvmAddress(r.to)) throw new Error(`Invalid EVM address: ${r.to}`);
        }
        const account = deriveEvmAccount(mnemonic, evmChain, 0);
        const evmRows = cleanRows.map((r) => ({ to: r.to.trim() as Address, amount: r.amount }));
        const res = await sendEvmMulti({
          account,
          chain: evmChain,
          token,
          rows: evmRows,
          onProgress: (p) => setResults((prev) => {
            const next = [...prev];
            const existingIdx = next.findIndex((x) => x.index === p.index);
            if (existingIdx >= 0) next[existingIdx] = p; else next.push(p);
            return next;
          }),
        });
        const ok = res.filter((r) => r.status === "sent").length;
        const fail = res.length - ok;
        toast[fail ? "warning" : "success"](`Sent ${ok}/${res.length}${fail ? ` · ${fail} failed` : ""}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Multi-send failed");
    } finally {
      setBusy(false);
    }
  }

  function handleClose(v: boolean) {
    if (!v && !busy) reset();
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Multi-send</DialogTitle>
          <DialogDescription>
            UTXO chains batch into one transaction. EVM chains send sequentially.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1.5 block text-xs">Chain</Label>
              <Select value={chainId} onValueChange={(v) => { setChainId(v); setAsset("native"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHAIN_LIST.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            {evmChain && evmChain.tokens.length > 0 && (
              <div>
                <Label className="mb-1.5 block text-xs">Asset</Label>
                <Select value={asset} onValueChange={setAsset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="native">{evmChain.nativeSymbol} (native)</SelectItem>
                    {evmChain.tokens.map((t) => (<SelectItem key={t.symbol} value={t.symbol}>{t.symbol}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label className="mb-1.5 block text-xs">Bulk paste (address,amount per line)</Label>
            <Textarea
              rows={3}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder="0xabc…,0.1&#10;0xdef…,0.25"
              className="font-mono text-xs"
            />
            <Button size="sm" variant="outline" className="mt-1.5" onClick={parseBulk} disabled={!bulk.trim()}>
              Parse {bulk.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).length} lines
            </Button>
          </div>

          <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-md border p-2">
            {rows.map((r, i) => {
              const status = results.find((x) => x.index === i);
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    placeholder={chain.kind === "evm" ? "0x…" : `${chain.ticker.toLowerCase()}1…`}
                    value={r.to}
                    onChange={(e) => updateRow(i, { to: e.target.value })}
                    className="flex-1 font-mono text-xs"
                  />
                  <Input
                    placeholder="0.0"
                    value={r.amount}
                    onChange={(e) => updateRow(i, { amount: e.target.value })}
                    className="w-24 text-xs"
                  />
                  {status?.status === "pending" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {status?.status === "sent" && (
                    <a href={evmChain?.explorerTx(status.hash!)} target="_blank" rel="noreferrer">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </a>
                  )}
                  {status?.status === "failed" && (
                    <span title={status.error}><XCircle className="h-4 w-4 text-destructive" /></span>
                  )}
                  {!status && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeRow(i)}>×</Button>
                  )}
                </div>
              );
            })}
            <Button size="sm" variant="ghost" className="w-full" onClick={addRow}>+ add row</Button>
          </div>

          {utxoTxid && chain.kind === "utxo" && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <Badge className="mb-2">Batched txid</Badge>
              <p className="break-all font-mono">{utxoTxid}</p>
              <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => window.open(chain.explorerTx(utxoTxid), "_blank")}>
                <ExternalLink className="mr-2 h-4 w-4" /> View on explorer
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleSend} disabled={busy}>
            <Send className="mr-2 h-4 w-4" /> {busy ? "Sending…" : `Send ${rows.filter((r) => r.to && r.amount).length} recipients`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}