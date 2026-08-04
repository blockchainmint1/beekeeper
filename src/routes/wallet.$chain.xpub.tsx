import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getChain, type ChainId } from "@/lib/chains";
import { WalletPage } from "@/components/wallet/WalletPage";
import { XpubDialog } from "@/components/wallet/XpubDialog";

export const Route = createFileRoute("/wallet/$chain/xpub")({
  component: XpubPage,
});

function XpubPage() {
  const { chain: chainId } = Route.useParams();
  const navigate = useNavigate();
  const chain = getChain(chainId as ChainId);

  return (
    <WalletPage title="Extended public key" subtitle={`${chain.name} account xpub`}>
      <XpubDialog
        open
        onOpenChange={(v) => !v && navigate({ to: "/wallet" })}
        chain={chain}
      />
    </WalletPage>
  );
}
