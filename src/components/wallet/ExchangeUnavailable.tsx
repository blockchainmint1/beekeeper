import { Info } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown in place of the swap flow when there's no configured exchange
 * counterparty for a chain (or exchange features are disabled on this build).
 */
export function ExchangeUnavailable({ chainName }: { chainName?: string }) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Swapping {chainName ?? "this asset"} isn&apos;t available yet — no exchange
            counterparty is configured for this chain. You can still send, receive and
            hold it.
          </span>
        </p>
        <Button asChild className="w-full" size="lg">
          <Link to="/wallet">Back to wallet</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
