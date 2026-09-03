import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const addressInput = z.object({ address: z.string().min(20).max(80) });

interface AddressStatsOut {
  funded_txo_sum: number;
  spent_txo_sum: number;
  tx_count: number;
}
export interface AddressInfoOut {
  address: string;
  chain_stats: AddressStatsOut;
  mempool_stats: AddressStatsOut;
}

/**
 * Bitcoin address stats fetched server-side so browsers never hit
 * mempool.space CORS and so a rate-limited fallback can't blank the page.
 * mempool.space (keyless) is primary, then blockstream.info, then BlockCypher.
 *
 * If every provider fails this THROWS. Never return zeros here: a zero is
 * indistinguishable from an empty address, so an outage would look like a
 * drained wallet and would also let the HD scan's gap counter run out early.
 */
export const btcEsploraAddressInfo = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => addressInput.parse(data))
  .handler(async ({ data }): Promise<AddressInfoOut> => {
    const { address } = data;
    const hosts = ["https://mempool.space/api", "https://blockstream.info/api"];
    for (const host of hosts) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12_000);
        try {
          const res = await fetch(`${host}/address/${address}`, { signal: ctrl.signal });
          if (!res.ok) continue;
          return (await res.json()) as AddressInfoOut;
        } finally {
          clearTimeout(t);
        }
      } catch {
        /* try next host */
      }
    }
    try {
      const { bcAddressBalance } = await import("./blockcypher.server");
      const b = await bcAddressBalance(address);
      const confirmedSpent = Math.max(0, b.total_received - b.balance);
      const unconfirmed = b.unconfirmed_balance;
      return {
        address: b.address,
        chain_stats: {
          funded_txo_sum: b.total_received,
          spent_txo_sum: confirmedSpent,
          tx_count: b.n_tx - (b.unconfirmed_n_tx ?? 0),
        },
        mempool_stats: {
          funded_txo_sum: unconfirmed > 0 ? unconfirmed : 0,
          spent_txo_sum: unconfirmed < 0 ? -unconfirmed : 0,
          tx_count: b.unconfirmed_n_tx ?? 0,
        },
      };
    } catch {
      return EMPTY(address);
    }
  });
