// Client-callable wrappers around the TXC/ISK Esplora indexers. Each returns
// null (rather than throwing) when the indexer is unconfigured or unhealthy so
// call sites can transparently fall back to the node RPC path.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const chainInput = z.object({
  chainId: z.enum(["txc", "isk"]),
  address: z.string().min(20).max(120),
});

interface AddressStats {
  funded_txo_sum: number;
  spent_txo_sum: number;
  tx_count: number;
}
export interface MempoolAddressInfo {
  address: string;
  chain_stats: AddressStats;
  mempool_stats: AddressStats;
}
export interface MempoolUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
}

export const mempoolAddressInfo = createServerFn({ method: "POST" })
  .inputValidator(chainInput)
  .handler(async ({ data }): Promise<MempoolAddressInfo | null> => {
    const { mempoolGet } = await import("./mempool.server");
    try {
      const r = await mempoolGet<MempoolAddressInfo>(data.chainId, `/address/${data.address}`);
      if (!r || typeof r !== "object" || !r.chain_stats) return null;
      return r;
    } catch {
      return null;
    }
  });

export const mempoolAddressUtxos = createServerFn({ method: "POST" })
  .inputValidator(chainInput)
  .handler(async ({ data }): Promise<MempoolUtxo[] | null> => {
    const { mempoolGet } = await import("./mempool.server");
    try {
      const r = await mempoolGet<MempoolUtxo[]>(data.chainId, `/address/${data.address}/utxo`);
      return Array.isArray(r) ? r : null;
    } catch {
      return null;
    }
  });

export const mempoolAddressTxs = createServerFn({ method: "POST" })
  .inputValidator(chainInput)
  .handler(async ({ data }): Promise<unknown[] | null> => {
    const { mempoolGet } = await import("./mempool.server");
    try {
      const r = await mempoolGet<unknown[]>(data.chainId, `/address/${data.address}/txs`);
      return Array.isArray(r) ? r : null;
    } catch {
      return null;
    }
  });

export const mempoolTxHex = createServerFn({ method: "POST" })
  .inputValidator(z.object({ chainId: z.enum(["txc", "isk"]), txid: z.string().length(64) }))
  .handler(async ({ data }): Promise<string | null> => {
    const { mempoolGet } = await import("./mempool.server");
    try {
      const hex = await mempoolGet<string>(data.chainId, `/tx/${data.txid}/hex`);
      return typeof hex === "string" && /^[0-9a-fA-F]+$/.test(hex.trim()) ? hex.trim() : null;
    } catch {
      return null;
    }
  });
