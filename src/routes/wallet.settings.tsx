import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell, BookUser, ChevronRight, Key, KeyRound, Layers, Link2, Lock, PenLine,
  QrCode, Share2, ShieldCheck, Trash2, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletPage } from "@/components/wallet/WalletPage";
import { SecurityCheckupCard } from "@/components/wallet/SecurityCheckupCard";
import { DeepRescanCard } from "@/components/wallet/DeepRescanCard";
import { FeaturesCard } from "@/components/wallet/FeaturesCard";
import { CustomTokensCard } from "@/components/wallet/CustomTokensCard";
import { UpdateCheckCard } from "@/components/wallet/UpdateCheckCard";
import { TsdCashoutKeyCard } from "@/components/wallet/TsdCashoutKeyCard";
import { YourWalletsSection } from "@/components/wallet/YourWalletsSection";
import { useExchangeFeaturesAllowed } from "@/lib/native/capabilities";
import {
  SecurityPanel, WalletsPanel, AlertsPanel, NectarPanel,
  PasswordPanel, RevealPanel, XpubPanel, DangerPanel,
} from "@/components/wallet/SettingsDialog";
import { wipeVault } from "@/lib/wallet/seed";
import { wipeSeedRegistry } from "@/lib/wallet/seed-accounts";
import { useWalletSession } from "@/components/wallet/session";

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

        <SettingsCard
          icon={Wallet}
          title="Your wallets"
          description="Each wallet is a separate seed with its own chains, keys and contacts. One password unlocks them all."
        >
          <YourWalletsSection />
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

        <CustomTokensCard />

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

        <Link to="/wallet/sign" className="block">
          <Card className="transition-colors hover:bg-accent/30">
            <CardContent className="flex items-center gap-3 py-4">
              <PenLine className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <div className="font-medium">Sign &amp; verify a message</div>
                <div className="text-xs text-muted-foreground">
                  Prove you control an address without spending anything.
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        <Link to="/wallet/$chain/qr-login" params={{ chain: "txc" }} search={{ q: undefined }} className="block">
          <Card className="transition-colors hover:bg-accent/30">
            <CardContent className="flex items-center gap-3 py-4">
              <QrCode className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <div className="font-medium">Sign in with a QR code</div>
                <div className="text-xs text-muted-foreground">
                  Scan a login QR from Nectar Pay or any site that accepts your wallet key.
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

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
