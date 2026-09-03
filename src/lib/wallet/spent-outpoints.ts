/**
 * Locally-reserved outpoints (per chain).
 *
 * Explorers are not instantaneous about mempool spends, and more than one
 * thing in this wallet can spend a coin (a payment, a consolidation, another
 * device on the same seed). When a stale coin is picked again the node answers
 * `txn-mempool-conflict` or `bad-txns-inputs-missingorspent`.
 *
 * So: every time we broadcast, we write down the outpoints that transaction
 * consumed and refuse to select them again. Entries expire on their own, so
 * a dropped transaction frees its coins after the TTL.
 */

const KEY = "beekeeper.spent-outpoints.v1";
/** Hard expiry — anything older is stale bookkeeping. */
const TTL_MS = 60 * 60_000;

type Store = Record<string, number>; // "chain:txid:vout" -> reserved-at ms

export function outpointKey(chainId: string, txid: string, vout: number): string {
  return `${chainId}:${txid}:${vout}`;
}

function read(): Store {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    let changed = false;
    for (const [k, ts] of Object.entries(parsed)) {
      if (typeof ts !== "number" || now - ts > TTL_MS) {
        delete parsed[k];
        changed = true;
      }
    }
    if (changed) write(parsed);
    return parsed;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage disabled — reservations are best-effort */
  }
}

/** Record the coins a just-broadcast transaction consumed. */
export function reserveOutpoints(
  chainId: string,
  inputs: { txid: string; vout: number }[],
): void {
  if (inputs.length === 0) return;
  const store = read();
  const now = Date.now();
  for (const i of inputs) store[outpointKey(chainId, i.txid, i.vout)] = now;
  write(store);
}

/** Free coins we previously reserved (our transaction never made it). */
export function releaseOutpoints(
  chainId: string,
  inputs: { txid: string; vout: number }[],
): void {
  if (inputs.length === 0) return;
  const store = read();
  let changed = false;
  for (const i of inputs) {
    const k = outpointKey(chainId, i.txid, i.vout);
    if (k in store) {
      delete store[k];
      changed = true;
    }
  }
  if (changed) write(store);
}

export function isReserved(chainId: string, txid: string, vout: number): boolean {
  return outpointKey(chainId, txid, vout) in read();
}

/** Drop every locally-reserved coin from a candidate set. */
export function filterReserved<T extends { txid: string; vout: number }>(
  chainId: string,
  utxos: T[],
): T[] {
  const store = read();
  if (Object.keys(store).length === 0) return utxos;
  return utxos.filter((u) => !(outpointKey(chainId, u.txid, u.vout) in store));
}

export function clearReservations(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
