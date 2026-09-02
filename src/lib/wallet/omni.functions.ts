// Server functions exposing Omni Layer reads from the TXC node.
// All RPC creds stay server-side; the browser only sees the JSON result.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rpcCall } from "./omni.server";

// --- Raw RPC response shapes ----------------------------------------------

export interface OmniBalanceEntry {
  propertyid: number;
  name?: string; // populated client-side after enrichment
  balance: string; // decimal string
  reserved: string;
  frozen?: string;
}

interface RawAddressBalance {
  propertyid: number;
  balance: string;
  reserved: string;
  frozen?: string;
}

export interface OmniProperty {
  propertyid: number;
  name: string;
  category?: string;
  subcategory?: string;
  data?: string;
  url?: string;
  divisible: boolean;
  issuer?: string;
  creationtxid?: string;
  totaltokens?: string;
}

// --- Server fns -----------------------------------------------------------

const addressInput = z.object({
  address: z.string().min(20).max(80),
  includePropertyIds: z.array(z.number().int().positive()).max(20).optional(),
});

export const getOmniBalancesForAddress = createServerFn({ method: "POST" })
  .inputValidator(addressInput)
  .handler(async ({ data }): Promise<OmniBalanceEntry[]> => {
    let raw: RawAddressBalance[] = [];
    try {
      raw = await rpcCall<RawAddressBalance[]>("omni_getallbalancesforaddress", [data.address]);
    } catch (e) {
      // Address with zero Omni history returns an error on some node versions —
      // treat that as "no balances" rather than failing the UI.
      if (!(e instanceof Error && /Address not found|no tokens/i.test(e.message))) throw e;
    }
    if (!Array.isArray(raw)) raw = [];

    // Always surface the chain's default properties, even at zero balance.
    const seen = new Set(raw.map((b) => b.propertyid));
    for (const id of data.includePropertyIds ?? []) {
      if (!seen.has(id)) raw.push({ propertyid: id, balance: "0", reserved: "0" });
    }
    if (raw.length === 0) return [];

    // Enrich with property metadata (name) — cached per call.
    const props = await Promise.all(
      raw.map(async (b) => {
        try {
          const p = await rpcCall<OmniProperty>("omni_getproperty", [b.propertyid]);
          return { id: b.propertyid, name: p.name };
        } catch {
          return { id: b.propertyid, name: `Property #${b.propertyid}` };
        }
      }),
    );
    const nameById = new Map(props.map((p) => [p.id, p.name]));
    return raw.map((b) => ({
      propertyid: b.propertyid,
      name: nameById.get(b.propertyid) ?? `Property #${b.propertyid}`,
      balance: b.balance,
      reserved: b.reserved,
      frozen: b.frozen,
    }));
  });


export const listOmniProperties = createServerFn({ method: "POST" })
  .inputValidator(z.object({ ecosystem: z.union([z.literal(1), z.literal(2)]).optional() }))
  .handler(async ({ data }): Promise<OmniProperty[]> => {
    const list = await rpcCall<OmniProperty[]>("omni_listproperties", []);
    if (!Array.isArray(list)) return [];
    if (!data.ecosystem) return list;
    // ecosystem 1 = main, 2 = test. propertyid < 2147483648 = main.
    return list.filter((p) =>
      data.ecosystem === 1 ? p.propertyid < 2147483648 : p.propertyid >= 2147483648,
    );
  });

export const getOmniProperty = createServerFn({ method: "POST" })
  .inputValidator(z.object({ propertyid: z.number().int().positive() }))
  .handler(async ({ data }): Promise<OmniProperty> => {
    return await rpcCall<OmniProperty>("omni_getproperty", [data.propertyid]);
  });
/**
 * Batch property metadata. Divisibility is fixed at issuance and locally-stored
 * guesses shift the decimal point by 10^8, so the UI always resolves it here.
 */
export const getOmniProperties = createServerFn({ method: "POST" })
  .inputValidator(z.object({ propertyIds: z.array(z.number().int().positive()).min(1).max(50) }))
  .handler(async ({ data }): Promise<Record<number, { divisible: boolean; name?: string }>> => {
    const out: Record<number, { divisible: boolean; name?: string }> = {};
    await Promise.all(
      data.propertyIds.map(async (id) => {
        try {
          const p = await rpcCall<OmniProperty>("omni_getproperty", [id]);
          out[id] = { divisible: p.divisible !== false, name: p.name };
        } catch {
          // Unknown/unreachable property → client keeps its local metadata.
        }
      }),
    );
    return out;
  });

export interface OmniTxEntry {
  txid: string;
  sendingaddress: string;
  referenceaddress?: string;
  type?: string;
  type_int?: number;
  propertyid?: number;
  divisible?: boolean;
  amount?: string;
  valid?: boolean;
  confirmations?: number;
  blocktime?: number;
  block?: number;
}

/**
 * Recent Omni transactions for an address (token sends in and out), newest
 * first. Filters to the requested properties when given.
 */
export const getOmniTransactions = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      address: z.string().min(20).max(80),
      propertyIds: z.array(z.number().int().positive()).max(50).optional(),
      count: z.number().int().min(1).max(100).optional(),
    }),
  )
  .handler(async ({ data }): Promise<OmniTxEntry[]> => {
    const count = data.count ?? 25;
    let rows: OmniTxEntry[] = [];
    try {
      rows = await rpcCall<OmniTxEntry[]>("omni_listtransactions", [data.address, count, 0]);
    } catch {
      // Address the node has no Omni history for → empty list, not an error.
      return [];
    }
    if (!Array.isArray(rows)) return [];
    const filtered = rows.filter((tx) => {
      if (tx.valid === false) return false;
      if (!data.propertyIds || data.propertyIds.length === 0) return true;
      return tx.propertyid != null && data.propertyIds.includes(tx.propertyid);
    });
    filtered.sort((a, b) => (b.blocktime ?? 0) - (a.blocktime ?? 0));
    return filtered.slice(0, count);
  });
