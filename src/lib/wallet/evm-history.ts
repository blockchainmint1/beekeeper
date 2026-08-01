// EVM transaction history via Alchemy's alchemy_getAssetTransfers, called
// through our same-origin proxy so the API key stays on the server.
// Merges outbound + inbound transfers, dedupes by hash, sorts newest-first.

import type { EvmChain } from "@/lib/chains";
import type { HistoryItem } from "./history";

const ALCHEMY_CHAINS = new Set<string>(["eth", "bsc", "base", "polygon"]);

export function isAlchemyEvm(chainId: string): boolean {
  return ALCHEMY_CHAINS.has(chainId);
}

interface AssetTransfer {
  hash: string;
  from: string;
  to: string | null;
  value: number | null;         // decimal-adjusted (Alchemy already applies decimals)
  asset: string | null;
  category: "external" | "internal" | "erc20" | "erc721" | "erc1155" | "specialnft";
  blockNum: string;             // hex
  metadata?: { blockTimestamp?: string };
  rawContract?: { address?: string; decimal?: string };
}

interface TransfersResult {
  transfers?: AssetTransfer[];
}

async function callAlchemy<T>(chain: EvmChain, method: string, params: unknown[]): Promise<T> {
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/api/public/rpc/alchemy/${chain.id}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Alchemy proxy ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "Alchemy error");
  return json.result as T;
}

function fmtAmount(v: number | null): string {
  if (v == null || !isFinite(v)) return "0";
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.001 ? 6 : 8;
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export async function fetchEvmHistory(
  chain: EvmChain,
  address: string,
): Promise<HistoryItem[]> {
  const lowered = address.toLowerCase();
  const commonParams = {
    fromBlock: "0x0",
    toBlock: "latest",
    category: ["external", "internal", "erc20"],
    withMetadata: true,
    excludeZeroValue: false,
    maxCount: "0x32", // 50
    order: "desc",
  } as const;

  const [outResp, inResp] = await Promise.all([
    callAlchemy<TransfersResult>(chain, "alchemy_getAssetTransfers", [
      { ...commonParams, fromAddress: address },
    ]).catch(() => ({ transfers: [] })),
    callAlchemy<TransfersResult>(chain, "alchemy_getAssetTransfers", [
      { ...commonParams, toAddress: address },
    ]).catch(() => ({ transfers: [] })),
  ]);

  const merged = new Map<string, AssetTransfer>();
  for (const t of [...(outResp.transfers ?? []), ...(inResp.transfers ?? [])]) {
    // Same hash can appear on both sides (self-transfer, or multi-log erc20);
    // keep the outbound copy first, then let inbound overwrite only if missing.
    const key = `${t.hash}:${t.category}:${t.asset ?? "native"}`;
    if (!merged.has(key)) merged.set(key, t);
  }

  const items: HistoryItem[] = [];
  for (const t of merged.values()) {
    const isIn = t.to?.toLowerCase() === lowered;
    const isOut = t.from.toLowerCase() === lowered;
    const direction: HistoryItem["direction"] = isIn && isOut ? "self" : isIn ? "in" : "out";
    const ticker = t.asset ?? chain.nativeSymbol;
    const ts = t.metadata?.blockTimestamp
      ? Math.floor(new Date(t.metadata.blockTimestamp).getTime() / 1000)
      : null;
    items.push({
      txid: t.hash,
      direction,
      amount: fmtAmount(t.value),
      ticker,
      whenSec: ts,
      confirmed: true, // Alchemy only surfaces mined transfers
      url: chain.explorerTx(t.hash),
      raw: t,
    });
  }

  items.sort((a, b) => (b.whenSec ?? 0) - (a.whenSec ?? 0));
  return items.slice(0, 50);
}
