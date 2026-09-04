import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { WalletPage } from "@/components/wallet/WalletPage";
import { HandoffWizard } from "@/components/handoff/HandoffWizard";
import { useAdminFeatureStatus } from "@/lib/admin/use-admin-features";
import { Loader2 } from "lucide-react";

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
  const navigate = useNavigate();
  const { status, isLoading } = useAdminFeatureStatus();

  useEffect(() => {
    if (!isLoading && status?.cashoutDisabled) {
      navigate({ to: "/wallet" });
    }
  }, [isLoading, status, navigate]);

  if (isLoading || status?.cashoutDisabled) {
    return (
      <WalletPage title="Cash Out" subtitle="Sell crypto and get dollars in your bank">
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </WalletPage>
    );
  }

  return (
    <WalletPage title="Cash Out" subtitle="Sell crypto and get dollars in your bank">
      <HandoffWizard side="sell" />
    </WalletPage>
  );
}

