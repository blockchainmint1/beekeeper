// Extended public key derivation for every chain.
// Safe to share — only derives addresses, never spends.
import { HDKey } from "@scure/bip32";
import type { ChainConfig, UtxoChain } from "@/lib/chains";
import { mnemonicToSeed } from "./seed";
import { evmAccountXpub } from "./evm";
import { deriveTronAccount } from "./tron";
import { deriveSolanaAccount } from "./solana";

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

/** TRON account-level extended public key (BIP44 m/44'/195'/0').
 *  Watchers derive per-invoice receive addresses from it via m/0/n. */
export function tronAccountXpub(mnemonic: string, chain: TronChain): { xpub: string; path: string } {
  const path = chain.derivationPath.replace(/\/0\/\d+$/, "");
  const seed = mnemonicToSeed(mnemonic);
  const node = HDKey.fromMasterSeed(seed).derive(path);
  return { xpub: node.publicExtendedKey, path };
}

export function chainAccountXpub(mnemonic: string, chain: ChainConfig): { xpub: string; path: string } {
  if (chain.kind === "evm") {
    return { xpub: evmAccountXpub(mnemonic), path: "m/44'/60'/0'" };
  }
  if (chain.kind === "tron") {
    return tronAccountXpub(mnemonic, chain);
  }
  if (chain.kind === "solana") {
    const acct = deriveSolanaAccount(mnemonic, chain, 0);
    return { xpub: acct.address, path: chain.derivationPath };
  }
  return utxoAccountXpub(mnemonic, chain);
}