import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WalletPage } from "@/components/wallet/WalletPage";
import { SignDialog } from "@/components/wallet/SignDialog";

export const Route = createFileRoute("/wallet/sign")({
  component: SignPage,
});

function SignPage() {
  const navigate = useNavigate();
  return (
    <WalletPage title="Sign &amp; verify" subtitle="Prove you control an address">
      <SignDialog open onOpenChange={(v) => !v && navigate({ to: "/wallet" })} />
    </WalletPage>
  );
}
