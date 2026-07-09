// Server functions that expose ISK (Iskander Coin) node reads/writes to the client.
// Shapes results into the esplora-compatible types the UTXO layer already consumes,
// so switching to the RPC path requires no changes at the scan/send call sites.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { iskRpc } from "./isk.server";

const BTC_TO_SATS = 100_000_000;

function btcToSats(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  if (!isFinite(n)) return 0;
  return Math.round(n * BTC_TO_SATS);
}

const addressInput = z.object({ address: z.string().min(20).max(80) });

// --- Address balance + tx count ------------------------------------------

interface AddressStatsOut {
  funded_txo_sum: number;
  spent_txo_sum: number;
  tx_count: number;
}
interface AddressInfoOut {
  address: string;
  chain_stats: AddressStatsOut;
  mempool_stats: AddressStatsOut;
}

async function tryGetAddressBalance(address: string): Promise<{ balance: number; received: number } | null> {
  // Bitcoin-Core-with-addressindex style: getaddressbalance {"addresses":[a]}
  try {
    const r = await iskRpc<{ balance?: number | string; received?: number | string }>(
      "getaddressbalance",
      [{ addresses: [address] }],
    );
    const bal = typeof r?.balance === "string" ? parseFloat(r.balance) : (r?.balance ?? 0);
    const recv = typeof r?.received === "string" ? parseFloat(r.received) : (r?.received ?? 0);
    // Some forks return sats already; others return BTC-decimal. Heuristic: values > 1e12 look like sats.
    if (Math.abs(bal) > 1e12 || Math.abs(recv) > 1e12) {
      return { balance: Math.round(bal), received: Math.round(recv) };
    }
    return { balance: Math.round(bal * BTC_TO_SATS), received: Math.round(recv * BTC_TO_SATS) };
  } catch {
    return null;
  }
}

async function tryScanTxOutSet(address: string): Promise<{ balance: number; received: number } | null> {
  try {
    const r = await iskRpc<{ total_amount?: number | string }>("scantxoutset", ["start", [`addr(${address})`]]);
    const total = typeof r?.total_amount === "string" ? parseFloat(r.total_amount) : (r?.total_amount ?? 0);
    const sats = Math.round(total * BTC_TO_SATS);
    return { balance: sats, received: sats };
  } catch {
    return null;
  }
}

async function tryGetAddressTxCount(address: string): Promise<number> {
  try {
    const r = await iskRpc<string[]>("getaddresstxids", [{ addresses: [address] }]);
    return Array.isArray(r) ? r.length : 0;
  } catch {
    return 0;
  }
}

export const iskAddressInfo = createServerFn({ method: "POST" })
  .inputValidator(addressInput)
  .handler(async ({ data }): Promise<AddressInfoOut> => {
    const bal = (await tryGetAddressBalance(data.address)) ?? (await tryScanTxOutSet(data.address));
    const txCount = await tryGetAddressTxCount(data.address);
    const funded = bal?.received ?? 0;
    const balance = bal?.balance ?? 0;
    const spent = Math.max(0, funded - balance);
    return {
      address: data.address,
      chain_stats: {
        funded_txo_sum: funded,
        spent_txo_sum: spent,
        tx_count: txCount || (balance > 0 ? 1 : 0),
      },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
    };
  });

// --- UTXOs ---------------------------------------------------------------

interface EsploraUtxoOut {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
}

interface RawAddressUtxo {
  txid?: string;
  outputIndex?: number;
  vout?: number;
  satoshis?: number;
  value?: number | string;
  height?: number;
  blockHeight?: number;
}

export const iskAddressUtxos = createServerFn({ method: "POST" })
  .inputValidator(addressInput)
  .handler(async ({ data }): Promise<EsploraUtxoOut[]> => {
    // Preferred: getaddressutxos {"addresses":[a]}
    let rows: RawAddressUtxo[] = [];
    try {
      rows = await iskRpc<RawAddressUtxo[]>("getaddressutxos", [{ addresses: [data.address] }]);
    } catch {
      // Fallback: scantxoutset returns { unspents: [{ txid, vout, amount, height }] }
      try {
        const r = await iskRpc<{ unspents?: Array<{ txid: string; vout: number; amount: number | string; height?: number }> }>(
          "scantxoutset",
          ["start", [`addr(${data.address})`]],
        );
        const unspents = r.unspents ?? [];
        rows = unspents.map((u) => ({ txid: u.txid, vout: u.vout, value: u.amount, height: u.height }));
      } catch {
        return [];
      }
    }
    if (!Array.isArray(rows)) return [];
    return rows.map<EsploraUtxoOut>((u) => {
      const txid = String(u.txid ?? "");
      const vout = typeof u.outputIndex === "number" ? u.outputIndex : (u.vout ?? 0);
      const sats = typeof u.satoshis === "number" ? u.satoshis : btcToSats(u.value);
      const height = u.height ?? u.blockHeight;
      return {
        txid,
        vout,
        value: sats,
        status: {
          confirmed: (height ?? 0) > 0,
          block_height: height,
        },
      };
    });
  });

// --- Address tx list -----------------------------------------------------

export const iskAddressTxs = createServerFn({ method: "POST" })
  .inputValidator(addressInput)
  .handler(async ({ data }): Promise<Array<{ txid: string }>> => {
    try {
      const ids = await iskRpc<string[]>("getaddresstxids", [{ addresses: [data.address] }]);
      if (!Array.isArray(ids)) return [];
      return ids.map((t) => ({ txid: t }));
    } catch {
      return [];
    }
  });

// --- Raw tx hex + broadcast ---------------------------------------------

export const iskTxHex = createServerFn({ method: "POST" })
  .inputValidator(z.object({ txid: z.string().length(64) }))
  .handler(async ({ data }): Promise<string> => {
    // verbose=0 → raw hex string
    return await iskRpc<string>("getrawtransaction", [data.txid, 0]);
  });

export const iskBroadcast = createServerFn({ method: "POST" })
  .inputValidator(z.object({ rawHex: z.string().min(2) }))
  .handler(async ({ data }): Promise<string> => {
    return await iskRpc<string>("sendrawtransaction", [data.rawHex]);
  });
