import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { WalletPage } from "@/components/wallet/WalletPage";
import { SettingsDialog } from "@/components/wallet/SettingsDialog";
import { wipeVault } from "@/lib/wallet/seed";
import { useWalletSession } from "@/components/wallet/session";

export const Route = createFileRoute("/wallet/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { lock } = useWalletSession();
  return (
    <WalletPage title="Wallet settings" subtitle="Chains, security, and Nectar Pay">
      <SettingsDialog
        open
        onOpenChange={(v) => !v && navigate({ to: "/wallet" })}
        onWipe={() => {
          wipeVault();
          lock();
          toast.success("Wallet erased from this browser");
        }}
      />
    </WalletPage>
  );
}
