import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const addressInput = z.object({ address: z.string().min(20).max(80) });

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

export const btcAddressInfo = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => addressInput.parse(data))
  .handler(async ({ data }): Promise<AddressInfoOut> => {
    const { bcAddressBalance } = await import("./blockcypher.server");
    const b = await bcAddressBalance(data.address);
    const confirmedNet = b.balance;
    const totalReceived = b.total_received;
    const confirmedSpent = Math.max(0, totalReceived - confirmedNet);
    const unconfirmed = b.unconfirmed_balance;
    return {
      address: b.address,
      chain_stats: {
        funded_txo_sum: totalReceived,
        spent_txo_sum: confirmedSpent,
        tx_count: b.n_tx - (b.unconfirmed_n_tx ?? 0),
      },
      mempool_stats: {
        funded_txo_sum: unconfirmed > 0 ? unconfirmed : 0,
        spent_txo_sum: unconfirmed < 0 ? -unconfirmed : 0,
        tx_count: b.unconfirmed_n_tx ?? 0,
      },
    };
  });
