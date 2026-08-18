import { createFileRoute, notFound } from "@tanstack/react-router";
import { CHAIN_LIST, getChain, type ChainId } from "@/lib/chains";
import { WalletPage } from "@/components/wallet/WalletPage";
import { UtxoSwap } from "@/components/wallet/UtxoSwap";
import { ExchangeUnavailable } from "@/components/wallet/ExchangeUnavailable";
import { getUtxoSwapConfig } from "@/components/wallet/utxo-swap-config";

export const Route = createFileRoute("/wallet/$chain/swap")({
  head: () => ({ meta: [{ title: "Swap — Beekeeper Wallet" }] }),
  beforeLoad: ({ params }) => {
    if (!CHAIN_LIST.some((c) => c.id === params.chain)) throw notFound();
  },
  component: SwapPage,
});

function SwapPage() {
  const { chain: chainId } = Route.useParams();
  const chain = getChain(chainId as ChainId);
  const config = chain.kind === "utxo" ? getUtxoSwapConfig(chain.id) : null;

  return (
    <WalletPage
      title={`Swap ${chain.ticker}`}
      subtitle="Trade this asset for a stablecoin without leaving your wallet."
    >
      {chain.kind === "utxo" && config ? (
        <UtxoSwap chain={chain} config={config} />
      ) : (
        <ExchangeUnavailable chainName={chain.name} />
      )}
    </WalletPage>
  );
}
