import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { WalletPage } from "@/components/wallet/WalletPage";
import { CashOutWizard } from "@/components/cashout/CashOutWizard";
import { cashOutStatus } from "@/lib/payout/cashout.functions";

export const Route = createFileRoute("/wallet/cashout")({
  head: () => ({
    meta: [
      { title: "Cash Out to your bank — Beekeeper" },
      {
        name: "description",
        content:
          "Sell crypto from your self-custodied Beekeeper wallet and have dollars sent to your linked US bank account by ACH.",
      },
      { property: "og:title", content: "Cash Out to your bank — Beekeeper" },
      {
        property: "og:description",
        content: "Link a bank account, send your crypto, and get dollars in 1–3 business days.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CashOutPage,
});

function CashOutPage() {
  const status = useQuery({
    queryKey: ["cashout-status"],
    queryFn: () => cashOutStatus(),
    staleTime: 60_000,
  });

  return (
    <WalletPage title="Cash Out" subtitle="Sell crypto and get dollars in your bank">
      {status.isPending ? (
        <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking cash-out availability…
        </Card>
      ) : (
        <CashOutWizard
          available={Boolean(status.data?.available)}
          chains={status.data?.chains ?? []}
        />
      )}
    </WalletPage>
  );
}
