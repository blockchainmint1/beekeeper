import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getChain, type ChainId } from "@/lib/chains";
import { WalletPage } from "@/components/wallet/WalletPage";
import { QrLoginDialog } from "@/components/wallet/QrLoginDialog";

export const Route = createFileRoute("/wallet/$chain/qr-login")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: QrLoginPage,
});

function QrLoginPage() {
  const { chain: chainId } = Route.useParams();
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const chain = getChain(chainId as ChainId);

  return (
    <WalletPage title="QR login" subtitle={`Sign in somewhere with your ${chain.ticker} key`}>
      <QrLoginDialog
        open
        onOpenChange={(v) => !v && navigate({ to: "/wallet" })}
        chain={chain}
        initialRaw={q}
      />
    </WalletPage>
  );
}
