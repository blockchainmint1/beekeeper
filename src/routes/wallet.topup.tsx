import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { WalletPage } from "@/components/wallet/WalletPage";
import { TopUpWizard } from "@/components/topup/TopUpWizard";
import { topUpStatus } from "@/lib/topup/plaid.functions";

export const Route = createFileRoute("/wallet/topup")({
  head: () => ({
    meta: [
      { title: "Top Up with your bank — Beekeeper" },
      {
        name: "description",
        content:
          "Buy crypto with a linked US bank account and have it delivered straight to your self-custodied Beekeeper wallet.",
      },
      { property: "og:title", content: "Top Up with your bank — Beekeeper" },
      {
        property: "og:description",
        content: "Link a bank account, pick a package, and fund your self-custodied Beekeeper wallet.",
      },
    ],
  }),
  component: TopUpPage,
});

function TopUpPage() {
  const status = useQuery({
    queryKey: ["topup-status"],
    queryFn: () => topUpStatus(),
    staleTime: 60_000,
  });

  return (
    <WalletPage title="Top Up" subtitle="Buy crypto with your bank account">
      {status.isPending ? (
        <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking bank top-up availability…
        </Card>
      ) : (
        <TopUpWizard available={Boolean(status.data?.available)} />
      )}
    </WalletPage>
  );
}
