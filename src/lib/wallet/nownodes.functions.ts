import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const chainEnum = z.enum(["btc", "ltc", "bch", "doge", "dash"]);

const addrInput = z.object({ chain: chainEnum, address: z.string().min(20).max(120) });
const txInput = z.object({ chain: chainEnum, txid: z.string().min(32).max(80) });
const txsInput = z.object({
  chain: chainEnum,
  address: z.string().min(20).max(120),
  limit: z.number().int().min(1).max(50).optional(),
});
const broadcastInput = z.object({ chain: chainEnum, rawHex: z.string().min(20) });

/** Is NowNodes usable for this chain (key present + Blockbook host known)? */
export const nownodesStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { nownodesEnabled, NOWNODES_BOOKS } = await import("./nownodes.server");
  return { enabled: nownodesEnabled(), chains: Object.keys(NOWNODES_BOOKS) };
});

export const nownodesAddressInfo = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => addrInput.parse(d))
  .handler(async ({ data }) => {
    const { nnAddressInfoShaped } = await import("./nownodes.server");
    return nnAddressInfoShaped(data.chain, data.address);
  });

export const nownodesAddressUtxos = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => addrInput.parse(d))
  .handler(async ({ data }) => {
    const { nnUtxosShaped } = await import("./nownodes.server");
    return nnUtxosShaped(data.chain, data.address);
  });

export const nownodesAddressTxs = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => txsInput.parse(d))
  .handler(async ({ data }) => {
    const { nnTxs } = await import("./nownodes.server");
    return nnTxs(data.chain, data.address, data.limit ?? 25);
  });

export const nownodesTxHex = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => txInput.parse(d))
  .handler(async ({ data }) => {
    const { nnTxHex } = await import("./nownodes.server");
    return nnTxHex(data.chain, data.txid);
  });

export const nownodesBroadcast = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => broadcastInput.parse(d))
  .handler(async ({ data }) => {
    const { nnBroadcast } = await import("./nownodes.server");
    return nnBroadcast(data.chain, data.rawHex);
  });

/** Blockbook `estimatefee/{blocks}` → sat/vB (null when unavailable). */
export const nownodesEstimateFee = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ chain: chainEnum, blocks: z.number().int().min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { nnEstimateFee } = await import("./nownodes.server");
    return { satPerVb: await nnEstimateFee(data.chain, data.blocks) };
  });

/** Batched address lookup (BTC/LTC/BCH/DOGE/DASH): one round trip for up to 50
 *  addresses, fanned out server-side. Returns null when NowNodes is unavailable
 *  so HD scans fall back to the per-address provider chain. */
export const nownodesAddressInfoBatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        chain: chainEnum,
        addresses: z.array(z.string().min(20).max(120)).min(1).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { nnAddressInfoShaped, nownodesEnabled, nownodesHost } = await import(
      "./nownodes.server"
    );
    if (!nownodesEnabled() || !nownodesHost(data.chain)) return null;
    type Shaped = Awaited<ReturnType<typeof nnAddressInfoShaped>>;
    const one = async (address: string): Promise<Shaped | null> => {
      try {
        return await nnAddressInfoShaped(data.chain, address);
      } catch {
        return null;
      }
    };
    const out: (Shaped | null)[] = [];
    const size = 8; // keep well inside NowNodes rate limits
    for (let i = 0; i < data.addresses.length; i += size) {
      out.push(...(await Promise.all(data.addresses.slice(i, i + size).map(one))));
    }
    return out;
  });
