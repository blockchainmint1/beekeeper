// TRON wallet primitives: derive, balance, send, sign messages, history.
// secp256k1 + keccak256 for address derivation; tronweb for tx building.
import { HDKey } from "@scure/bip32";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58 } from "@scure/base";
import type { TronChain } from "@/lib/chains";
import type { HistoryItem } from "./history";
import { mnemonicToSeed } from "./seed";

export interface TronAccount {
  chain: TronChain;
  index: number;
  address: string;          // T-prefixed base58check
  privateKey: Uint8Array;   // 32-byte
  publicKey: Uint8Array;    // 65-byte uncompressed (0x04 || X || Y)
}

function hexEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

function hexDecode(h: string): Uint8Array {
  const c = h.startsWith("0x") ? h.slice(2) : h;
  const out = new Uint8Array(c.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(c.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base58Check(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const combined = new Uint8Array(payload.length + 4);
  combined.set(payload, 0);
  combined.set(checksum, payload.length);
  return base58.encode(combined);
}

function base58CheckDecode(addr: string): Uint8Array {
  const decoded = base58.decode(addr);
  if (decoded.length < 5) throw new Error("Address too short");
  const payload = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  const expected = sha256(sha256(payload)).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expected[i]) throw new Error("Invalid TRON address checksum");
  }
  return payload;
}

/** Convert uncompressed pubkey (65B starting 0x04) → 21B Tron address payload (0x41 || keccak256(X‖Y).slice(-20)). */
function pubkeyToTronAddress(pub: Uint8Array): string {
  const xy = pub[0] === 0x04 ? pub.slice(1) : pub;
  const hash = keccak_256(xy);
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(hash.slice(-20), 1);
  return base58Check(payload);
}

export function deriveTronAccount(mnemonic: string, chain: TronChain, index = 0): TronAccount {
  const seed = mnemonicToSeed(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const path = index === 0 ? chain.derivationPath : chain.derivationPath.replace(/\/0$/, `/${index}`);
  const node = root.derive(path);
  if (!node.privateKey || !node.publicKey) throw new Error("No key derived for TRON");
  // Get uncompressed pubkey from secp256k1.
  const uncompressed = secp256k1.getPublicKey(node.privateKey, false);
  const address = pubkeyToTronAddress(uncompressed);
  return { chain, index, address, privateKey: node.privateKey, publicKey: uncompressed };
}

export function isValidTronAddress(addr: string): boolean {
  try {
    const payload = base58CheckDecode(addr.trim());
    return payload.length === 21 && payload[0] === 0x41;
  } catch {
    return false;
  }
}

/** Convert T-base58check to hex address (41…). */
export function tronAddressToHex(addr: string): string {
  return hexEncode(base58CheckDecode(addr));
}

/** Fetch the TRX (sun) balance for an address. */
export async function tronBalance(chain: TronChain, address: string): Promise<bigint> {
  const res = await fetch(`${chain.apiBase}/v1/accounts/${address}`);
  if (!res.ok) throw new Error(`TRON balance ${res.status}`);
  const json = (await res.json()) as { data?: Array<{ balance?: number }> };
  const item = json.data?.[0];
  return BigInt(item?.balance ?? 0);
}

/** Build, sign, and broadcast a TRX transfer. */
export async function sendTron(args: {
  account: TronAccount;
  to: string;
  amountSun: bigint;
}): Promise<string> {
  const { account, to, amountSun } = args;
  if (!isValidTronAddress(to)) throw new Error("Not a valid TRON address");

  // 1. Create unsigned transaction via TronGrid.
  const createRes = await fetch(`${account.chain.rpcUrl}/wallet/createtransaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to_address: tronAddressToHex(to),
      owner_address: tronAddressToHex(account.address),
      amount: Number(amountSun),
    }),
  });
  const created = (await createRes.json()) as {
    txID?: string; raw_data?: unknown; raw_data_hex?: string; Error?: string; error?: string;
  };
  if (!createRes.ok || created.Error || created.error || !created.txID) {
    throw new Error(created.Error || created.error || `createtransaction ${createRes.status}`);
  }

  // 2. Sign txID with secp256k1 (recoverable, low-s, normalized) and append recovery id.
  const txidBytes = hexDecode(created.txID);
  const sig = secp256k1.sign(txidBytes, account.privateKey, { lowS: true, prehash: false });
  const r = sig.r.toString(16).padStart(64, "0");
  const s = sig.s.toString(16).padStart(64, "0");
  const v = (sig.recovery ?? 0).toString(16).padStart(2, "0");
  const signature = r + s + v;

  // 3. Broadcast.
  const bcastRes = await fetch(`${account.chain.rpcUrl}/wallet/broadcasttransaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...created, signature: [signature] }),
  });
  const bcast = (await bcastRes.json()) as { result?: boolean; txid?: string; message?: string; code?: string };
  if (!bcast.result) {
    let msg = bcast.message ? Buffer.from(bcast.message, "hex").toString("utf8").trim() : bcast.code || "broadcast failed";
    if (!msg) msg = "broadcast failed";
    throw new Error(msg);
  }
  return created.txID;
}

/** TRON personal-sign: keccak256("\x19TRON Signed Message:\n32" || keccak256(msg)). */
export function tronSignMessage(account: TronAccount, message: string): string {
  const inner = keccak_256(new TextEncoder().encode(message));
  const prefix = new TextEncoder().encode("\x19TRON Signed Message:\n32");
  const buf = new Uint8Array(prefix.length + inner.length);
  buf.set(prefix, 0);
  buf.set(inner, prefix.length);
  const digest = keccak_256(buf);
  const sig = secp256k1.sign(digest, account.privateKey, { lowS: true, prehash: false });
  const r = sig.r.toString(16).padStart(64, "0");
  const s = sig.s.toString(16).padStart(64, "0");
  // TRON uses v = recovery + 27 (Ethereum-style).
  const v = ((sig.recovery ?? 0) + 27).toString(16).padStart(2, "0");
  return "0x" + r + s + v;
}

export function tronVerifyMessage(args: { address: string; message: string; signatureHex: string }): boolean {
  try {
    const sigHex = args.signatureHex.replace(/^0x/, "");
    if (sigHex.length !== 130) return false;
    const r = BigInt("0x" + sigHex.slice(0, 64));
    const s = BigInt("0x" + sigHex.slice(64, 128));
    let v = parseInt(sigHex.slice(128, 130), 16);
    if (v >= 27) v -= 27;
    const inner = keccak_256(new TextEncoder().encode(args.message));
    const prefix = new TextEncoder().encode("\x19TRON Signed Message:\n32");
    const buf = new Uint8Array(prefix.length + inner.length);
    buf.set(prefix, 0);
    buf.set(inner, prefix.length);
    const digest = keccak_256(buf);
    const sig = new secp256k1.Signature(r, s, v);
    const recovered = sig.recoverPublicKey(digest).toRawBytes(false);
    const expected = pubkeyToTronAddress(recovered);
    return expected === args.address.trim();
  } catch {
    return false;
  }
}

/** Fetch recent TRX transactions for an address (most recent first). */
export async function fetchTronHistory(chain: TronChain, address: string): Promise<HistoryItem[]> {
  const res = await fetch(`${chain.apiBase}/v1/accounts/${address}/transactions?limit=50&only_confirmed=true`);
  if (!res.ok) throw new Error(`TRON history ${res.status}`);
  const json = (await res.json()) as {
    data?: Array<{
      txID: string;
      block_timestamp?: number;
      raw_data?: {
        contract?: Array<{
          type?: string;
          parameter?: { value?: { amount?: number; to_address?: string; owner_address?: string } };
        }>;
      };
    }>;
  };
  const items: HistoryItem[] = [];
  const ownHex = tronAddressToHex(address).toLowerCase();
  for (const tx of json.data ?? []) {
    const contract = tx.raw_data?.contract?.[0];
    if (contract?.type !== "TransferContract") continue;
    const v = contract.parameter?.value;
    if (!v || v.amount == null) continue;
    const to = (v.to_address ?? "").toLowerCase();
    const from = (v.owner_address ?? "").toLowerCase();
    const direction: HistoryItem["direction"] =
      to === ownHex && from === ownHex ? "self" : to === ownHex ? "in" : "out";
    items.push({
      txid: tx.txID,
      direction,
      amount: (v.amount / 10 ** chain.decimals).toLocaleString(undefined, { maximumFractionDigits: 6 }),
      ticker: chain.ticker,
      whenSec: tx.block_timestamp ? Math.floor(tx.block_timestamp / 1000) : null,
      confirmed: true,
      url: chain.explorerTx(tx.txID),
    });
  }
  return items;
}

export function trxToSun(amount: string): bigint {
  const t = amount.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(t)) throw new Error("Invalid TRX amount");
  const [whole, frac = ""] = t.split(".");
  const padded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(padded);
}

export function sunToTrx(sun: bigint | number): string {
  const n = typeof sun === "bigint" ? sun : BigInt(Math.trunc(sun));
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}