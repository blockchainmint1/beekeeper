import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { DialogPageMode } from "@/components/ui/dialog";

/**
 * Full-page container for the wallet's flows. Replaces the old modal chrome:
 * a real back button, a real heading, and the flow body rendered inline via
 * the dialog page-mode shim.
 */
export function WalletPage({
  title,
  subtitle,
  children,
  onBack,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  const back = onBack ?? (() => router.history.back());

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-4">
      <button
        onClick={back}
        className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}

      <div className="mt-6">
        <DialogPageMode>{children}</DialogPageMode>
      </div>
    </div>
  );
}

/** Helper for pages that just want the "go back to the wallet home" action. */
export function useWalletBack() {
  const router = useRouter();
  return () => {
    if (router.history.canGoBack()) router.history.back();
    else router.navigate({ to: "/wallet" });
  };
}
