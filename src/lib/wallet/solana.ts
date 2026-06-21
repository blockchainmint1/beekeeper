// Solana wallet primitives: derive, balance, send, sign, history.
import nacl from "tweetnacl";
import { derivePath } from "ed25519-hd-key";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import type { SolanaChain } from "@/lib/chains";
import type { HistoryItem } from "./history";
import { mnemonicToSeed } from "./seed";

export interface SolanaAccount {
  chain: SolanaChain;
  index: number;
  address: string;          // base58 pubkey
  keypair: Keypair;
}

export function deriveSolanaAccount(mnemonic: string, chain: SolanaChain, index = 0): SolanaAccount {
  const seed = mnemonicToSeed(mnemonic);
  const seedHex = Array.from(seed).map((b) => b.toString(16).padStart(2, "0")).join("");
  const path = index === 0 ? chain.derivationPath : chain.derivationPath.replace(/0'$/, `${index}'`);
  const { key } = derivePath(path, seedHex);
  const keypair = Keypair.fromSeed(new Uint8Array(key));
  return { chain, index, address: keypair.publicKey.toBase58(), keypair };
}

export function isValidSolanaAddress(addr: string): boolean {
  try {
    const pk = new PublicKey(addr.trim());
    return PublicKey.isOnCurve(pk.toBytes());
  } catch {
    return false;
  }
}

function pickConnection(chain: SolanaChain): Connection {
  return new Connection(chain.rpcUrls[0], "confirmed");
}

/** Returns balance in lamports. */
export async function solanaBalance(chain: SolanaChain, address: string): Promise<bigint> {
  let lastErr: unknown;
  for (const url of chain.rpcUrls) {
    try {
      const conn = new Connection(url, "confirmed");
      const lamports = await conn.getBalance(new PublicKey(address));
      return BigInt(lamports);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All Solana RPCs failed");
}

export async function sendSolana(args: {
  account: SolanaAccount;
  to: string;
  amountLamports: bigint;
}): Promise<string> {
  const { account, to, amountLamports } = args;
  if (!isValidSolanaAddress(to)) throw new Error("Not a valid Solana address");
  let lastErr: unknown;
  for (const url of account.chain.rpcUrls) {
    try {
      const conn = new Connection(url, "confirmed");
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: account.keypair.publicKey,
        recentBlockhash: blockhash,
        lastValidBlockHeight,
      });
      tx.add(
        SystemProgram.transfer({
          fromPubkey: account.keypair.publicKey,
          toPubkey: new PublicKey(to),
          lamports: Number(amountLamports),
        }),
      );
      tx.sign(account.keypair);
      const raw = tx.serialize();
      const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });
      return sig;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Solana send failed");
}

/** Detached ed25519 signature over UTF-8 bytes, base58-encoded (Phantom-compatible). */
export function solanaSignMessage(account: SolanaAccount, message: string): string {
  const bytes = new TextEncoder().encode(message);
  const sig = nacl.sign.detached(bytes, account.keypair.secretKey);
  return bs58.encode(sig);
}

export function solanaVerifyMessage(args: { address: string; message: string; signatureBase58: string }): boolean {
  try {
    const sig = bs58.decode(args.signatureBase58.trim());
    const pub = new PublicKey(args.address.trim()).toBytes();
    return nacl.sign.detached.verify(new TextEncoder().encode(args.message), sig, pub);
  } catch {
    return false;
  }
}

export async function fetchSolanaHistory(chain: SolanaChain, address: string): Promise<HistoryItem[]> {
  const conn = pickConnection(chain);
  const pk = new PublicKey(address);
  const sigs = await conn.getSignaturesForAddress(pk, { limit: 25 });
  const items: HistoryItem[] = [];
  for (const s of sigs) {
    const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx) continue;
    const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
    const ownIdx = keys.indexOf(address);
    let delta = 0;
    if (ownIdx >= 0 && tx.meta) {
      delta = (tx.meta.postBalances[ownIdx] ?? 0) - (tx.meta.preBalances[ownIdx] ?? 0);
    }
    const direction: HistoryItem["direction"] =
      delta > 0 ? "in" : delta < 0 ? "out" : "self";
    items.push({
      txid: s.signature,
      direction,
      amount: (Math.abs(delta) / LAMPORTS_PER_SOL).toLocaleString(undefined, { maximumFractionDigits: 9 }),
      ticker: chain.ticker,
      whenSec: s.blockTime ?? null,
      confirmed: s.confirmationStatus === "finalized" || s.confirmationStatus === "confirmed",
      url: chain.explorerTx(s.signature),
    });
  }
  return items;
}

export function solToLamports(amount: string): bigint {
  const t = amount.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(t)) throw new Error("Invalid SOL amount");
  const [whole, frac = ""] = t.split(".");
  const padded = (frac + "000000000").slice(0, 9);
  return BigInt(whole) * 1_000_000_000n + BigInt(padded);
}

export function lamportsToSol(lamports: bigint | number): string {
  const n = typeof lamports === "bigint" ? lamports : BigInt(Math.trunc(lamports));
  const whole = n / 1_000_000_000n;
  const frac = (n % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}