// HD scan and sweep utilities for EVM chains.
// Mirrors the "Scan & Sweep" flow from the EVM Wallet project, but scoped to
// Beekeeper's single-mnemonic model.
import {
  createPublicClient,
  createWalletClient,
  http,
  erc20Abi,
  parseUnits,
  formatUnits,
  formatEther,
  type Address,
} from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { EvmChain, Erc20Token } from "@/lib/chains";
import { deriveEvmAccount, evmPrivateKey } from "./evm";

function chainDef(chain: EvmChain) {
  return {
    ...mainnet,
    id: chain.evmChainId,
    name: chain.name,
    nativeCurrency: { name: chain.nativeSymbol, symbol: chain.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: chain.rpcUrls } },
  };
}

async function withFallback<T>(
  chain: EvmChain,
  fn: (c: ReturnType<typeof createPublicClient>) => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (const url of chain.rpcUrls) {
    try {
      return await fn(createPublicClient({ chain: chainDef(chain), transport: http(url) }));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All RPC endpoints failed");
}

export interface EvmTokenBalance {
  token: Erc20Token;
  raw: bigint;
  formatted: string;
}

export interface EvmHdAddress {
  index: number;
  address: Address;
  nativeWei: bigint;
  tokens: EvmTokenBalance[];
}

export interface EvmHdScanResult {
  totalNativeWei: bigint;
  active: EvmHdAddress[]; // any address with native or token balance
  scanned: number;
}

/**
 * Walk derivation indices 0..count-1, fetching native + (optionally) ERC-20 balances.
 * EVM has no on-chain "address used" signal cheap enough to gap-scan like UTXO, so we
 * walk a bounded range with limited concurrency.
 */
export async function scanEvmHd(
  mnemonic: string,
  chain: EvmChain,
  opts: { count?: number; concurrency?: number; includeTokens?: boolean } = {},
): Promise<EvmHdScanResult> {
  const count = opts.count ?? 20;
  const concurrency = opts.concurrency ?? 4;
  const includeTokens = opts.includeTokens ?? true;

  const addresses = Array.from({ length: count }, (_, i) => {
    const a = deriveEvmAccount(mnemonic, chain, i);
    return { index: i, address: a.address as Address };
  });

  const active: EvmHdAddress[] = [];
  let totalNativeWei = 0n;
  let scanned = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < addresses.length) {
      const job = addresses[cursor++];
      try {
        const nativeWei = await withFallback(chain, (c) => c.getBalance({ address: job.address }));
        const tokens: EvmTokenBalance[] = [];
        if (includeTokens && chain.tokens.length > 0) {
          await Promise.all(
            chain.tokens.map(async (t) => {
              try {
                const raw = (await withFallback(chain, (c) =>
                  c.readContract({
                    address: t.address,
                    abi: erc20Abi,
                    functionName: "balanceOf",
                    args: [job.address],
                  }),
                )) as bigint;
                if (raw > 0n) {
                  tokens.push({ token: t, raw, formatted: formatUnits(raw, t.decimals) });
                }
              } catch {
                /* skip token on read error */
              }
            }),
          );
        }
        if (nativeWei > 0n || tokens.length > 0) {
          active.push({ index: job.index, address: job.address, nativeWei, tokens });
          totalNativeWei += nativeWei;
        }
      } catch {
        /* skip address on RPC failure */
      } finally {
        scanned++;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  active.sort((a, b) => a.index - b.index);
  return { totalNativeWei, active, scanned };
}

export interface NativeSweepEstimate {
  balance: bigint;
  cost: bigint;
  sendable: bigint;
  formattedBalance: string;
  formattedCost: string;
  formattedSendable: string;
}

/** Max native amount that can be swept from an address (balance − 21000 × gasPrice). */
export async function estimateNativeSweep(
  chain: EvmChain,
  from: Address,
): Promise<NativeSweepEstimate> {
  const [balance, gasPrice] = await Promise.all([
    withFallback(chain, (c) => c.getBalance({ address: from })),
    withFallback(chain, (c) => c.getGasPrice()),
  ]);
  const cost = 21000n * gasPrice;
  const sendable = balance > cost ? balance - cost : 0n;
  return {
    balance,
    cost,
    sendable,
    formattedBalance: formatEther(balance),
    formattedCost: formatEther(cost),
    formattedSendable: formatEther(sendable),
  };
}

/** Sweep all spendable native value from `fromIndex` to `to`. */
export async function sweepEvmNative(args: {
  mnemonic: string;
  chain: EvmChain;
  fromIndex: number;
  to: Address;
}): Promise<`0x${string}`> {
  const { mnemonic, chain, fromIndex, to } = args;
  const a = deriveEvmAccount(mnemonic, chain, fromIndex);
  const est = await estimateNativeSweep(chain, a.address as Address);
  if (est.sendable <= 0n) {
    throw new Error(
      `Balance too low to cover gas (need ~${est.formattedCost} ${chain.nativeSymbol})`,
    );
  }
  const pk = evmPrivateKey(mnemonic, chain, fromIndex);
  const signer = privateKeyToAccount(pk);
  const wallet = createWalletClient({
    account: signer,
    chain: chainDef(chain),
    transport: http(chain.rpcUrls[0]),
  });
  return wallet.sendTransaction({ to, value: est.sendable });
}

/** Sweep an entire ERC-20 balance from `fromIndex` to `to`. Gas paid in native. */
export async function sweepEvmToken(args: {
  mnemonic: string;
  chain: EvmChain;
  fromIndex: number;
  token: Erc20Token;
  to: Address;
}): Promise<`0x${string}`> {
  const { mnemonic, chain, fromIndex, token, to } = args;
  const a = deriveEvmAccount(mnemonic, chain, fromIndex);
  const raw = (await withFallback(chain, (c) =>
    c.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [a.address as Address],
    }),
  )) as bigint;
  if (raw <= 0n) throw new Error("Token balance is zero");
  const pk = evmPrivateKey(mnemonic, chain, fromIndex);
  const signer = privateKeyToAccount(pk);
  const wallet = createWalletClient({
    account: signer,
    chain: chainDef(chain),
    transport: http(chain.rpcUrls[0]),
  });
  return wallet.writeContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, raw],
  });
}

export function formatEth(wei: bigint, maxDecimals = 6): string {
  const full = formatEther(wei);
  const [w, f = ""] = full.split(".");
  const ft = f.slice(0, maxDecimals).replace(/0+$/, "");
  return ft ? `${BigInt(w).toLocaleString()}.${ft}` : BigInt(w).toLocaleString();
}

// Re-export parseUnits in case dialogs want it.
export { parseUnits };
