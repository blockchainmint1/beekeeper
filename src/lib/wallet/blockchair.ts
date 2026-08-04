// Blockchair adapter — provides Esplora-shaped responses for chains that have no
// public Esplora instance with CORS (Bitcoin Cash, Dogecoin, Dash).
//
// Blockchair endpoints used (all CORS-enabled, no key required for light use):
//   GET  /{chain}/dashboards/address/{addr}?limit=N   → balance, tx hashes, utxo[]
//   GET  /{chain}/dashboards/transactions/{h1,h2,...} → inputs/outputs per tx
//   GET  /{chain}/raw/transaction/{hash}              → raw hex
//   POST /{chain}/push/transaction  (form: data=<hex>) → broadcast
import type { UtxoChain } from "@/lib/chains";
import type { AddressInfo, EsploraUtxo } from "./utxo";
import type { HistoryItem } from "./history";

const TIMEOUT_MS = 15_000;

function base(chain: UtxoChain): string {
  const slug = chain.blockchairChain;
  if (!slug) throw new Error(`${chain.ticker}: no Blockchair chain configured`);
  return `https://api.blockchair.com/${slug}`;
}

async function bcGet<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`blockchair ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

interface BcAddressResponse {
  data: Record<
    string,
    {
      address: {
        balance: number | null;
        received: number | null;
        spent: number | null;
        transaction_count: number | null;
        unspent_output_count: number | null;
      };
      transactions: string[];
      utxo: { block_id: number; transaction_hash: string; index: number; value: number }[];
    }
  >;
}

async function addressDashboard(chain: UtxoChain, addr: string, limit = 50) {
  const url = `${base(chain)}/dashboards/address/${encodeURIComponent(addr)}?limit=${limit}`;
  const json = await bcGet<BcAddressResponse>(url);
  const entry = json.data?.[addr] ?? Object.values(json.data ?? {})[0];
  if (!entry) throw new Error(`${chain.ticker}: address not found`);
  return entry;
}

export async function blockchairAddressInfo(chain: UtxoChain, addr: string): Promise<AddressInfo> {
  const e = await addressDashboard(chain, addr, 1);
  const received = e.address.received ?? 0;
  const spent = e.address.spent ?? 0;
  return {
    address: addr,
    chain_stats: {
      funded_txo_sum: received,
      spent_txo_sum: spent,
      tx_count: e.address.transaction_count ?? 0,
    },
    mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
  };
}

export async function blockchairAddressUtxos(
  chain: UtxoChain,
  addr: string,
): Promise<EsploraUtxo[]> {
  const e = await addressDashboard(chain, addr, 100);
  return e.utxo.map((u) => ({
    txid: u.transaction_hash,
    vout: u.index,
    value: u.value,
    status: { confirmed: u.block_id > 0, block_height: u.block_id > 0 ? u.block_id : undefined },
  }));
}

interface BcTxResponse {
  data: Record<
    string,
    {
      transaction: { hash: string; block_id: number; time: string };
      inputs: { recipient: string; value: number }[];
      outputs: { recipient: string; value: number }[];
    }
  >;
}

export async function blockchairHistory(
  chain: UtxoChain,
  addr: string,
  limit = 25,
): Promise<HistoryItem[]> {
  const e = await addressDashboard(chain, addr, limit);
  const hashes = e.transactions.slice(0, limit);
  if (hashes.length === 0) return [];
  const json = await bcGet<BcTxResponse>(
    `${base(chain)}/dashboards/transactions/${hashes.join(",")}`,
  );
  const items: HistoryItem[] = [];
  for (const h of hashes) {
    const tx = json.data?.[h];
    if (!tx) continue;
    const inSelf = tx.inputs.reduce((s, i) => s + (i.recipient === addr ? i.value : 0), 0);
    const outSelf = tx.outputs.reduce((s, o) => s + (o.recipient === addr ? o.value : 0), 0);
    const delta = outSelf - inSelf;
    const whenMs = Date.parse(`${tx.transaction.time.replace(" ", "T")}Z`);
    items.push({
      txid: h,
      direction: delta > 0 ? "in" : delta < 0 ? "out" : "self",
      amount: (Math.abs(delta) / 10 ** chain.decimals).toLocaleString(undefined, {
        maximumFractionDigits: 8,
      }),
      ticker: chain.ticker,
      whenSec: Number.isFinite(whenMs) ? Math.floor(whenMs / 1000) : null,
      confirmed: tx.transaction.block_id > 0,
      url: chain.explorerTx(h),
      raw: tx,
    });
  }
  return items;
}

export async function blockchairTxHex(chain: UtxoChain, txid: string): Promise<string> {
  const json = await bcGet<{ data: Record<string, { raw_transaction: string }> }>(
    `${base(chain)}/raw/transaction/${txid}`,
  );
  const hex = json.data?.[txid]?.raw_transaction;
  if (!hex) throw new Error(`${chain.ticker}: raw tx unavailable`);
  return hex;
}

export async function blockchairBroadcast(chain: UtxoChain, rawHex: string): Promise<string> {
  const res = await fetch(`${base(chain)}/push/transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: rawHex }).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Broadcast failed (${res.status})`);
  try {
    const json = JSON.parse(text) as { data?: { transaction_hash?: string } };
    const hash = json.data?.transaction_hash;
    if (hash) return hash;
  } catch { /* fall through */ }
  return text.trim();
}
