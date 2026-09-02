/**
 * Watch-only addresses — track a cold-storage coin or paper wallet balance
 * without importing any key. Nothing here can sign; the wallet only reads
 * balances from the same providers it uses for your own addresses.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Plus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CHAIN_LIST, getChain, type ChainId } from "@/lib/chains";
import {
  addWatchOnly, removeWatchOnly, useWatchOnly, validateWatchAddress,
  watchOnlyBalance, watchableChain, type WatchOnlyEntry,
} from "@/lib/wallet/watch-only";
import { useHideBalances, maskAmount } from "@/lib/wallet/hide-balances";

const chains = CHAIN_LIST.filter(watchableChain);

export function WatchOnlyCard() {
  const entries = useWatchOnly();
  const [chainId, setChainId] = useState<ChainId>(chains[0]?.id ?? "btc");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const ok = await validateWatchAddress(chainId, address);
      if (!ok) {
        toast.error(`That isn't a valid ${getChain(chainId).ticker} address`);
        return;
      }
      addWatchOnly({ chainId, address, label });
      setAddress("");
      setLabel("");
      toast.success("Watch-only address added");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" /> Watch-only addresses
        </CardTitle>
        <CardDescription>
          Track a cold storage coin or paper wallet by address. Read-only — no key ever leaves the
          coin, and these balances cannot be spent from here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Select value={chainId} onValueChange={(v) => setChainId(v as ChainId)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {chains.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.ticker}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={address}
            placeholder="Public address"
            spellCheck={false}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Input
            value={label}
            placeholder="Label (e.g. Copper coin #4)"
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button onClick={add} disabled={busy || !address.trim()} size="icon" aria-label="Add watch-only address">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {entries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Nothing watched yet. Paste the address printed on a coin to keep an eye on it.
          </p>
        ) : (
          <div className="space-y-1.5">
            {entries.map((e) => (
              <WatchRow key={e.id} entry={e} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WatchRow({ entry }: { entry: WatchOnlyEntry }) {
  const chain = getChain(entry.chainId);
  const hidden = useHideBalances();
  const q = useQuery({
    queryKey: ["watch-only-balance", entry.id],
    queryFn: () => watchOnlyBalance(entry),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });

  const amount =
    q.isLoading ? "…"
    : q.isError ? "—"
    : (q.data ?? 0).toLocaleString("en-US", { maximumFractionDigits: 8 });

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: chain.color }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{entry.label}</div>
        <div className="truncate text-[11px] text-muted-foreground">{entry.address}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tabular text-sm font-semibold">
          {hidden ? maskAmount() : amount} {chain.ticker}
        </div>
      </div>
      <a
        href={chain.explorerAddr(entry.address)}
        target="_blank"
        rel="noreferrer"
        aria-label="View on explorer"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <button
        type="button"
        onClick={() => {
          removeWatchOnly(entry.id);
          toast.success("Removed from watch list");
        }}
        aria-label={`Stop watching ${entry.label}`}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
