// Same-origin JSON-RPC proxy to the Zero Chill (ZCU) node.
//
// The node lives behind HTTP basic auth, so its URL and credentials must never
// reach the browser. viem's http() transport targets this route exactly like
// any other public EVM RPC. A method allowlist keeps the endpoint from being
// turned into a general-purpose node console.

import { env } from "@/lib/server-env";
import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBalance",
  "eth_getCode",
  "eth_getTransactionCount",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_sendRawTransaction",
  "eth_getLogs",
  "net_version",
  "web3_clientVersion",
]);

interface JsonRpcCall {
  jsonrpc?: string;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

export const Route = createFileRoute("/api/public/rpc/zcu")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = env("ZCU_RPC_URL");
        if (!url) return new Response("ZCU RPC not configured", { status: 503 });

        let body: JsonRpcCall | JsonRpcCall[];
        try {
          body = (await request.json()) as JsonRpcCall | JsonRpcCall[];
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const calls = Array.isArray(body) ? body : [body];
        if (calls.length === 0 || calls.length > 25) {
          return new Response("Batch too large", { status: 413 });
        }

        for (const c of calls) {
          const method = typeof c?.method === "string" ? c.method : "";
          if (!ALLOWED_METHODS.has(method)) {
            return Response.json(
              Array.isArray(body)
                ? calls.map((x) => ({
                    jsonrpc: "2.0",
                    id: x?.id ?? null,
                    error: { code: -32601, message: `Method not allowed via proxy: ${method}` },
                  }))
                : {
                    jsonrpc: "2.0",
                    id: c?.id ?? null,
                    error: { code: -32601, message: `Method not allowed via proxy: ${method}` },
                  },
            );
          }
        }

        const headers: Record<string, string> = { "content-type": "application/json" };
        const user = env("ZCU_RPC_USER");
        const pass = env("ZCU_RPC_PASS");
        if (user && pass) {
          headers["authorization"] = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
        }

        const upstream = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const text = await upstream.text();
        return new Response(text, {
          status: upstream.status,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
