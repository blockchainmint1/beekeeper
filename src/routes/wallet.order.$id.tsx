import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { WalletPage } from "@/components/wallet/WalletPage";
import { formatUsd, listHandoffOrders, type HandoffOrder } from "@/lib/handoff/orders";

export const Route = createFileRoute("/wallet/order/$id")({
  head: () => ({
    meta: [
      { title: "Order confirmation — Beekeeper" },
      {
        name: "description",
        content:
          "Your Beekeeper order reference, amounts and fee, plus what happens next while our licensed partner settles the payment.",
      },
      { property: "og:title", content: "Order confirmation — Beekeeper" },
      {
        property: "og:description",
        content: "Track a Beekeeper top-up or cash-out order after checkout with our licensed partner.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderConfirmationPage,
});

function OrderConfirmationPage() {
  const { id } = Route.useParams();
  const [order, setOrder] = useState<HandoffOrder | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setOrder(listHandoffOrders().find((o) => o.id === id) ?? null);
    setLoaded(true);
  }, [id]);

  const buy = order?.side !== "sell";

  return (
    <WalletPage
      title="Order confirmed"
      subtitle="Thanks — your order is with our licensed partner"
    >
      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Order {id}
          </div>
          <p className="text-sm text-muted-foreground">
            {buy
              ? "Once the bank payment clears, your crypto is delivered straight to your self-custodied Beekeeper address. Bank settlement usually takes 1–3 business days."
              : "Once your crypto arrives and the payout clears, dollars land in your linked bank account. Bank settlement usually takes 1–3 business days."}
          </p>

          <Separator />
          <Row label="Reference" value={id} mono />
          {order ? (
            <>
              <Row label={buy ? "Order" : "You sell"} value={formatUsd(order.usd)} />
              <Row label="Service fee (1%)" value={formatUsd(order.feeUsd)} />
              <Row
                label={buy ? "You receive" : "Estimated to your bank"}
                value={buy ? `${order.usd.toFixed(2)} ${order.asset}` : formatUsd(order.settlementUsd)}
                strong
              />
              {buy && <Row label="Total from your bank" value={formatUsd(order.settlementUsd)} />}
              {order.address && <Row label="Delivered to" value={order.address} mono />}
            </>
          ) : loaded ? (
            <p className="text-xs text-muted-foreground">
              We don't have the local details for this order on this device, but the reference above is all
              our support team needs.
            </p>
          ) : null}

          <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0 text-primary" /> You'll get an email from our partner as the
            order progresses.
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                void navigator.clipboard.writeText(id);
                toast.success("Reference copied");
              }}
            >
              <Copy className="mr-1 h-4 w-4" /> Copy reference
            </Button>
            <Button className="flex-1" asChild>
              <Link to="/wallet">Back to wallet</Link>
            </Button>
          </div>
        </Card>

        {order?.handoffUrl && (
          <a
            href={order.handoffUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
          >
            Reopen partner checkout <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </WalletPage>
  );
}

function Row({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`text-right ${mono ? "break-all font-mono text-xs" : ""} ${
          strong ? "font-semibold" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
