// Dynamic UTXO fee-rate estimation with per-chain sanity clamps.
//
// Why the clamps: Blockbook's `estimatefee` on Dogecoin regularly answers with
// absurd values — tens of thousands of sat/vB (a normal send then looks
// unaffordable) or near zero (the tx never confirms). We convert coin/kB to
// sat/vB and clamp into a band that real miners accept, then fall back to the
// chain's static default if anything about the answer looks wrong.
import { useQuery } from "@tanstack/react-query";
import type { UtxoChain } from "@/lib/chains";

/** min / max sat/vB accepted per chain. */
const BOUNDS: Record<string, { min: number; max: number }> = {
  btc: { min: 1, max: 300 },
  ltc: { min: 1, max: 200 },
  bch: { min: 1, max: 50 },
  dash: { min: 1, max: 100 },
  doge: { min: 1_000, max: 5_000 },
};

export type FeeTier = "slow" | "medium" | "fast";

const BLOCKS: Record<FeeTier, number> = { slow: 12, medium: 6, fast: 2 };

const cache = new Map<string, { rate: number; at: number }>();
const TTL = 60_000;

function clamp(chain: UtxoChain, rate: number): number {
  const b = BOUNDS[chain.id];
  if (!b) return rate;
  return Math.min(b.max, Math.max(b.min, rate));
}

/**
 * Estimated fee rate in sat/vB for the given tier, or the chain default when no
 * estimate is available. Never throws.
 */
export async function estimateFeeRate(chain: UtxoChain, tier: FeeTier = "medium"): Promise<number> {
  const key = `${chain.id}:${tier}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.rate;

  let rate = chain.defaultFeeRate;
  try {
    const { nownodesSupports } = await import("./nownodes");
    if (nownodesSupports(chain)) {
      const { nownodesEstimateFee } = await import("./nownodes.functions");
      const out = (await nownodesEstimateFee({
        data: { chain: chain.id as "btc", blocks: BLOCKS[tier] },
      })) as { satPerVb: number | null };
      if (out?.satPerVb && Number.isFinite(out.satPerVb) && out.satPerVb > 0) {
        rate = out.satPerVb;
      }
    }
  } catch {
    // keep the static default
  }

  const final = Math.max(1, Math.round(clamp(chain, rate)));
  cache.set(key, { rate: final, at: Date.now() });
  return final;
}

/** All three tiers, guaranteed ordered slow <= medium <= fast. */
export async function estimateFeeTiers(
  chain: UtxoChain,
): Promise<Record<FeeTier, number>> {
  const [slow, medium, fast] = await Promise.all([
    estimateFeeRate(chain, "slow"),
    estimateFeeRate(chain, "medium"),
    estimateFeeRate(chain, "fast"),
  ]);
  const m = Math.max(slow, medium);
  return { slow, medium: m, fast: Math.max(m, fast) };
}

/**
 * Live fee rate (sat/vB) for a UTXO chain. Falls back to the static default
 * until the estimate resolves, so callers can use it synchronously.
 */
export function useUtxoFeeRate(chain: UtxoChain, tier: FeeTier = "medium"): number {
  const q = useQuery({
    queryKey: ["fee-rate", chain.id, tier],
    queryFn: () => estimateFeeRate(chain, tier),
    staleTime: TTL,
  });
  return q.data ?? chain.defaultFeeRate;
}
