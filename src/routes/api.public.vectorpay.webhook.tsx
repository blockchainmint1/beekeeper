import { createFileRoute } from "@tanstack/react-router";

// VectorPay order lifecycle callbacks.
// Signature-verified; we log and ack immediately. In production this should
// persist events to a durable store (Lovable Cloud / Supabase table) for replay
// and order-status mirroring. The in-memory seen-set prevents duplicate
// processing within a single deployment.
const seen = new Set<string>();

export const Route = createFileRoute("/api/public/vectorpay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const sig = request.headers.get("x-vectorpay-signature");
        const { verifyWebhookSignature, parseWebhookEvent } = await import("@/lib/vectorpay/client.server");
        if (!verifyWebhookSignature(body, sig)) {
          return new Response("Invalid signature", { status: 401 });
        }
        const event = parseWebhookEvent(body);
        if (!event) {
          return new Response("Bad payload", { status: 400 });
        }

        // Idempotency: ignore duplicate event_ids within this deployment.
        if (event.event_id) {
          if (seen.has(event.event_id)) {
            return Response.json({ ok: true, duplicate: true });
          }
          seen.add(event.event_id);
          // Bound memory usage in long-running dev; production should use KV/DB.
          if (seen.size > 10000) {
            const first = seen.values().next().value as string;
            seen.delete(first);
          }
        }

        const order = event.order;
        console.info(
          `[vectorpay] webhook event=${event.type} event_id=${event.event_id ?? "?"} ` +
            `order=${order?.id ?? "?"} external=${order?.externalId ?? "?"} ` +
            `status=${order?.status ?? "?"} reference=${order?.reference ?? "?"}`,
        );

        // TODO: persist to orders table when Lovable Cloud table exists.
        // await persistWebhookEvent(event);

        return Response.json({ ok: true });
      },
    },
  },
});
