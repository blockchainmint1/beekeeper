import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { OnboardScreen } from "@/components/wallet/OnboardScreen";
import { UnlockScreen } from "@/components/wallet/UnlockScreen";
import { SimpleDashboard } from "@/components/wallet/SimpleDashboard";
import { Footer } from "@/components/Footer";
import { getCachedMnemonic, hasVault } from "@/lib/wallet/seed";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Beekeeper — Your money, your keys." },
      {
        name: "description",
        content:
          "Beekeeper is the simple, non-custodial wallet for small businesses. See your balance, your transactions, cash out to your bank.",
      },
      { property: "og:title", content: "Beekeeper — Your money, your keys." },
      {
        property: "og:description",
        content:
          "Simple, non-custodial money for small businesses. By Honest Money.",
      },
    ],
  }),
  component: Index,
  ssr: false,
});

type Stage = "loading" | "onboard" | "unlock" | "dashboard";

function Index() {
  const [stage, setStage] = useState<Stage>("loading");

  useEffect(() => {
    if (!hasVault()) setStage("onboard");
    else if (getCachedMnemonic()) setStage("dashboard");
    else setStage("unlock");
  }, []);

  return (
    <>
      <Toaster position="top-center" richColors />
      {stage === "loading" && (
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {stage === "onboard" && <OnboardScreen onReady={() => setStage("dashboard")} />}
      {stage === "unlock" && (
        <UnlockScreen
          onUnlocked={() => setStage("dashboard")}
          onReset={() => setStage("onboard")}
        />
      )}
      {stage === "dashboard" && (
        <SimpleDashboard
          onLocked={() => {
            setStage(hasVault() ? "unlock" : "onboard");
          }}
        />
      )}
    </>
  );
}
