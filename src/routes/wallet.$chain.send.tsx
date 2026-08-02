import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { getChain, type ChainId } from "@/lib/chains";
import { WalletPage } from "@/components/wallet/WalletPage";
import { SendDialog } from "@/components/wallet/SendDialog";
import { useChainAccount } from "@/components/wallet/session";

const searchSchema = z.object({
  to: fallback(z.string(), "").default(""),
  amount: fallback(z.string(), "").default(""),
  asset: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/wallet/$chain/send")({
  validateSearch: zodValidator(searchSchema),
  component: SendPage,
});

function SendPage() {
  const { chain: chainId } = Route.useParams();
  const { to, amount, asset } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const chain = getChain(chainId as ChainId);
  const account = useChainAccount(chain);

  return (
    <WalletPage title={`Send ${chain.ticker}`} subtitle={chain.name}>
      {account.data ? (
        <SendDialog
          open
          onOpenChange={(v) => !v && navigate({ to: "/wallet" })}
          chain={chain}
          account={account.data}
          initialTo={to || undefined}
          initialAmount={amount || undefined}
          initialTokenSymbol={asset || undefined}
          onSent={() => {
            qc.invalidateQueries({ queryKey: ["balance"] });
            qc.invalidateQueries({ queryKey: ["tokens"] });
            qc.invalidateQueries({ queryKey: ["history"] });
            qc.invalidateQueries({ queryKey: ["portfolio-total"] });
          }}
        />
      ) : (
        <Loading />
      )}
    </WalletPage>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
