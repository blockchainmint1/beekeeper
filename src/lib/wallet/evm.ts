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