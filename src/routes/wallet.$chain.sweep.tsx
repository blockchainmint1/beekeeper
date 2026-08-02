import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getChain, type ChainId, type EvmChain } from "@/lib/chains";
import { WalletPage } from "@/components/wallet/WalletPage";
import { EvmSweepDialog } from "@/components/wallet/EvmSweepDialog";
import { useWalletSession } from "@/components/wallet/session";

export const Route = createFileRoute("/wallet/$chain/sweep")({
  component: SweepPage,
});

function SweepPage() {
  const { chain: chainId } = Route.useParams();
  const navigate = useNavigate();
  const { mnemonic } = useWalletSession();
  const chain = getChain(chainId as ChainId);

  if (chain.kind !== "evm") {
    return (
      <WalletPage title="Scan &amp; sweep">
        <p className="text-sm text-muted-foreground">
          Sweeping is only available on EVM chains. {chain.name} uses UTXO consolidation instead.
        </p>
      </WalletPage>
    );
  }

  return (
    <WalletPage title="Scan &amp; sweep" subtitle={`Pull funds from derived ${chain.name} addresses`}>
      <EvmSweepDialog
        open
        onOpenChange={(v) => !v && navigate({ to: "/wallet" })}
        chain={chain as EvmChain}
        mnemonic={mnemonic}
      />
    </WalletPage>
  );
}
