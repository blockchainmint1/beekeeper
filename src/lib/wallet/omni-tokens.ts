/**
 * Omni Layer token send/receive primitives (TEXITcoin-family chains).
 *
 * Omni Class C ("Simple Send") rides on a normal UTXO transaction:
 *   - an OP_RETURN output carrying the 20-byte payload,
 *   - a dust output to the recipient (the Omni "reference address"),
 *   - the token *sender* is the address that owns the FIRST input.
 *
 * Divisible tokens are always fixed-point 10^8 (Omni convention) regardless of
 * how the token markets its decimals; indivisible tokens are whole counts.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { UtxoChain } from "@/lib/chains";
import { chainOmniPropertyIds } from "./custom-tokens";
import { getOmniProperties } from "./omni.functions";

export const OMNI_DIVISIBLE_DECIMALS = 8;

export interface OmniTokenMeta {
  /** Omni property id. */
  id: number;
  symbol: string;
  name?: string;
  /** True → amounts encoded as 10^8 fixed point. */
  divisible: boolean;
}

/**
 * App-authoritative display metadata. The chain's own property name is used as
 * a fallback, but TSD is branded here so the picker never shows the raw
 * issuance name.
 */
const BUILTIN: Record<number, Omit<OmniTokenMeta, "id">> = {
  39: { symbol: "TSD", name: "Texas Stable Dollar", divisible: true },
  37: { symbol: "POP", name: "CryptoPOP", divisible: false },
};

export function builtinOmniMeta(id: number): OmniTokenMeta {
  const b = BUILTIN[id];
  return b
    ? { id, ...b }
    : { id, symbol: `#${id}`, name: `Property #${id}`, divisible: true };
}

/**
 * The tokens to offer for this chain (chain defaults + user customs), with
 * divisibility resolved from the node.
 *
 * Divisibility is fixed at issuance and getting it wrong shifts the decimal
 * point by 10^8 — so the chain always wins over local metadata.
 */
export function useOmniTokens(chain: UtxoChain): {
  tokens: OmniTokenMeta[];
  isLoading: boolean;
} {
  const ids = chain.supportsOmni ? chainOmniPropertyIds(chain) : [];
  const fetchProps = useServerFn(getOmniProperties);
  const q = useQuery({
    queryKey: ["omni-props", chain.id, ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    queryFn: () => fetchProps({ data: { propertyIds: ids } }),
  });

  const tokens = ids.map((id) => {
    const local = builtinOmniMeta(id);
    const chainProp = q.data?.[id];
    if (!chainProp) return local;
    return {
      ...local,
      divisible: chainProp.divisible,
      name: BUILTIN[id]?.name ?? chainProp.name ?? local.name,
      symbol: BUILTIN[id]?.symbol ?? chainProp.name?.split(/\s+/)[0]?.toUpperCase() ?? local.symbol,
    };
  });

  return { tokens, isLoading: q.isLoading };
}

/* ───────────── amounts ───────────── */

/** Parse a user-typed amount into Omni integer units. Throws on bad input. */
export function parseOmniAmount(amountStr: string, divisible: boolean): bigint {
  const clean = amountStr.trim();
  if (!clean) throw new Error("Amount is required.");
  if (!/^\d+(\.\d+)?$/.test(clean)) throw new Error("Invalid amount.");
  if (!divisible) {
    if (clean.includes(".")) throw new Error("This token is indivisible — use a whole number.");
    const n = BigInt(clean);
    if (n <= 0n) throw new Error("Amount must be greater than zero.");
    return n;
  }
  const [whole, frac = ""] = clean.split(".");
  if (frac.length > OMNI_DIVISIBLE_DECIMALS) {
    throw new Error(`Max ${OMNI_DIVISIBLE_DECIMALS} decimals.`);
  }
  const padded = (frac + "0".repeat(OMNI_DIVISIBLE_DECIMALS)).slice(0, OMNI_DIVISIBLE_DECIMALS);
  const n = BigInt(whole) * 10n ** BigInt(OMNI_DIVISIBLE_DECIMALS) + BigInt(padded);
  if (n <= 0n) throw new Error("Amount must be greater than zero.");
  return n;
}

export function formatOmniAmount(units: bigint | number | string, divisible: boolean): string {
  const n = typeof units === "bigint" ? units : BigInt(units);
  if (!divisible) return n.toString();
  const base = 10n ** BigInt(OMNI_DIVISIBLE_DECIMALS);
  const frac = (n % base).toString().padStart(OMNI_DIVISIBLE_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${n / base}.${frac}` : (n / base).toString();
}

/* ───────────── payload ───────────── */

/**
 * Omni picks the reference (recipient) address from the outputs and its parser
 * only understands legacy P2PKH/P2SH scripts. A bech32 output is invisible to
 * it: the chain transaction confirms and the dust arrives, but the tokens never
 * move. So token sends must target a legacy address.
 */
export function isOmniCompatibleAddress(address: string, chain: UtxoChain): boolean {
  const a = address.trim().toLowerCase();
  const bech32 = chain.network.bech32?.toLowerCase();
  if (bech32 && a.startsWith(`${bech32}1`)) return false;
  return true;
}

/**
 * Build the raw OP_RETURN bytes for a Simple Send (without the OP_RETURN
 * opcode / pushdata prefix).
 *
 * Layout (20 bytes): "omni" | version(2) | type(2) | propertyId(4 BE) | amount(8 BE)
 */
export function buildSimpleSendPayload(propertyId: number, amountUnits: bigint): Uint8Array {
  if (!Number.isInteger(propertyId) || propertyId <= 0 || propertyId > 0xffffffff) {
    throw new Error("Invalid property id.");
  }
  if (amountUnits <= 0n || amountUnits > 0x7fffffffffffffffn) {
    throw new Error("Invalid amount.");
  }
  const out = new Uint8Array(20);
  out[0] = 0x6f; // o
  out[1] = 0x6d; // m
  out[2] = 0x6e; // n
  out[3] = 0x69; // i
  // bytes 4..7 stay zero: version 0, type 0 (Simple Send)
  out[8] = (propertyId >>> 24) & 0xff;
  out[9] = (propertyId >>> 16) & 0xff;
  out[10] = (propertyId >>> 8) & 0xff;
  out[11] = propertyId & 0xff;
  for (let i = 0; i < 8; i += 1) {
    out[19 - i] = Number((amountUnits >> BigInt(i * 8)) & 0xffn);
  }
  return out;
}

/** BIP21-style URI carrying an Omni token request (`?omni=39&amount=10`). */
export function buildOmniPaymentUri(
  chain: UtxoChain,
  address: string,
  propertyId: number,
  amount?: string,
): string {
  const scheme = chain.id === "txc" ? "texitcoin" : chain.id;
  const params = new URLSearchParams({ omni: String(propertyId) });
  if (amount && amount.trim()) params.set("amount", amount.trim());
  return `${scheme}:${address}?${params.toString()}`;
}
