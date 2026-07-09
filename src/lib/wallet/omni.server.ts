// Server-only helper to call the TEXITcoin (Omni-enabled) JSON-RPC.
// Reads credentials from environment at call time so they never ship to the client.
import process from "node:process";

export interface RpcError {
  code: number;
  message: string;
}

export class TxcRpcError extends Error {
  code: number;
  constructor(err: RpcError) {
    super(err.message);
    this.code = err.code;
    this.name = "TxcRpcError";
  }
}

function getRpcConfig() {
  const url = process.env.TXC_RPC_ADDRESS;
  const user = process.env.TXC_RPC_USER;
  const pass = process.env.TXC_RPC_PASSWORD;
  if (!url || !user || !pass) {
    throw new Error("TXC RPC is not configured");
  }
  return { url, user, pass };
}

export async function rpcCall<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const { url, user, pass } = getRpcConfig();
  const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify({ jsonrpc: "1.0", id: "wallet", method, params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TXC RPC HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { result?: T; error?: RpcError | null };
  if (json.error) throw new TxcRpcError(json.error);
  return json.result as T;
}