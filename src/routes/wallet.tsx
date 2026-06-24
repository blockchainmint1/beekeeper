import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Toaster } from "sonner";
import { OnboardScreen } from "@/components/wallet/OnboardScreen";
import { UnlockScreen } from "@/components/wallet/UnlockScreen";
import { Wallet } from "@/components/wallet/Wallet";
import { getCachedMnemonic, hasVault } from "@/lib/wallet/seed";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Beekeeper Wallet — Full Control" },
      {
        name: "description",
        content:
          "Full Beekeeper wallet: every chain, every token, every key. Non-custodial.",
      },
    ],
  }),
  component: WalletRoute,
  ssr: false,
});

type Stage = "loading" | "onboard" | "unlock" | "wallet";

function WalletRoute() {
  const [stage, setStage] = useState<Stage>("loading");

  useEffect(() => {
    if (!hasVault()) setStage("onboard");
    else if (getCachedMnemonic()) setStage("wallet");
    else setStage("unlock");
  }, []);

  return (
    <>
      <Toaster position="top-center" richColors />
      <div className="mx-auto max-w-[480px] px-5 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="w-3 h-3" /> Back to My Funds
        </Link>
      </div>
      {stage === "loading" && (
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {stage === "onboard" && <OnboardScreen onReady={() => setStage("wallet")} />}
      {stage === "unlock" && (
        <UnlockScreen
          onUnlocked={() => setStage("wallet")}
          onReset={() => setStage("onboard")}
        />
      )}
      {stage === "wallet" && (
        <Wallet
          onLocked={() => {
            setStage(hasVault() ? "unlock" : "onboard");
          }}
        />
      )}
    </>
  );
}
