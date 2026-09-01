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
import type { Account } from "viem";
import { getAddress } from "viem";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { EvmChain } from "@/lib/chains";

export interface EvmAccount {
  chain: EvmChain;
  index: number;
  address: Address;
  signer: HDAccount;
}

/** Alchemy same-origin proxy URL for chains we support there.
 *  Prepended to the public-RPC fallback list so viem hits Alchemy first —
 *  it's dramatically more reliable than public endpoints for balance/token
 *  reads on mobile networks that get 429'd off the free rpc mesh. */
const ALCHEMY_PROXY_CHAINS = new Set(["eth", "bsc", "base", "polygon"]);
function alchemyProxyUrl(chain: EvmChain): string | null {
  if (!ALCHEMY_PROXY_CHAINS.has(chain.id)) return null;
  if (typeof window === "undefined") return null;
  return `${window.location.origin}/api/public/rpc/alchemy/${chain.id}`;
}

/** Zero Chill runs behind basic auth, so it is only reachable via our proxy. */
function zcuProxyUrl(chain: EvmChain): string | null {
  if (chain.id !== "zchl") return null;
  if (typeof window === "undefined") return null;
  return `${window.location.origin}/api/public/rpc/zcu`;
}

export function chainRpcUrls(chain: EvmChain): string[] {
  const proxy = alchemyProxyUrl(chain) ?? zcuProxyUrl(chain);
  return proxy ? [proxy, ...chain.rpcUrls] : chain.rpcUrls;
}

function chainDef(chain: EvmChain) {
  return {
    ...mainnet,
    id: chain.evmChainId,
    name: chain.name,
    nativeCurrency: { name: chain.nativeSymbol, symbol: chain.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: chainRpcUrls(chain) } },
  };
}

/**
 * Try each configured RPC in turn. Returns the first successful response.
 */
function rpcClient(chain: EvmChain) {
  return chainRpcUrls(chain).map((url) =>
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

/**
 * Pick an RPC endpoint that is actually reachable right now.
 *
 * Write paths (native send, ERC-20 transfer, sweeps) used `rpcUrls[0]` with no
 * fallback, so a blocked/unreachable public endpoint — e.g. eth.llamarpc.com
 * failing CORS inside the iOS webview, surfacing as viem "Load failed" —
 * killed the transaction even though other endpoints were fine. We probe
 * first and broadcast once, rather than retrying a send across clients
 * (a retry can double-broadcast a tx that actually landed).
 */
const rpcHealth = new Map<string, { url: string; at: number }>();
const RPC_HEALTH_TTL = 60_000;

export async function pickHealthyRpc(chain: EvmChain): Promise<string> {
  const urls = chainRpcUrls(chain);
  const cached = rpcHealth.get(chain.id);
  if (cached && Date.now() - cached.at < RPC_HEALTH_TTL && urls.includes(cached.url)) {
    return cached.url;
  }
  for (const url of urls) {
    try {
      const client = createPublicClient({
        chain: chainDef(chain),
        transport: http(url, { timeout: 8_000, retryCount: 0 }),
      });
      // Reject an endpoint that answers for the wrong network — it would feed
      // wrong balances/gas estimates into the UI without any visible error.
      const id = await client.getChainId();
      if (id !== chain.evmChainId) continue;
      rpcHealth.set(chain.id, { url, at: Date.now() });
      return url;
    } catch {
      // try the next endpoint
    }
  }
  return urls[0]!;
}

export async function evmWalletClient<A extends Account>(chain: EvmChain, account: A) {
  return createWalletClient({
    account,
    chain: chainDef(chain),
    transport: http(await pickHealthyRpc(chain)),
  });
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
  const wallet = await evmWalletClient(account.chain, account.signer);
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