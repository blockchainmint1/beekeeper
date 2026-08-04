import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getChain, type ChainId } from "@/lib/chains";
import { WalletPage } from "@/components/wallet/WalletPage";
import { ReceiveDialog } from "@/components/wallet/ReceiveDialog";
import { useChainAccount } from "@/components/wallet/session";

export const Route = createFileRoute("/wallet/$chain/receive")({
  component: ReceivePage,
});

function ReceivePage() {
  const { chain: chainId } = Route.useParams();
  const navigate = useNavigate();
  const chain = getChain(chainId as ChainId);
  const account = useChainAccount(chain);

  return (
    <WalletPage title={`Receive ${chain.ticker}`} subtitle={chain.name}>
      {account.data ? (
        <ReceiveDialog
          open
          onOpenChange={(v) => !v && navigate({ to: "/wallet" })}
          chain={chain}
          address={account.data.account.address}
        />
      ) : (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </WalletPage>
  );
}
