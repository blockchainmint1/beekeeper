import { createFileRoute } from "@tanstack/react-router";
import { WalletPage } from "@/components/wallet/WalletPage";
import { HandoffWizard } from "@/components/handoff/HandoffWizard";

export const Route = createFileRoute("/wallet/topup")({
  head: () => ({
    meta: [
      { title: "Top Up your wallet — Beekeeper" },
      {
        name: "description",
        content:
          "Start a top-up order in Beekeeper and finish with our licensed partner. Crypto is delivered straight to your self-custodied wallet.",
      },
      { property: "og:title", content: "Top Up your wallet — Beekeeper" },
      {
        property: "og:description",
        content: "Start an order, finish with our partner, and fund your self-custodied Beekeeper wallet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TopUpPage,
});

function TopUpPage() {
  return (
    <WalletPage title="Top Up" subtitle="Add dollars, get crypto in your own wallet">
      <HandoffWizard side="buy" />
    </WalletPage>
  );
}
