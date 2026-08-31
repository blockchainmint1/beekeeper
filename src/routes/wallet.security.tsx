import { createFileRoute } from "@tanstack/react-router";
import { WalletPage } from "@/components/wallet/WalletPage";
import { SecurityCheckupCard } from "@/components/wallet/SecurityCheckupCard";
import { DeepRescanCard } from "@/components/wallet/DeepRescanCard";

export const Route = createFileRoute("/wallet/security")({
  head: () => ({
    meta: [
      { title: "Security checkup — Beekeeper" },
      {
        name: "description",
        content:
          "Check biometric unlock, auto-lock, and your Nectar Pay link, and run a deep rescan of every chain.",
      },
      { property: "og:title", content: "Security checkup — Beekeeper" },
      {
        property: "og:description",
        content: "Three things worth getting right, plus a deep rescan of every chain.",
      },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <WalletPage title="Security checkup" subtitle="Three things worth getting right">
      <div className="space-y-5">
        <SecurityCheckupCard />
        <DeepRescanCard />
      </div>
    </WalletPage>
  );
}
