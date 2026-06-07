// EVM derivation, balance, and send via viem.
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  isAddress,
  type Address,
} from "viem";
import { mainnet } from "viem/chains";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import { getAddress } from "viem";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import type { EvmChain } from "@/lib/chains";

export interface EvmAccount {
  chain: EvmChain;
  index: number;
  address: Address;
  signer: HDAccount;
}

function chainDef(chain: EvmChain) {
  // For now we only ship Ethereum mainnet. New EVM chains can extend the mapping.
  return {
    ...mainnet,
    id: chain.evmChainId,
    name: chain.name,
    nativeCurrency: { name: chain.nativeSymbol, symbol: chain.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: chain.rpcUrls } },
  };
}

/**
 * Try each configured RPC in turn. Returns the first successful response.
 */
function rpcClient(chain: EvmChain) {
  // viem http() picks a single url; we cycle by creating per-attempt clients.
  return chain.rpcUrls.map((url) =>
    createPublicClient({ chain: chainDef(chain), transport: http(url) }),
  );
}

async function withFallback<T>(
  chain: EvmChain,
  fn: (client: ReturnType<typeof createPublicClient>) => Promise<T>,
): Promise<T> {
  const clients = rpcClient(chain);
  let lastErr: unknown;
  for (const c of clients) {
    try {
      return await fn(c);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All RPC endpoints failed");
}

export function deriveEvmAccount(
  mnemonic: string,
  chain: EvmChain,
  index = 0,
): EvmAccount {
  const acct = mnemonicToAccount(mnemonic.trim().toLowerCase(), {
    accountIndex: 0,
    addressIndex: index,
    changeIndex: 0,
  });
  return { chain, index, address: acct.address, signer: acct };
}

/** Extract the 0x-prefixed private key hex for an EVM derivation index. */
export function evmPrivateKey(mnemonic: string, chain: EvmChain, index = 0): `0x${string}` {
  const acct = mnemonicToAccount(mnemonic.trim().toLowerCase(), {
    accountIndex: 0,
    addressIndex: index,
    changeIndex: 0,
  });
  // viem's HDAccount stores the private key via getHdKey().
  const pk = acct.getHdKey().privateKey;
  if (!pk) throw new Error("No private key derived");
  const hex = Array.from(pk).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}` as `0x${string}`;
}

export function isValidEvmAddress(addr: string): boolean {
  return isAddress(addr.trim());
}

export async function evmBalance(chain: EvmChain, address: Address): Promise<bigint> {
  return withFallback(chain, (c) => c.getBalance({ address }));
}

export async function evmGasPrice(chain: EvmChain): Promise<bigint> {
  return withFallback(chain, (c) => c.getGasPrice());
}

export async function sendEvm(args: {
  account: EvmAccount;
  to: Address;
  amountWei: bigint;
}): Promise<`0x${string}`> {
  const { account, to, amountWei } = args;
  const wallet = createWalletClient({
    account: account.signer,
    chain: chainDef(account.chain),
    transport: http(account.chain.rpcUrls[0]),
  });
  return wallet.sendTransaction({ to, value: amountWei });
}

export function weiToEth(wei: bigint): string {
  return formatEther(wei);
}

export function ethToWei(eth: string): bigint {
  return parseEther(eth as `${number}`);
}

export function formatEvm(wei: bigint, maxDecimals = 6): string {
  const full = formatEther(wei);
  const [whole, frac = ""] = full.split(".");
  const fracTrim = frac.slice(0, maxDecimals).replace(/0+$/, "");
  const wholeFmt = BigInt(whole).toLocaleString();
  return fracTrim ? `${wholeFmt}.${fracTrim}` : wholeFmt;
}

// ---------- xpub (watch-only public key export) ----------

const EVM_ACCOUNT_PATH = "m/44'/60'/0'";

/** BIP32 extended public key at m/44'/60'/0' — safe to share, derives addresses but not keys. */
export function evmAccountXpub(mnemonic: string): string {
  const seed = mnemonicToSeedSync(mnemonic.trim().toLowerCase());
  const root = HDKey.fromMasterSeed(seed);
  return root.derive(EVM_ACCOUNT_PATH).publicExtendedKey;
}

function compressedPubkeyToAddress(compressed: Uint8Array): Address {
  // Decompress 33-byte secp256k1 point to 65-byte uncompressed (0x04 || X || Y).
  const point = secp256k1.ProjectivePoint.fromHex(compressed);
  const uncompressed = point.toRawBytes(false);
  // Keccak-256 of X || Y, take last 20 bytes.
  const hash = keccak_256(uncompressed.slice(1));
  let hex = "0x";
  for (let i = hash.length - 20; i < hash.length; i++) {
    hex += hash[i].toString(16).padStart(2, "0");
  }
  return getAddress(hex);
}

/** Derive the nth receiving address from an EVM account xpub. No private key needed. */
export function deriveEvmAddressFromXpub(xpub: string, index: number): { address: Address; path: string } {
  const node = HDKey.fromExtendedKey(xpub).deriveChild(0).deriveChild(index);
  if (!node.publicKey) throw new Error("No public key on derived node");
  return {
    address: compressedPubkeyToAddress(node.publicKey),
    path: `${EVM_ACCOUNT_PATH}/0/${index}`,
  };
}

export function deriveEvmAddressesFromXpub(
  xpub: string,
  count: number,
  offset = 0,
): { address: Address; path: string; index: number }[] {
  const out: { address: Address; path: string; index: number }[] = [];
  for (let i = 0; i < count; i++) {
    const d = deriveEvmAddressFromXpub(xpub, offset + i);
    out.push({ ...d, index: offset + i });
  }
  return out;
}