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

const addressInput = z.object({ address: z.string().min(20).max(80) });

export const getOmniBalancesForAddress = createServerFn({ method: "POST" })
  .inputValidator(addressInput)
  .handler(async ({ data }): Promise<OmniBalanceEntry[]> => {
    let raw: RawAddressBalance[] = [];
    try {
      raw = await rpcCall<RawAddressBalance[]>("omni_getallbalancesforaddress", [data.address]);
    } catch (e) {
      // Address with zero Omni history returns an error on some node versions —
      // treat that as "no balances" rather than failing the UI.
      if (e instanceof Error && /Address not found|no tokens/i.test(e.message)) return [];
      throw e;
    }
    if (!Array.isArray(raw) || raw.length === 0) return [];

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