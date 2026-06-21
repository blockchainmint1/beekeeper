// Message signing & verification across EVM and UTXO chains.
// EVM: viem personal_sign (EIP-191). UTXO: BIP137 via bitcoinjs-message.
import { hashMessage, recoverAddress, type Address } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import type { EvmChain, UtxoChain } from "@/lib/chains";
import { mnemonicToSeed } from "./seed";
import { HDKey } from "@scure/bip32";
import { Buffer as BufferPolyfill } from "./buffer-polyfill";

/* ───── EVM ───── */

export async function evmSignMessage(args: {
  mnemonic: string;
  chain: EvmChain;
  index?: number;
  message: string;
}): Promise<{ address: Address; signature: `0x${string}` }> {
  const acct = mnemonicToAccount(args.mnemonic.trim().toLowerCase(), {
    accountIndex: 0,
    addressIndex: args.index ?? 0,
    changeIndex: 0,
  });
  const signature = await acct.signMessage({ message: args.message });
  return { address: acct.address, signature };
}

export async function evmVerifyMessage(args: {
  message: string;
  signature: `0x${string}`;
  expectedAddress: string;
}): Promise<boolean> {
  try {
    const recovered = await recoverAddress({
      hash: hashMessage(args.message),
      signature: args.signature,
    });
    return recovered.toLowerCase() === args.expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

/* ───── UTXO (BIP137 / Bitcoin signed messages) ───── */

async function getBmsg() {
  const mod = (await import("bitcoinjs-message")) as unknown as {
    sign: (msg: string, priv: Uint8Array, compressed: boolean, prefix?: string, opts?: { segwitType?: "p2wpkh" | "p2sh(p2wpkh)" }) => Uint8Array;
    verify: (msg: string, addr: string, sig: string | Uint8Array, prefix?: string, checkSegwitAlways?: boolean) => boolean;
    default?: unknown;
  };
  // Some bundlers (Vite CJS interop) only expose the named API on `.default`.
  const def = mod.default as { sign?: typeof mod.sign; verify?: typeof mod.verify } | undefined;
  return {
    sign: mod.sign ?? def?.sign!,
    verify: mod.verify ?? def?.verify!,
  };
}

function derivePrivForUtxo(
  mnemonic: string,
  chain: UtxoChain,
  index: number,
  type: "segwit" | "legacy",
): Uint8Array {
  const seed = mnemonicToSeed(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const base = type === "segwit" ? chain.bip84Base : chain.bip44Base;
  const child = root.derive(`${base}/${index}`);
  if (!child.privateKey) throw new Error("Failed to derive private key");
  return child.privateKey;
}

export async function utxoSignMessage(args: {
  mnemonic: string;
  chain: UtxoChain;
  index?: number;
  type?: "segwit" | "legacy";
  message: string;
}): Promise<string> {
  const type = args.type ?? "segwit";
  const priv = derivePrivForUtxo(args.mnemonic, args.chain, args.index ?? 0, type);
  const bmsg = await getBmsg();
  const prefix = args.chain.network.messagePrefix;
  // bitcoinjs-message / secp256k1 require a Node Buffer, not a Uint8Array.
  const privBuf = BufferPolyfill.from(priv);
  const sig = bmsg.sign(args.message, privBuf as unknown as Uint8Array, true, prefix, type === "segwit" ? { segwitType: "p2wpkh" } : undefined);
  // Encode as base64
  const bytes = sig instanceof Uint8Array ? sig : new Uint8Array(sig as ArrayLike<number>);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function utxoVerifyMessage(args: {
  chain: UtxoChain;
  message: string;
  address: string;
  signatureBase64: string;
}): Promise<boolean> {
  try {
    const bmsg = await getBmsg();
    return bmsg.verify(args.message, args.address, args.signatureBase64, args.chain.network.messagePrefix, true);
  } catch {
    return false;
  }
}