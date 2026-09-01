import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell, BookUser, ChevronRight, Key, Layers, Link2, Lock, Palette,
  Share2, ShieldCheck, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WalletPage } from "@/components/wallet/WalletPage";
import { SecurityCheckupCard } from "@/components/wallet/SecurityCheckupCard";
import { DeepRescanCard } from "@/components/wallet/DeepRescanCard";
import { FeaturesCard } from "@/components/wallet/FeaturesCard";
import { UpdateCheckCard } from "@/components/wallet/UpdateCheckCard";
import { TsdCashoutKeyCard } from "@/components/wallet/TsdCashoutKeyCard";
import { useExchangeFeaturesAllowed } from "@/lib/native/capabilities";
import {
  SecurityPanel, WalletsPanel, AlertsPanel, NectarPanel,
  PasswordPanel, RevealPanel, XpubPanel, DangerPanel,
} from "@/components/wallet/SettingsDialog";
import { wipeVault } from "@/lib/wallet/seed";
import { wipeSeedRegistry } from "@/lib/wallet/seed-accounts";
import { SeedsPanel } from "@/components/wallet/SeedsPanel";
import { KeyRound } from "lucide-react";
import { useWalletSession } from "@/components/wallet/session";
import { APP_VERSION } from "@/lib/version";

export const Route = createFileRoute("/wallet/settings")({
  head: () => ({
    meta: [
      { title: "Wallet settings — Beekeeper" },
      {
        name: "description",
        content:
          "Chains, security, alerts, keys, and your Nectar Pay merchant link — all stored on this device.",
      },
      { property: "og:title", content: "Wallet settings — Beekeeper" },
      {
        property: "og:description",
        content: "Manage chains, security, alerts, and keys in your Beekeeper wallet.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { lock } = useWalletSession();
  const exchangeAllowed = useExchangeFeaturesAllowed();

  return (
    <WalletPage title="Settings" subtitle="Everything here stays in this browser">
      <div className="space-y-5">
        <SecurityCheckupCard />

        <UpdateCheckCard />

        <SettingsCard icon={Palette} title="Appearance" description="Light, dark, or follow your system.">
          <ThemeToggle />
        </SettingsCard>

        <SettingsCard
          icon={KeyRound}
          title="Seeds"
          description="Store more than one recovery phrase and switch between them."
        >
          <SeedsPanel />
        </SettingsCard>

        <SettingsCard
          icon={Layers}
          title="Chains"
          description="Show, hide, and reorder the wallet cards. Every chain shares the same seed."
        >
          <WalletsPanel />
        </SettingsCard>

        <SettingsCard
          icon={ShieldCheck}
          title="Security"
          description="Auto-lock, biometric unlock, and anti-phishing safeguards."
        >
          <SecurityPanel />
        </SettingsCard>

        <FeaturesCard />

        {exchangeAllowed && <TsdCashoutKeyCard />}

        <DeepRescanCard />

        <SettingsCard
          icon={Bell}
          title="Alerts"
          description="In-app, email, and Telegram notifications for incoming payments."
        >
          <AlertsPanel />
        </SettingsCard>

        <SettingsCard
          icon={Link2}
          title="Nectar Pay"
          description="Link this vault to a merchant store so Nectar Pay can watch for payments."
        >
          <NectarPanel />
        </SettingsCard>

        <SettingsCard icon={Lock} title="Password" description="Re-encrypt the vault with a new password.">
          <PasswordPanel />
        </SettingsCard>

        <SettingsCard
          icon={Key}
          title="Private key"
          description="Export a per-chain private key or WIF. Handle with care."
        >
          <RevealPanel />
        </SettingsCard>

        <SettingsCard icon={Share2} title="Extended keys" description="Share an account xpub for watch-only tracking.">
          <XpubPanel />
        </SettingsCard>

        <Link to="/wallet/contacts" className="block">
          <Card className="transition-colors hover:bg-accent/30">
            <CardContent className="flex items-center gap-3 py-4">
              <BookUser className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <div className="font-medium">Address book</div>
                <div className="text-xs text-muted-foreground">
                  Save names for the addresses you send to most.
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Wallet info</CardTitle>
            <CardDescription>Build details for support requests.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Version</span>
              <span className="tabular">{APP_VERSION}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Key storage</span>
              <span>Encrypted vault, this device only</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Danger zone
            </CardTitle>
            <CardDescription>
              Removes the encrypted vault from this device. Make sure you still have your copper
              coin or recovery phrase — without it the wallet cannot be recovered.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DangerPanel
              onWipe={() => {
                wipeVault();
                wipeSeedRegistry();
                lock();
                toast.success("Wallet erased from this browser");
              }}
            />
          </CardContent>
        </Card>
      </div>
    </WalletPage>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
