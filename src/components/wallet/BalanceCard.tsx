import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ChainConfig, UtxoChain, EvmChain } from "@/lib/chains";
import { esplora, addressBalanceSats, satsToCoin, deriveUtxoAccount } from "@/lib/wallet/utxo";
import { deriveEvmAccount, evmBalance, formatEvm } from "@/lib/wallet/evm";

export function BalanceCard({
  chain,
  mnemonic,
  onSend,
  onReceive,
}: {
  chain: ChainConfig;
  mnemonic: string;
  onSend: () => void;
  onReceive: () => void;
}) {
  const accountQuery = useQuery({
    queryKey: ["account", chain.id],
    queryFn: async () => {
      if (chain.kind === "utxo") {
        return { kind: "utxo" as const, account: await deriveUtxoAccount(mnemonic, chain, 0, "segwit") };
      }
      return { kind: "evm" as const, account: deriveEvmAccount(mnemonic, chain, 0) };
    },
    staleTime: Infinity,
  });

  const balQuery = useQuery({
    queryKey: ["balance", chain.id, accountQuery.data?.account.address],
    enabled: !!accountQuery.data,
    refetchInterval: 30_000,
    queryFn: async () => {
      const a = accountQuery.data!;
      if (a.kind === "utxo") {
        const info = await esplora.addressInfo(chain as UtxoChain, a.account.address);
        return { kind: "utxo" as const, ...addressBalanceSats(info) };
      }
      const wei = await evmBalance(chain as EvmChain, a.account.address);
      return { kind: "evm" as const, wei };
    },
  });

  const address = accountQuery.data?.account.address ?? "";

  return (
    <Card className="overflow-hidden">
      <div
        className="h-1 w-full"
        style={{ background: chain.color }}
      />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-background"
                style={{ background: chain.color }}
              >
                {chain.ticker[0]}
              </span>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{chain.name}</p>
                <p className="text-sm font-semibold">{chain.ticker}</p>
              </div>
            </div>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {chain.kind}
          </span>
        </div>

        <div className="mt-4">
          {balQuery.isLoading || !balQuery.data ? (
            <div className="h-9 w-40 animate-pulse rounded bg-muted" />
          ) : balQuery.data.kind === "utxo" ? (
            <div>
              <p className="text-3xl font-bold tracking-tight">
                {satsToCoin(balQuery.data.total, chain.decimals)}{" "}
                <span className="text-base font-medium text-muted-foreground">{chain.ticker}</span>
              </p>
              {balQuery.data.unconfirmed !== 0 && (
                <p className="text-xs text-muted-foreground">
                  {satsToCoin(balQuery.data.unconfirmed, chain.decimals)} unconfirmed
                </p>
              )}
            </div>
          ) : (
            <p className="text-3xl font-bold tracking-tight">
              {formatEvm(balQuery.data.wei)}{" "}
              <span className="text-base font-medium text-muted-foreground">{chain.ticker}</span>
            </p>
          )}
        </div>

        {address && (
          <div className="mt-3 flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
            <span className="flex-1 truncate font-mono">{address}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(address);
                toast.success("Address copied");
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Copy address"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => window.open(chain.explorerAddr(address), "_blank")}
              className="text-muted-foreground hover:text-foreground"
              aria-label="View on explorer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onReceive} disabled={!address}>
            <ArrowDownToLine className="mr-1.5 h-4 w-4" /> Receive
          </Button>
          <Button className="flex-1" onClick={onSend} disabled={!address}>
            <ArrowUpFromLine className="mr-1.5 h-4 w-4" /> Send
          </Button>
        </div>
      </div>
    </Card>
  );
}