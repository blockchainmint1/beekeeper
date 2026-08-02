// Client-side NowNodes dispatcher. Calls the server proxy (the API key never
// reaches the browser) and maps Blockbook responses to the app's shapes.
// Every helper returns null on failure so callers can fall back to the
// per-chain provider that was there before.
import type { UtxoChain } from "@/lib/chains";
import type { AddressInfo, EsploraUtxo } from "./utxo";
import type { HistoryItem } from "./history";

const SUPPORTED = new Set(["btc", "ltc", "bch", "doge", "dash"]);
type NnChain = "btc" | "ltc" | "bch" | "doge" | "dash";

export function nownodesSupports(chain: UtxoChain): boolean {
  return SUPPORTED.has(chain.id);
}

function id(chain: UtxoChain): NnChain {
  return chain.id as NnChain;
}

export async function nownodesAddressInfoOrNull(
  chain: UtxoChain,
  address: string,
): Promise<AddressInfo | null> {
  if (!nownodesSupports(chain)) return null;
  try {
    const { nownodesAddressInfo } = await import("./nownodes.functions");
    return (await nownodesAddressInfo({ data: { chain: id(chain), address } })) as AddressInfo;
  } catch {
    return null;
  }
}

export async function nownodesUtxosOrNull(
  chain: UtxoChain,
  address: string,
): Promise<EsploraUtxo[] | null> {
  if (!nownodesSupports(chain)) return null;
  try {
    const { nownodesAddressUtxos } = await import("./nownodes.functions");
    return (await nownodesAddressUtxos({ data: { chain: id(chain), address } })) as EsploraUtxo[];
  } catch {
    return null;
  }
}

export async function nownodesTxHexOrNull(
  chain: UtxoChain,
  txid: string,
): Promise<string | null> {
  if (!nownodesSupports(chain)) return null;
  try {
    const { nownodesTxHex } = await import("./nownodes.functions");
    return await nownodesTxHex({ data: { chain: id(chain), txid } });
  } catch {
    return null;
  }
}

export async function nownodesBroadcastOrNull(
  chain: UtxoChain,
  rawHex: string,
): Promise<string | null> {
  if (!nownodesSupports(chain)) return null;
  try {
    const { nownodesBroadcast } = await import("./nownodes.functions");
    return await nownodesBroadcast({ data: { chain: id(chain), rawHex } });
  } catch {
    return null;
  }
}

/** Blockbook addresses may carry a CashAddr prefix — compare loosely. */
function sameAddress(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const strip = (s: string) => s.toLowerCase().split(":").pop() ?? s.toLowerCase();
  return strip(a) === strip(b);
}

export async function nownodesHistoryOrNull(
  chain: UtxoChain,
  address: string,
  limit = 25,
): Promise<HistoryItem[] | null> {
  if (!nownodesSupports(chain)) return null;
  try {
    const { nownodesAddressTxs } = await import("./nownodes.functions");
    const txs = await nownodesAddressTxs({ data: { chain: id(chain), address, limit } });
    return txs.map((tx) => {
      const sum = (
        entries: { addresses?: string[]; value?: string }[],
      ) =>
        entries.reduce(
          (s, e) =>
            s + ((e.addresses ?? []).some((a) => sameAddress(a, address)) ? Number(e.value ?? 0) : 0),
          0,
        );
      const delta = sum(tx.vout) - sum(tx.vin);
      return {
        txid: tx.txid,
        direction: delta > 0 ? "in" : delta < 0 ? "out" : "self",
        amount: (Math.abs(delta) / 10 ** chain.decimals).toLocaleString(undefined, {
          maximumFractionDigits: 8,
        }),
        ticker: chain.ticker,
        whenSec: tx.blockTime ?? null,
        confirmed: (tx.confirmations ?? 0) > 0,
        url: chain.explorerTx(tx.txid),
        raw: tx,
      } satisfies HistoryItem;
    });
  } catch {
    return null;
  }
}
