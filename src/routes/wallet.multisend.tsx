import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WalletPage } from "@/components/wallet/WalletPage";
import { MultiSendDialog } from "@/components/wallet/MultiSendDialog";

export const Route = createFileRoute("/wallet/multisend")({
  component: MultiSendPage,
});

function MultiSendPage() {
  const navigate = useNavigate();
  return (
    <WalletPage title="Multi-send" subtitle="Pay several addresses in one batch">
      <MultiSendDialog open onOpenChange={(v) => !v && navigate({ to: "/wallet" })} />
    </WalletPage>
  );
}
