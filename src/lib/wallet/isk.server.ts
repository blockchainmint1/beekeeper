// Server-only helper to call the Iskander (ISK) coin JSON-RPC.
// Reads credentials from environment at call time so they never ship to the client.

export interface IskRpcErrorShape {
  code: number;
  message: string;
}

export class IskRpcError extends Error {
  code: number;
  constructor(err: IskRpcErrorShape) {
    super(err.message);
    this.code = err.code;
    this.name = "IskRpcError";
  }
}

function getRpcConfig() {
  const url = process.env.ISK_RPC_URL;
  const user = process.env.ISK_RPC_USER;
  const pass = process.env.ISK_RPC_PASS;
  if (!url || !user || !pass) {
    throw new Error("ISK RPC is not configured");
  }
  return { url, user, pass };
}

export async function iskRpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const { url, user, pass } = getRpcConfig();
  const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify({ jsonrpc: "1.0", id: "wallet", method, params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ISK RPC HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { result?: T; error?: IskRpcErrorShape | null };
  if (json.error) throw new IskRpcError(json.error);
  return json.result as T;
}
