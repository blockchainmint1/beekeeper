// Same-origin JSON-RPC proxy to Alchemy. Keeps the API key on the server
// while letting viem's http() transport target this URL exactly like any
// other public EVM RPC. Only allows a safe read/broadcast method allowlist
// so the endpoint can't be turned into a general-purpose oracle.

import process from "node:process";
import { createFileRoute } from "@tanstack/react-router";

const ALCHEMY_NETWORK: Record<string, string> = {
  eth: "eth-mainnet",
  bsc: "bnb-mainnet",
  base: "base-mainnet",
  polygon: "polygon-mainnet",
  sol: "solana-mainnet",
};

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
  "alchemy_getTokenBalances",
  "alchemy_getTokenMetadata",
  "alchemy_getAssetTransfers",
]);

interface JsonRpcCall {
  jsonrpc?: string;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

function rejectMethod(id: unknown, method: string) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code: -32601, message: `Method not allowed via proxy: ${method}` },
  };
}

export const Route = createFileRoute("/api/public/rpc/alchemy/$chain")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const network = ALCHEMY_NETWORK[params.chain];
        if (!network) return new Response("Unknown chain", { status: 404 });
        const key = process.env.ALCHEMY_API;
        if (!key) {
          const keys = Object.keys(process.env ?? {}).sort().join(",");
          return new Response(`Alchemy not configured. env keys: ${keys}`, { status: 503 });
        }

        let body: JsonRpcCall | JsonRpcCall[];
        try {
          body = (await request.json()) as JsonRpcCall | JsonRpcCall[];
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const calls = Array.isArray(body) ? body : [body];
        for (const c of calls) {
          if (typeof c?.method !== "string" || !ALLOWED_METHODS.has(c.method)) {
            const rejects = calls.map((cc) => rejectMethod(cc?.id, String(cc?.method ?? "")));
            return new Response(JSON.stringify(Array.isArray(body) ? rejects : rejects[0]), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
        }

        const upstream = `https://${network}.g.alchemy.com/v2/${key}`;
        const res = await fetch(upstream, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        return new Response(text, {
          status: res.status,
          headers: { "content-type": res.headers.get("content-type") || "application/json" },
        });
      },
    },
  },
});
