import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Download, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WalletPage } from "@/components/wallet/WalletPage";
import { fetchAdminOrders, refreshAdminOrder } from "@/lib/admin/orders.functions";
import { formatUsd } from "@/lib/handoff/orders";
import type { VectorPayOrder } from "@/lib/vectorpay/client.server";

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
  const [status, setStatus] = useState("");
  const [accountRef, setAccountRef] = useState("");
  const [detail, setDetail] = useState<VectorPayOrder | null>(null);

  const load = useMutation({
    mutationFn: (k: Kind) =>
      fetchAdminOrders({
        data: {
          key,
          kind: k === "all" ? undefined : k,
          status: status || undefined,
          accountRef: accountRef || undefined,
        },
      }),
  });
  const view = load.data;

  const refresh = useMutation({
    mutationFn: (partnerOrderId: string) =>
      refreshAdminOrder({ data: { key, partnerOrderId } }),
  });

  const csv = useMemo(() => {
    if (!view?.orders.length) return "";
    const rows = view.orders.map((o) => ({
      id: o.id,
      reference: o.reference ?? "",
      external_id: o.externalId ?? "",
      kind: o.kind,
      status: o.status,
      asset: o.asset,
      chain: o.chain ?? "",
      usd: o.usd,
      fee_usd: o.feeUsd ?? "",
      net_usd: o.netUsd ?? "",
      destination_address: o.destinationAddress ?? "",
      deposit_address: o.depositAddress ?? "",
      txid: o.txid ?? "",
      bank_mask: o.bankMask ?? "",
      created_at: o.createdAt ?? "",
      updated_at: o.updatedAt ?? "",
    }));
    const headers = Object.keys(rows[0]).join(",");
    const body = rows
      .map((r) =>
        Object.values(r)
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    return `${headers}\n${body}`;
  }, [view?.orders]);

  const downloadCsv = () => {
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beekeeper-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Status filter (e.g. settled)"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="text-sm"
                />
                <Input
                  placeholder="Account ref"
                  value={accountRef}
                  onChange={(e) => setAccountRef(e.target.value)}
                  className="text-sm"
                />
                <Button
                  variant="secondary"
                  size="default"
                  onClick={() => load.mutate(kind)}
                  disabled={load.isPending}
                >
                  Filter
                </Button>
              </div>

              {view.note && <p className="text-[12px] text-muted-foreground">{view.note}</p>}

              {view.orders.length > 0 && (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={downloadCsv}>
                    <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
                  </Button>
                </div>
              )}

              {view.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders to show.</p>
              ) : (
                <div className="space-y-2">
                  {view.orders.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setDetail(o)}
                      className="w-full rounded-xl border p-3 text-left text-[12px] transition hover:bg-muted/40"
                    >
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
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <Card className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 sm:rounded-b-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Order detail</div>
              <Button variant="ghost" size="icon" onClick={() => setDetail(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <dl className="mt-4 space-y-2 text-[12px]">
              <DetailRow label="ID" value={detail.id} />
              <DetailRow label="Reference" value={detail.reference} />
              <DetailRow label="External ID" value={detail.externalId} />
              <DetailRow label="Kind" value={detail.kind} />
              <DetailRow label="Status" value={detail.status} />
              <DetailRow label="Asset" value={`${detail.asset}${detail.chain ? ` on ${detail.chain.toUpperCase()}` : ""}`} />
              <DetailRow label="USD" value={formatUsd(detail.usd)} />
              <DetailRow label="Fee" value={detail.feeUsd !== null ? formatUsd(detail.feeUsd) : null} />
              <DetailRow label="Net" value={detail.netUsd !== null ? formatUsd(detail.netUsd) : null} />
              <DetailRow label="Crypto amount" value={detail.cryptoAmount} />
              <DetailRow label="Destination" value={detail.destinationAddress} />
              <DetailRow label="Deposit address" value={detail.depositAddress} />
              <DetailRow label="TxID" value={detail.txid} />
              <DetailRow label="Bank mask" value={detail.bankMask ? `••••${detail.bankMask}` : null} />
              <DetailRow label="Created" value={detail.createdAt ? new Date(detail.createdAt).toLocaleString() : null} />
              <DetailRow label="Updated" value={detail.updatedAt ? new Date(detail.updatedAt).toLocaleString() : null} />
            </dl>
            <div className="mt-5 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={refresh.isPending}
                onClick={async () => {
                  const r = await refresh.mutateAsync(detail.id);
                  if (r.order) setDetail(r.order);
                }}
              >
                {refresh.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                Sync status
              </Button>
            </div>
            {refresh.error && (
              <p className="mt-2 text-[12px] text-destructive">
                {refresh.error instanceof Error ? refresh.error.message : "Sync failed."}
              </p>
            )}
          </Card>
        </div>
      )}
    </WalletPage>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-[11px]">{value}</dd>
    </div>
  );
}
