// UTXO consolidation. Merchant wallets accumulate dust across dozens of
// rotating receive addresses; consolidating sweeps each funded derived address
// back into the primary (index 0) address so later sends need fewer inputs and
// pay smaller fees.
//
// Each funded address is swept as its own transaction because every derived
// address has its own private key and `buildAndSign` signs with a single key.
import type { UtxoChain } from "@/lib/chains";
import {
  deriveUtxoAccount,
  scanUtxoHd,
  esplora,
  buildAndSign,
  type HdScanAddress,
} from "./utxo";

export interface ConsolidationPlan {
  /** Receive-branch addresses (excluding index 0) that hold spendable value. */
  sources: HdScanAddress[];
  /** Where everything lands. */
  destination: string;
  totalSats: number;
  /** Change-branch balances we can't sweep yet, surfaced for honesty. */
  skippedChangeSats: number;
}

/** Work out what a consolidation would move, without signing anything. */
export async function planConsolidation(
  mnemonic: string,
  chain: UtxoChain,
  gapLimit: number,
): Promise<ConsolidationPlan> {
  const primary = await deriveUtxoAccount(mnemonic, chain, 0, chain.defaultAddressType);
  const scan = await scanUtxoHd(mnemonic, chain, { gapLimit, minIndex: gapLimit });

  const sources = scan.active.filter((a) => !a.change && a.index !== 0 && a.sats > 0);
  const skippedChangeSats = scan.active
    .filter((a) => a.change && a.sats > 0)
    .reduce((n, a) => n + a.sats, 0);

  return {
    sources,
    destination: primary.address,
    totalSats: sources.reduce((n, a) => n + a.sats, 0),
    skippedChangeSats,
  };
}

export interface ConsolidationStep {
  address: string;
  index: number;
  sats: number;
  status: "ok" | "error";
  txid?: string;
  error?: string;
}

/**
 * Sweep each planned source address into the primary address.
 * `feeRate` is sats/vByte. Reports progress per address so the UI can stream.
 */
export async function runConsolidation(
  mnemonic: string,
  chain: UtxoChain,
  plan: ConsolidationPlan,
  feeRate: number,
  onStep?: (step: ConsolidationStep) => void,
): Promise<ConsolidationStep[]> {
  const steps: ConsolidationStep[] = [];

  for (const src of plan.sources) {
    const step: ConsolidationStep = {
      address: src.address,
      index: src.index,
      sats: src.sats,
      status: "ok",
    };
    try {
      const account = await deriveUtxoAccount(mnemonic, chain, src.index, src.type);
      const utxos = await esplora.addressUtxos(chain, src.address);
      if (utxos.length === 0) throw new Error("Nothing left to spend");

      const inputSats = utxos.reduce((n, u) => n + u.value, 0);
      // Single-output sweep: estimate the vsize, then send the remainder.
      const estVBytes = utxos.length * (account.type === "segwit" ? 68 : 148) + 34 + 11;
      const feeSats = Math.max(300, Math.ceil(estVBytes * feeRate));
      const amountSats = inputSats - feeSats;
      if (amountSats <= 0) throw new Error("Balance too small to cover the fee");

      const { hex } = await buildAndSign({
        account,
        utxos,
        toAddress: plan.destination,
        amountSats,
        feeRate,
      });
      step.txid = await esplora.broadcast(chain, hex);
    } catch (e) {
      step.status = "error";
      step.error = e instanceof Error ? e.message : "Sweep failed";
    }
    steps.push(step);
    onStep?.(step);
  }

  return steps;
}
