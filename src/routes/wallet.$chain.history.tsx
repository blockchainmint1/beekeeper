import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getChain, type ChainId } from "@/lib/chains";
import { WalletPage } from "@/components/wallet/WalletPage";
import { HistoryDialog } from "@/components/wallet/HistoryDialog";
import { useChainAccount } from "@/components/wallet/session";

export const Route = createFileRoute("/wallet/$chain/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { chain: chainId } = Route.useParams();
  const navigate = useNavigate();
  const chain = getChain(chainId as ChainId);
  const account = useChainAccount(chain);

  return (
    <WalletPage title={`${chain.name} history`} subtitle="Confirmed and pending transactions">
      {account.data ? (
        <HistoryDialog
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
