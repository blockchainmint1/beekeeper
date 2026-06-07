import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { OnboardScreen } from "@/components/wallet/OnboardScreen";
import { UnlockScreen } from "@/components/wallet/UnlockScreen";
import { Wallet } from "@/components/wallet/Wallet";
import { getCachedMnemonic, hasVault } from "@/lib/wallet/seed";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tri-Chain Wallet — TXC · ISK · ETH" },
      {
        name: "description",
        content:
          "Non-custodial browser wallet for TEXITcoin, Iskander Coin, and Ethereum from a single BIP39 seed. Your keys never leave this device.",
      },
      { property: "og:title", content: "Tri-Chain Wallet" },
      {
        property: "og:description",
        content:
          "One recovery phrase for TXC, ISK, and ETH. Non-custodial and browser-based.",
      },
    ],
  }),
  component: Index,
  ssr: false,
});

type Stage = "loading" | "onboard" | "unlock" | "wallet";

function Index() {
  const [stage, setStage] = useState<Stage>("loading");

  useEffect(() => {
    if (!hasVault()) {
      setStage("onboard");
    } else if (getCachedMnemonic()) {
      setStage("wallet");
    } else {
      setStage("unlock");
    }
  }, []);

  return (
    <>
      <Toaster position="top-center" richColors />
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
