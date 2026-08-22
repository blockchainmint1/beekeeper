import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WalletPage } from "@/components/wallet/WalletPage";
import { fetchAdminOrders } from "@/lib/admin/orders.functions";
import { formatUsd } from "@/lib/topup/packages";

export const Route = createFileRoute("/admin/orders")({
  head: () => ({
    meta: [
      { title: "Order console — Beekeeper admin" },
      {
        name: "description",
        content:
          "Read-only treasury view of Beekeeper top-up and cash-out orders, mirrored from the payment partner.",
      },
      { property: "og:title", content: "Order console — Beekeeper admin" },
      { property: "og:description", content: "Internal order and fee-tier console for Beekeeper." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminOrdersPage,
});

type Kind = "all" | "buy" | "sell";

function AdminOrdersPage() {
  const [key, setKey] = useState("");
  const [kind, setKind] = useState<Kind>("all");

  const load = useMutation({
    mutationFn: (k: Kind) =>
      fetchAdminOrders({ data: { key, kind: k === "all" ? undefined : k } }),
  });
  const view = load.data;

  return (
    <WalletPage title="Order console" subtitle="Top-ups and cash-outs, mirrored from the partner">
      <div className="space-y-5">
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Admin key
          </div>
          <p className="text-sm text-muted-foreground">
            Paste the admin console key. Nothing is stored on this device — the key is sent with each
            request and checked server-side.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              load.mutate(kind);
            }}
          >
            <Input
              type="password"
              value={key}
              autoComplete="off"
              placeholder="Admin console key"
              onChange={(e) => setKey(e.target.value)}
            />
            <Button type="submit" disabled={key.length < 8 || load.isPending}>
              {load.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open"}
            </Button>
          </form>
          {load.error && (
            <p className="text-[12px] text-destructive">
              {load.error instanceof Error ? load.error.message : "Couldn't load orders."}
            </p>
          )}
        </Card>

        {view && (
          <>
            <Card className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Pricing</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => load.mutate(kind)}
                  disabled={load.isPending}
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                Standard service fee:{" "}
                <span className="font-semibold text-foreground">
                  {(view.standardFeeBps / 100).toFixed(2)}%
                </span>
              </div>
              {view.feeOverrides.length > 0 ? (
                <ul className="space-y-1 text-[12px]">
                  {view.feeOverrides.map((o) => (
                    <li key={o.accountRef} className="flex justify-between gap-3">
                      <span className="break-all font-mono text-[11px] text-muted-foreground">
                        {o.accountRef}
                      </span>
                      <span className="font-semibold">{(o.bps / 100).toFixed(2)}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  No discount tiers configured. Discounts live with the payment partner, or locally in
                  the fee-override map.
                </p>
              )}
            </Card>

            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "buy", "sell"] as Kind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      setKind(k);
                      load.mutate(k);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
                      kind === k ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/60"
                    }`}
                  >
                    {k === "all" ? "All orders" : k === "buy" ? "Top-ups" : "Cash-outs"}
                  </button>
                ))}
              </div>

              {view.note && <p className="text-[12px] text-muted-foreground">{view.note}</p>}

              {view.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders to show.</p>
              ) : (
                <div className="space-y-2">
                  {view.orders.map((o) => (
                    <div key={o.id} className="rounded-xl border p-3 text-[12px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold capitalize">
                          {o.kind} · {o.asset}
                          {o.chain ? ` on ${o.chain.toUpperCase()}` : ""}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                          {o.status}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
                        <span>{formatUsd(o.usd)}</span>
                        {o.feeUsd !== null && <span>fee {formatUsd(o.feeUsd)}</span>}
                        {o.netUsd !== null && <span>net {formatUsd(o.netUsd)}</span>}
                        {o.bankMask && <span>bank ••••{o.bankMask}</span>}
                        {o.createdAt && <span>{new Date(o.createdAt).toLocaleString()}</span>}
                      </div>
                      <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                        {o.reference ? `${o.reference} · ` : ""}
                        {o.id}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </WalletPage>
  );
}
