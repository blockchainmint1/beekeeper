import { useQuery } from "@tanstack/react-query";
import type { ChainConfig, UtxoChain, EvmChain } from "@/lib/chains";
import { esplora, addressBalanceSats, deriveUtxoAccount } from "@/lib/wallet/utxo";
import { deriveEvmAccount, evmBalance } from "@/lib/wallet/evm";
import { deriveTronAccount, tronBalance } from "@/lib/wallet/tron";
import { deriveSolanaAccount, solanaBalance } from "@/lib/wallet/solana";
import { fetchAllPrices, priceForChain } from "@/lib/wallet/price";
import { MetalWalletCard } from "./MetalWalletCard";

export function MetalWalletCardConnected({
  chain,
  mnemonic,
  onClick,
}: {
  chain: ChainConfig;
  mnemonic: string;
  onClick?: () => void;
}) {
  const accountQuery = useQuery({
    queryKey: ["account", chain.id],
    queryFn: async () => {
      if (chain.kind === "utxo") {
        return { kind: "utxo" as const, account: await deriveUtxoAccount(mnemonic, chain, 0, chain.defaultAddressType) };
      }
      if (chain.kind === "evm") {
        return { kind: "evm" as const, account: deriveEvmAccount(mnemonic, chain, 0) };
      }
      if (chain.kind === "tron") {
        return { kind: "tron" as const, account: deriveTronAccount(mnemonic, chain, 0) };
      }
      return { kind: "solana" as const, account: deriveSolanaAccount(mnemonic, chain, 0) };
    },
    staleTime: Infinity,
    enabled: !!mnemonic,
  });

  const balQuery = useQuery({
    queryKey: ["balance", chain.id, accountQuery.data?.account.address],
    enabled: !!accountQuery.data,
    refetchInterval: 30_000,
    queryFn: async () => {
      const a = accountQuery.data!;
      if (a.kind === "utxo") {
        const info = await esplora.addressInfo(chain as UtxoChain, a.account.address);
        return addressBalanceSats(info).total / 10 ** chain.decimals;
      }
      if (a.kind === "evm") {
        const wei = await evmBalance(chain as EvmChain, a.account.address);
        return Number(wei) / 1e18;
      }
      if (a.kind === "tron") {
        const sun = await tronBalance(chain as never, a.account.address);
        return Number(sun) / 1_000_000;
      }
      const lamports = await solanaBalance(chain as never, a.account.address);
      return Number(lamports) / 1_000_000_000;
    },
  });

  const priceQuery = useQuery({
    queryKey: ["prices"],
    queryFn: fetchAllPrices,
    refetchInterval: 90_000,
    staleTime: 60_000,
  });

  const usdPrice = priceQuery.data ? priceForChain(priceQuery.data, chain) : null;
  const nativeAmount = balQuery.data ?? null;
  const usdValue = usdPrice != null && nativeAmount != null ? nativeAmount * usdPrice : null;

  return (
    <MetalWalletCard
      chain={chain}
      nativeAmount={nativeAmount}
      usdValue={usdValue}
      usdPrice={usdPrice}
      change24h={null}
      walletCount={1}
      onClick={onClick}
      loading={balQuery.isLoading}
    />
  );
}