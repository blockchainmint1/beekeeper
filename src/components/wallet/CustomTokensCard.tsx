/**
 * Add-your-own tokens — extra Omni properties on TEXITcoin-style chains and
 * extra ERC-20 contracts on the EVM chains. Purely a display/list preference;
 * balances are read with the wallet's existing scanners.
 */
import { useState } from "react";
import { Coins, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CHAIN_LIST, type ChainId, type EvmChain, type UtxoChain } from "@/lib/chains";
import {
  addCustomErc20, addCustomOmni, removeCustomErc20, removeCustomOmni,
  useCustomErc20, useCustomOmni,
} from "@/lib/wallet/custom-tokens";
import { isValidEvmAddress } from "@/lib/wallet/evm";

const omniChains = CHAIN_LIST.filter(
  (c): c is UtxoChain => c.kind === "utxo" && c.supportsOmni,
);
const evmChains = CHAIN_LIST.filter((c): c is EvmChain => c.kind === "evm");

export function CustomTokensCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5" /> Custom tokens
        </CardTitle>
        <CardDescription>
          Track an Omni property on TEXITcoin or an ERC-20 contract on Ethereum, Base, BSC, or
          Polygon. Balances appear on the wallet card for that chain.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <OmniSection />
        <Erc20Section />
      </CardContent>
    </Card>
  );
}

function OmniSection() {
  const [chainId, setChainId] = useState<ChainId>(omniChains[0]?.id ?? "txc");
  const [pid, setPid] = useState("");
  const list = useCustomOmni(chainId);

  function add() {
    const n = Number(pid.trim());
    if (!Number.isInteger(n) || n <= 0) {
      toast.error("Enter a whole Omni property id, e.g. 39");
      return;
    }
    addCustomOmni(chainId, n);
    setPid("");
    toast.success(`Omni #${n} added`);
  }

  if (omniChains.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        Omni properties
      </Label>
      <div className="flex gap-2">
        <Select value={chainId} onValueChange={(v) => setChainId(v as ChainId)}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {omniChains.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.ticker}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={pid}
          inputMode="numeric"
          placeholder="Property id (e.g. 41)"
          onChange={(e) => setPid(e.target.value)}
        />
        <Button onClick={add} size="icon" aria-label="Add Omni property">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <TokenChips
        items={list.map((n) => ({ key: String(n), label: `#${n}` }))}
        onRemove={(key) => removeCustomOmni(chainId, Number(key))}
        empty="No extra Omni properties yet."
      />
    </div>
  );
}

function Erc20Section() {
  const [chainId, setChainId] = useState<ChainId>(evmChains[0]?.id ?? "eth");
  const [address, setAddress] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState("18");
  const list = useCustomErc20(chainId);

  function add() {
    const addr = address.trim();
    if (!isValidEvmAddress(addr)) {
      toast.error("That doesn't look like a contract address");
      return;
    }
    const sym = symbol.trim().toUpperCase();
    if (!sym) {
      toast.error("Give the token a symbol");
      return;
    }
    const dec = Number(decimals);
    if (!Number.isInteger(dec) || dec < 0 || dec > 36) {
      toast.error("Decimals must be a whole number between 0 and 36");
      return;
    }
    addCustomErc20(chainId, {
      symbol: sym,
      name: sym,
      address: addr as `0x${string}`,
      decimals: dec,
    });
    setAddress("");
    setSymbol("");
    toast.success(`${sym} added`);
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        ERC-20 contracts
      </Label>
      <Select value={chainId} onValueChange={(v) => setChainId(v as ChainId)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {evmChains.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={address}
        placeholder="0x contract address"
        onChange={(e) => setAddress(e.target.value)}
        spellCheck={false}
      />
      <div className="flex gap-2">
        <Input
          value={symbol}
          placeholder="Symbol"
          onChange={(e) => setSymbol(e.target.value)}
          className="flex-1"
        />
        <Input
          value={decimals}
          inputMode="numeric"
          placeholder="Decimals"
          onChange={(e) => setDecimals(e.target.value)}
          className="w-24"
        />
        <Button onClick={add} size="icon" aria-label="Add token">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <TokenChips
        items={list.map((t) => ({ key: t.address, label: `${t.symbol} · ${t.address.slice(0, 6)}…${t.address.slice(-4)}` }))}
        onRemove={(key) => removeCustomErc20(chainId, key)}
        empty="No custom ERC-20 tokens on this chain yet."
      />
    </div>
  );
}

function TokenChips({
  items,
  onRemove,
  empty,
}: {
  items: { key: string; label: string }[];
  onRemove: (key: string) => void;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-[11px] text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span
          key={i.key}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]"
        >
          {i.label}
          <button
            type="button"
            onClick={() => onRemove(i.key)}
            aria-label={`Remove ${i.label}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
