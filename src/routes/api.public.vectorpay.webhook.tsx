import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookSignature } from "@/lib/vectorpay/client.server";

// VectorPay order lifecycle callbacks (debit submitted / returned / settled /
// crypto delivered). Signature-verified; we only log for now, since VectorPay
// remains the system of record and the wallet reads status from them.
export const Route = createFileRoute("/api/public/vectorpay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const sig = request.headers.get("x-vectorpay-signature");
        if (!verifyWebhookSignature(body, sig)) {
          return new Response("Invalid signature", { status: 401 });
        }
        let event: { type?: string; order?: { id?: string; status?: string; external_id?: string } };
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        console.info(
          `[vectorpay] webhook ${event.type ?? "unknown"} order=${event.order?.id ?? "?"} ` +
            `external=${event.order?.external_id ?? "?"} status=${event.order?.status ?? "?"}`,
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
