/**
 * Configuration for swapping a UTXO chain's native coin into a stablecoin via
 * an external counterparty (e.g. THORChain).
 *
 * Beekeeper doesn't have a swap counterparty wired up yet — no THORChain (or
 * equivalent) quote/broadcast integration exists in this codebase. The
 * registry below is intentionally empty; the route and `UtxoSwap` component
 * fall back to a friendly "not available" state until a real adapter is
 * added here.
 */
import type { ChainId } from "@/lib/chains";

export interface UtxoSwapDestination {
  /** Machine-readable asset identifier from the counterparty (e.g. THORChain asset string). */
  asset: string;
  /** Human label, e.g. "USDC (Ethereum)". */
  label: string;
}

export interface UtxoSwapConfig {
  chain: ChainId;
  ticker: string;
  /** Stablecoin destinations this chain can swap into. */
  destinations: UtxoSwapDestination[];
}

/** Populate this map once a real quote/build/broadcast adapter exists. */
export const UTXO_SWAP_CONFIG: Partial<Record<ChainId, UtxoSwapConfig>> = {};

export function getUtxoSwapConfig(chain: ChainId): UtxoSwapConfig | null {
  return UTXO_SWAP_CONFIG[chain] ?? null;
}
