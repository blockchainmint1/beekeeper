// Extended public key derivation for every chain.
// Safe to share — only derives addresses, never spends.
import { HDKey } from "@scure/bip32";
import type { ChainConfig, UtxoChain } from "@/lib/chains";
import { mnemonicToSeed } from "./seed";
import { evmAccountXpub } from "./evm";

/** Strip trailing `/0` (change chain) from the BIP44/84 base to get the account path. */
function accountPath(base: string): string {
  return base.replace(/\/0$/, "");
}

export function utxoAccountXpub(mnemonic: string, chain: UtxoChain): { xpub: string; path: string } {
  const seed = mnemonicToSeed(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const base = chain.defaultAddressType === "segwit" ? chain.bip84Base : chain.bip44Base;
  const path = accountPath(base);
  const node = root.derive(path);
  return { xpub: node.publicExtendedKey, path };
}

export function chainAccountXpub(mnemonic: string, chain: ChainConfig): { xpub: string; path: string } {
  if (chain.kind === "evm") {
    return { xpub: evmAccountXpub(mnemonic), path: "m/44'/60'/0'" };
  }
  return utxoAccountXpub(mnemonic, chain);
}