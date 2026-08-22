import { createFileRoute } from "@tanstack/react-router";
import { WalletPage } from "@/components/wallet/WalletPage";
import { TopUpWizard } from "@/components/topup/TopUpWizard";

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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TopUpPage,
});

function TopUpPage() {
  return (
    <WalletPage title="Top Up" subtitle="Buy crypto with your bank account">
      <TopUpWizard available />
    </WalletPage>
  );
}
