/**
 * Candidate public keys for a copper coin.
 *
 * A single seed can back coins minted on any chain we support, so we hand the
 * mint registry every plausible address for that seed and let it tell us which
 * coin it is (and therefore the real six-character Asset ID).
 */
import { CHAINS, type EvmChain, type UtxoChain } from "@/lib/chains";
import { deriveUtxoAccount } from "./utxo";
import { deriveEvmAccount } from "./evm";

/** UTXO chains a coin can be minted on, in likelihood order. */
const UTXO_ORDER = ["txc", "isk", "btc", "ltc", "doge", "dash", "bch"] as const;

export async function deriveCoinCandidateAddresses(mnemonic: string): Promise<string[]> {
  const out: string[] = [];

  for (const id of UTXO_ORDER) {
    const chain = CHAINS[id] as UtxoChain | undefined;
    if (!chain) continue;
    try {
      const legacy = await deriveUtxoAccount(mnemonic, chain, 0, "legacy");
      out.push(legacy.address);
    } catch {
      /* skip chains that fail to derive */
    }
  }

  // One EVM address covers eth/bsc/base/polygon — same key everywhere.
  try {
    const eth = CHAINS.eth as EvmChain;
    out.push(deriveEvmAccount(mnemonic, eth, 0).address);
  } catch {
    /* ignore */
  }

  // Bitcoin native segwit, in case the coin was minted as bc1…
  try {
    const btc = CHAINS.btc as UtxoChain;
    const segwit = await deriveUtxoAccount(mnemonic, btc, 0, "segwit");
    out.push(segwit.address);
  } catch {
    /* ignore */
  }

  return Array.from(new Set(out.filter(Boolean)));
}
