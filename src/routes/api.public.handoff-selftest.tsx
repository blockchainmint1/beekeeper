import { createFileRoute } from "@tanstack/react-router";

// TEMPORARY diagnostic: posts a tiny signed test order to VectorPay.
export const Route = createFileRoute("/api/public/handoff-selftest")({
  server: {
    handlers: {
      GET: async () => {
        const { postOrder, handoffConfigured } = await import("@/lib/handoff/handoff.server");
        if (!handoffConfigured()) {
          return Response.json({ configured: false });
        }
        const ref = `BK-SELFTEST-${Date.now().toString(36).toUpperCase()}`;
        const relay = await postOrder({
          side: "buy",
          reference: ref,
          account_ref: "selftest@honest.money",
          customer_name: "Self Test",
          customer_email: "selftest@honest.money",
          asset: "TSD",
          chain: "txc",
          usd_amount: "25.25",
          asset_amount: "25.00",
          rate: "1",
          fee_bps: 100,
          fee_usd: "0.25",
        });
        return Response.json({ configured: true, ref, ...relay });
      },
    },
  },
});
