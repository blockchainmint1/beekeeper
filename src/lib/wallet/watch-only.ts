/**
 * Watch-only addresses — track a cold-storage coin, paper wallet, or someone
 * else's deposit address without importing any key material. Addresses live in
 * localStorage only; nothing here can sign or spend.
 */
import { useEffect, useState } from "react";
import { getChain, type ChainConfig, type ChainId } from "@/lib/chains";

export interface WatchOnlyEntry {
  id: string;
  chainId: ChainId;
  address: string;
  label: string;
  addedAt: number;
}

const KEY = "beekeeper-watch-only-v1";
const EVT = "beekeeper:watch-only";

function read(): WatchOnlyEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as WatchOnlyEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(list: WatchOnlyEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* ignore */
  }
}

export function listWatchOnly(): WatchOnlyEntry[] {
  return read();
}

export function addWatchOnly(args: { chainId: ChainId; address: string; label?: string }): WatchOnlyEntry {
  const list = read();
  const address = args.address.trim();
  const existing = list.find(
    (e) => e.chainId === args.chainId && e.address.toLowerCase() === address.toLowerCase(),
  );
  if (existing) return existing;
  const entry: WatchOnlyEntry = {
    id: `${args.chainId}-${address.slice(-8)}-${Date.now()}`,
    chainId: args.chainId,
    address,
    label: (args.label ?? "").trim() || "Cold storage",
    addedAt: Date.now(),
  };
  persist([...list, entry]);
  return entry;
}

export function removeWatchOnly(id: string): void {
  persist(read().filter((e) => e.id !== id));
}

export function useWatchOnly(): WatchOnlyEntry[] {
  const [list, setList] = useState<WatchOnlyEntry[]>([]);
  useEffect(() => {
    const sync = () => setList(read());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return list;
}

/** Chains we can read a balance for without a key. */
export function watchableChain(chain: ChainConfig): boolean {
  return chain.kind === "utxo" || chain.kind === "evm";
}

/** Coin-denominated balance for a watch-only address. */
export async function watchOnlyBalance(entry: WatchOnlyEntry): Promise<number> {
  const chain = getChain(entry.chainId);
  if (chain.kind === "utxo") {
    const { esplora, addressBalanceSats } = await import("./utxo");
    const info = await esplora.addressInfo(chain, entry.address);
    return addressBalanceSats(info).total / 1e8;
  }
  if (chain.kind === "evm") {
    const { evmBalance } = await import("./evm");
    const wei = await evmBalance(chain, entry.address as `0x${string}`);
    return Number(wei) / 1e18;
  }
  throw new Error(`Watch-only is not supported on ${chain.name}`);
}

/** Address shape check before we store anything. */
export async function validateWatchAddress(chainId: ChainId, address: string): Promise<boolean> {
  const chain = getChain(chainId);
  const addr = address.trim();
  if (!addr) return false;
  if (chain.kind === "evm") {
    const { isValidEvmAddress } = await import("./evm");
    return isValidEvmAddress(addr);
  }
  if (chain.kind === "utxo") {
    const { validateUtxoAddress } = await import("./utxo");
    return validateUtxoAddress(addr, chain);
  }
  return false;
}
