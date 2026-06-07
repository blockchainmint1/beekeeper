import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, Copy, History } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ChainConfig, UtxoChain, EvmChain } from "@/lib/chains";
import { esplora, addressBalanceSats, satsToCoin, deriveUtxoAccount } from "@/lib/wallet/utxo";
import { deriveEvmAccount, evmBalance, formatEvm } from "@/lib/wallet/evm";
import { erc20Balance, formatToken } from "@/lib/wallet/erc20";
import { fetchAllPrices, priceForChain, priceForCoingeckoId, formatUsd } from "@/lib/wallet/price";
import type { Address } from "viem";

export function BalanceCard({
  chain,
  mnemonic,
  onSend,
  onReceive,
  onHistory,
  onSendToken,
}: {
  chain: ChainConfig;
  mnemonic: string;
  onSend: () => void;
  onReceive: () => void;
  onHistory: () => void;
  onSendToken?: (tokenSymbol: string) => void;
}) {
  const accountQuery = useQuery({
    queryKey: ["account", chain.id],
    queryFn: async () => {
      if (chain.kind === "utxo") {
        return { kind: "utxo" as const, account: await deriveUtxoAccount(mnemonic, chain, 0, chain.defaultAddressType) };
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

  const evmChain = chain.kind === "evm" ? (chain as EvmChain) : null;
  const evmAddress = (accountQuery.data?.kind === "evm" ? accountQuery.data.account.address : null) as Address | null;
  const tokensQuery = useQuery({
    queryKey: ["tokens", chain.id, evmAddress],
    enabled: !!evmChain && !!evmAddress && (evmChain?.tokens.length ?? 0) > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!evmChain || !evmAddress) return [];
      const results = await Promise.allSettled(
        evmChain.tokens.map((t) => erc20Balance(evmChain, t, evmAddress)),
      );
      return evmChain.tokens.map((t, i) => ({
        token: t,
        raw: results[i].status === "fulfilled" ? (results[i] as PromiseFulfilledResult<bigint>).value : 0n,
      }));
    },
  });

  const priceQuery = useQuery({
    queryKey: ["prices"],
    queryFn: fetchAllPrices,
    refetchInterval: 90_000,
    staleTime: 60_000,
  });

  const address = accountQuery.data?.account.address ?? "";
  const usdPrice = priceQuery.data ? priceForChain(priceQuery.data, chain) : null;

  let nativeAmount = 0;
  if (balQuery.data?.kind === "utxo") nativeAmount = balQuery.data.total / 10 ** chain.decimals;
  if (balQuery.data?.kind === "evm") nativeAmount = Number(balQuery.data.wei) / 1e18;
  const nativeUsd = usdPrice != null ? nativeAmount * usdPrice : null;

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
          {nativeUsd != null && (
            <p className="mt-1 text-xs text-muted-foreground">≈ {formatUsd(nativeUsd)}</p>
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

        {evmChain && (tokensQuery.data?.length ?? 0) > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tokens</p>
            {tokensQuery.data!.map(({ token, raw }) => {
              const human = Number(raw) / 10 ** token.decimals;
              const tokUsd = priceQuery.data ? priceForCoingeckoId(priceQuery.data, token.coingeckoId) : null;
              const subUsd = tokUsd != null ? human * tokUsd : null;
              return (
                <button
                  key={token.symbol}
                  onClick={() => onSendToken?.(token.symbol)}
                  disabled={!onSendToken}
                  className="flex w-full items-center justify-between gap-2 rounded-md border bg-card/60 px-2 py-1.5 text-xs transition hover:bg-muted/40 disabled:cursor-default"
                >
                  <span className="font-medium">{token.symbol}</span>
                  <span className="text-right">
                    <span className="tabular-nums">{formatToken(raw, token.decimals, 4)}</span>
                    {subUsd != null && <span className="ml-1.5 text-muted-foreground">· {formatUsd(subUsd)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onReceive} disabled={!address}>
            <ArrowDownToLine className="mr-1.5 h-4 w-4" /> Receive
          </Button>
          <Button className="flex-1" onClick={onSend} disabled={!address}>
            <ArrowUpFromLine className="mr-1.5 h-4 w-4" /> Send
          </Button>
          <Button variant="outline" size="icon" onClick={onHistory} disabled={!address} title="History">
            <History className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}