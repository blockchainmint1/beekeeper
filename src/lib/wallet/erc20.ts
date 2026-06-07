// Minimal ERC-20 helpers (balance, decimals reads, and a transfer call) via viem.
import {
  createPublicClient,
  createWalletClient,
  http,
  erc20Abi,
  parseUnits,
  formatUnits,
  type Address,
} from "viem";
import { mainnet } from "viem/chains";
import type { EvmChain, Erc20Token } from "@/lib/chains";
import type { EvmAccount } from "./evm";

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

export async function erc20Balance(
  chain: EvmChain,
  token: Erc20Token,
  owner: Address,
): Promise<bigint> {
  return withFallback(chain, (c) =>
    c.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    }) as Promise<bigint>,
  );
}

export async function erc20Transfer(args: {
  account: EvmAccount;
  token: Erc20Token;
  to: Address;
  amount: string; // human-readable
}): Promise<`0x${string}`> {
  const { account, token, to, amount } = args;
  const wallet = createWalletClient({
    account: account.signer,
    chain: chainDef(account.chain),
    transport: http(account.chain.rpcUrls[0]),
  });
  const value = parseUnits(amount as `${number}`, token.decimals);
  return wallet.writeContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, value],
  });
}

export function formatToken(raw: bigint, decimals: number, maxFrac = 6): string {
  const full = formatUnits(raw, decimals);
  const [whole, frac = ""] = full.split(".");
  const trim = frac.slice(0, maxFrac).replace(/0+$/, "");
  const wholeFmt = BigInt(whole).toLocaleString();
  return trim ? `${wholeFmt}.${trim}` : wholeFmt;
}

export function tokenAmountToRaw(amount: string, decimals: number): bigint {
  return parseUnits(amount as `${number}`, decimals);
}