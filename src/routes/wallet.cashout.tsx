import { createFileRoute } from "@tanstack/react-router";
import { WalletPage } from "@/components/wallet/WalletPage";
import { HandoffWizard } from "@/components/handoff/HandoffWizard";

export const Route = createFileRoute("/wallet/cashout")({
  head: () => ({
    meta: [
      { title: "Cash Out to your bank — Beekeeper" },
      {
        name: "description",
        content:
          "Start a cash-out order in Beekeeper and finish with our licensed partner to get dollars in your bank account.",
      },
      { property: "og:title", content: "Cash Out to your bank — Beekeeper" },
      {
        property: "og:description",
        content: "Sell crypto from your self-custodied wallet and get dollars in 1–3 business days.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CashOutPage,
});

function CashOutPage() {
  return (
    <WalletPage title="Cash Out" subtitle="Sell crypto and get dollars in your bank">
      <HandoffWizard side="sell" />
    </WalletPage>
  );
}
