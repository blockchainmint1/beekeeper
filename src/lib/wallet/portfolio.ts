// Shared portfolio total so the sticky header and the wallet pages agree on
// one number and share one query cache entry.
import { useQuery } from "@tanstack/react-query";
import { CHAIN_LIST, type ChainConfig, type EvmChain, type UtxoChain } from "@/lib/chains";
import { fetchAllPrices, priceForChain } from "@/lib/wallet/price";
import { scanUtxoHd } from "@/lib/wallet/utxo";
import { scanEvmHd } from "@/lib/wallet/evm-sweep";
import { tronBalance } from "@/lib/wallet/tron";
import { solanaBalance } from "@/lib/wallet/solana";
import { deriveTronAccount } from "@/lib/wallet/tron";
import { deriveSolanaAccount } from "@/lib/wallet/solana";
import { getScanGap, useScanGap } from "@/lib/wallet/scan-prefs";
import { scanCeiling, bumpWatermark } from "@/lib/wallet/hd-watermark";
import { useVisibleChainIds } from "@/lib/wallet/visible-chains";

export function usePrices() {
  return useQuery({
    queryKey: ["prices"],
    queryFn: fetchAllPrices,
    refetchInterval: 90_000,
    staleTime: 60_000,
  });
}

/** Spot price of a single chain's native asset, or null while loading. */
export function useChainPrice(chain: ChainConfig | undefined) {
  const prices = usePrices();
  if (!chain || !prices.data) return null;
  return priceForChain(prices.data, chain);
}

async function chainUsd(chain: ChainConfig, mnemonic: string, price: number): Promise<number> {
  const gap = getScanGap();
  if (chain.kind === "utxo") {
    const scan = await scanUtxoHd(mnemonic, chain as UtxoChain, { gapLimit: gap, minIndex: gap });
    if (scan.highestUsedIndex >= 0) bumpWatermark(chain.id, scan.highestUsedIndex);
    return (scan.totalSats / 10 ** chain.decimals) * price;
  }
  if (chain.kind === "evm") {
    const count = scanCeiling(chain.id, gap, 20, "evm");
    const scan = await scanEvmHd(mnemonic, chain as EvmChain, { count, includeTokens: false });
    if (scan.highestUsedIndex >= 0) bumpWatermark(chain.id, scan.highestUsedIndex, "evm");
    return (Number(scan.totalNativeWei) / 1e18) * price;
  }
  if (chain.kind === "tron") {
    const acct = deriveTronAccount(mnemonic, chain, 0);
    const sun = await tronBalance(chain, acct.address);
    return (Number(sun) / 10 ** chain.decimals) * price;
  }
  const acct = deriveSolanaAccount(mnemonic, chain, 0);
  const lam = await solanaBalance(chain, acct.address);
  return (Number(lam) / 10 ** chain.decimals) * price;
}

/** Total USD across every visible chain's derived addresses. */
export function usePortfolioTotal(mnemonic: string) {
  const prices = usePrices();
  const visibleIds = useVisibleChainIds();
  const scanGap = useScanGap();

  return useQuery({
    queryKey: ["portfolio-total", visibleIds.join(","), scanGap],
    enabled: !!mnemonic && !!prices.data,
    refetchInterval: 60_000,
    queryFn: async () => {
      let total = 0;
      await Promise.all(
        CHAIN_LIST.filter((c) => visibleIds.includes(c.id)).map(async (c) => {
          const price = prices.data ? priceForChain(prices.data, c) : null;
          if (!price) return;
          try {
            total += await chainUsd(c, mnemonic, price);
          } catch {
            /* one bad chain shouldn't zero the total */
          }
        }),
      );
      return total;
    },
  });
}
