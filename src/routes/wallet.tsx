import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Toaster, toast } from "sonner";
import { OnboardScreen } from "@/components/wallet/OnboardScreen";
import { UnlockScreen } from "@/components/wallet/UnlockScreen";
import { WalletHeader } from "@/components/wallet/WalletHeader";
import { WalletSessionProvider } from "@/components/wallet/session";
import { clearCachedMnemonic, getCachedMnemonic, hasVault } from "@/lib/wallet/seed";
import { useIdleLock } from "@/lib/wallet/security";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Beekeeper Wallet — Full Control" },
      {
        name: "description",
        content:
          "Full Beekeeper wallet: every chain, every token, every key. Non-custodial.",
      },
      { property: "og:title", content: "Beekeeper Wallet — Full Control" },
      {
        property: "og:description",
        content: "Every chain, every token, every key. Non-custodial by design.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WalletLayout,
  ssr: false,
});

type Stage = "loading" | "onboard" | "unlock" | "wallet";

function WalletLayout() {
  const [stage, setStage] = useState<Stage>("loading");
  const [mnemonic, setMnemonic] = useState("");

  useEffect(() => {
    if (!hasVault()) return setStage("onboard");
    const cached = getCachedMnemonic();
    if (cached) {
      setMnemonic(cached);
      setStage("wallet");
    } else {
      setStage("unlock");
    }
  }, []);

  const enter = useCallback(() => {
    setMnemonic(getCachedMnemonic() ?? "");
    setStage("wallet");
  }, []);

  const lock = useCallback(() => {
    clearCachedMnemonic();
    setMnemonic("");
    setStage(hasVault() ? "unlock" : "onboard");
  }, []);

  const idleLock = useCallback(() => {
    clearCachedMnemonic();
    setMnemonic("");
    toast.message("Wallet locked", { description: "Auto-locked after idle." });
    setStage(hasVault() ? "unlock" : "onboard");
  }, []);
  useIdleLock(idleLock);

  return (
    <>
      <Toaster position="top-center" richColors />

      {stage !== "wallet" && (
        <div className="mx-auto max-w-[480px] px-5 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Back to My Funds
          </Link>
        </div>
      )}

      {stage === "loading" && (
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {stage === "onboard" && <OnboardScreen onReady={enter} />}
      {stage === "unlock" && (
        <UnlockScreen onUnlocked={enter} onReset={() => setStage("onboard")} />
      )}

      {stage === "wallet" && mnemonic && (
        <WalletSessionProvider value={{ mnemonic, lock }}>
          <div className="min-h-screen">
            <WalletHeader mnemonic={mnemonic} onLock={lock} />
            <Outlet />
          </div>
        </WalletSessionProvider>
      )}
    </>
  );
}
