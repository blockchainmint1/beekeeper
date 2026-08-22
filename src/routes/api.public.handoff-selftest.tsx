import { createFileRoute } from "@tanstack/react-router";

// Temporary diagnostic: confirms the VectorPay handoff is reachable and signed
// correctly. Safe to delete.
export const Route = createFileRoute("/api/public/handoff-selftest")({
  server: {
    handlers: {
      GET: async () => {
        const { handoffConfigured, postOrder } = await import("@/lib/handoff/handoff.server");
        if (!handoffConfigured()) {
          return Response.json({ configured: false }, { status: 200 });
        }
        const result = await postOrder({
          side: "buy",
          reference: `BK-SELFTEST-${Date.now().toString(36).toUpperCase()}`,
          account_ref: "selftest@honest.money",
          customer_name: "Beekeeper Selftest",
          customer_email: "selftest@honest.money",
          asset: "USDC",
          chain: "base",
          usd_amount: "25.00",
        });
        return Response.json({ configured: true, ...result });
      },
    },
  },
});
