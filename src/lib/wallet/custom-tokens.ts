/**
 * User-added tokens — extra ERC-20 contracts (ETH / Base / BSC / Polygon) and
 * extra Omni property ids on TEXITcoin-style chains.
 *
 * Stored per-chain in localStorage; nothing here touches the seed. The wallet
 * merges these with the built-in lists so a freshly issued token shows up
 * without shipping a new build.
 */
import { useEffect, useState } from "react";
import type { ChainId, EvmChain, Erc20Token, UtxoChain } from "@/lib/chains";

const ERC20_KEY = "beekeeper-custom-erc20-v1";
const OMNI_KEY = "beekeeper-custom-omni-v1";
const EVT = "beekeeper:custom-tokens";

type Erc20Map = Record<string, Erc20Token[]>;
type OmniMap = Record<string, number[]>;

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* ignore */
  }
}

/* ───────────── ERC-20 ───────────── */

export function getCustomErc20(chainId: ChainId | string): Erc20Token[] {
  const map = read<Erc20Map>(ERC20_KEY) ?? {};
  const list = map[chainId];
  return Array.isArray(list) ? list : [];
}

export function addCustomErc20(chainId: ChainId | string, token: Erc20Token): void {
  const map = read<Erc20Map>(ERC20_KEY) ?? {};
  const list = Array.isArray(map[chainId]) ? map[chainId]! : [];
  const lower = token.address.toLowerCase();
  if (list.some((t) => t.address.toLowerCase() === lower)) return;
  map[chainId] = [...list, token];
  write(ERC20_KEY, map);
}

export function removeCustomErc20(chainId: ChainId | string, address: string): void {
  const map = read<Erc20Map>(ERC20_KEY) ?? {};
  const list = Array.isArray(map[chainId]) ? map[chainId]! : [];
  map[chainId] = list.filter((t) => t.address.toLowerCase() !== address.toLowerCase());
  write(ERC20_KEY, map);
}

/** Built-in tokens for this chain plus anything the user added. */
export function chainErc20Tokens(chain: EvmChain): Erc20Token[] {
  const custom = getCustomErc20(chain.id).filter(
    (c) => !chain.tokens.some((t) => t.address.toLowerCase() === c.address.toLowerCase()),
  );
  return [...chain.tokens, ...custom];
}

/* ───────────── Omni ───────────── */

export function getCustomOmni(chainId: ChainId | string): number[] {
  const map = read<OmniMap>(OMNI_KEY) ?? {};
  const list = map[chainId];
  return Array.isArray(list) ? list.filter((n) => Number.isInteger(n) && n > 0) : [];
}

export function addCustomOmni(chainId: ChainId | string, propertyId: number): void {
  if (!Number.isInteger(propertyId) || propertyId <= 0) return;
  const map = read<OmniMap>(OMNI_KEY) ?? {};
  const list = Array.isArray(map[chainId]) ? map[chainId]! : [];
  if (list.includes(propertyId)) return;
  map[chainId] = [...list, propertyId];
  write(OMNI_KEY, map);
}

export function removeCustomOmni(chainId: ChainId | string, propertyId: number): void {
  const map = read<OmniMap>(OMNI_KEY) ?? {};
  const list = Array.isArray(map[chainId]) ? map[chainId]! : [];
  map[chainId] = list.filter((n) => n !== propertyId);
  write(OMNI_KEY, map);
}

/** Default Omni property ids for this chain plus anything the user added. */
export function chainOmniPropertyIds(chain: UtxoChain): number[] {
  const defaults = chain.defaultOmniPropertyIds ?? [];
  const custom = getCustomOmni(chain.id).filter((id) => !defaults.includes(id));
  return [...defaults, ...custom];
}

/* ───────────── hooks ───────────── */

function useStore<T>(readFn: () => T, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sync = () => setValue(readFn());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function useCustomErc20(chainId: ChainId | string): Erc20Token[] {
  return useStore(() => getCustomErc20(chainId), []);
}

export function useCustomOmni(chainId: ChainId | string): number[] {
  return useStore(() => getCustomOmni(chainId), []);
}
