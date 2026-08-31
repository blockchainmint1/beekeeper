import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  addresses: z.array(z.string().min(4).max(120)).min(1).max(12),
});

/** Look up a Cold Storage Coin in the mint registry by its public keys. */
export const lookupMintCoin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { lookupCoinByAddresses } = await import("./mint-registry.server");
    return lookupCoinByAddresses(data.addresses);
  });
