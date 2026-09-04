import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { WalletPage } from "@/components/wallet/WalletPage";
import { HandoffWizard } from "@/components/handoff/HandoffWizard";
import { useAdminFeatureStatus } from "@/lib/admin/use-admin-features";
import { Loader2 } from "lucide-react";

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
  const navigate = useNavigate();
  const { status, isLoading } = useAdminFeatureStatus();

  useEffect(() => {
    if (!isLoading && status?.topupDisabled) {
      navigate({ to: "/wallet" });
    }
  }, [isLoading, status, navigate]);

  if (isLoading || status?.topupDisabled) {
    return (
      <WalletPage title="Top Up" subtitle="Add dollars, get crypto in your own wallet">
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </WalletPage>
    );
  }

  return (
    <WalletPage title="Top Up" subtitle="Add dollars, get crypto in your own wallet">
      <HandoffWizard side="buy" />
    </WalletPage>
  );
}

