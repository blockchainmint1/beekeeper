// Parses industry-standard payment URIs:
//   BIP21:   <scheme>:<address>?amount=<n>&label=<x>&message=<y>
//   EIP-681: ethereum:<address>[@chainId][?value=<wei>|?uint256=<amt>]
//
// Also accepts a bare address (no scheme) and returns it without metadata,
// so the scan button degrades gracefully.
import { CHAIN_LIST, type ChainConfig, type ChainId } from "@/lib/chains";

/** Map of well-known URI schemes to our internal chain ids. */
const SCHEME_TO_CHAIN: Record<string, ChainId> = {
  bitcoin: "btc",
  litecoin: "ltc",
  bitcoincash: "bch",
  bchtest: "bch",
  texitcoin: "txc",
  iskander: "isk",
  iskandercoin: "isk",
  ethereum: "eth",
  bnb: "bsc",
  binance: "bsc",
  base: "base",
  polygon: "polygon",
  matic: "polygon",
  zerochill: "zchl",
  tron: "trx",
  trx: "trx",
  solana: "sol",
  sol: "sol",
};

export interface ParsedPaymentUri {
  /** Raw scheme found in the URI, if any (lowercased, no colon). */
  scheme: string | null;
  /** Resolved chain when the scheme is recognized. */
  chain: ChainConfig | null;
  /** Recipient address (or scheme-specific path). May still need chain-side validation. */
  address: string;
  /** Human-readable amount string in the chain's native units, when present. */
  amount: string | null;
  /** Optional token symbol the URI targets (e.g. EIP-681 contract calls, ?token=USDC). */
  tokenSymbol: string | null;
  label: string | null;
  message: string | null;
  /** Any extra query params for advanced consumers. */
  extras: Record<string, string>;
}

/** Parse a scanned QR payload into a payment intent. Throws on obviously bad input. */
export function parsePaymentUri(raw: string): ParsedPaymentUri {
  const text = raw.trim();
  if (!text) throw new Error("Empty QR");

  // Bare address — no scheme, no params.
  const schemeMatch = text.match(/^([a-z][a-z0-9+.-]*):(.*)$/i);
  if (!schemeMatch) {
    return {
      scheme: null, chain: null, address: text, amount: null,
      tokenSymbol: null, label: null, message: null, extras: {},
    };
  }

  const scheme = schemeMatch[1].toLowerCase();
  const rest = schemeMatch[2].replace(/^\/\//, ""); // tolerate scheme://addr forms
  const [pathPart, queryPart = ""] = rest.split("?", 2);

  // EIP-681 chain suffix: ethereum:0xabc@137?value=…
  let address = pathPart;
  let eipChainId: number | null = null;
  const at = address.indexOf("@");
  if (at >= 0) {
    const n = Number(address.slice(at + 1));
    if (Number.isFinite(n)) eipChainId = n;
    address = address.slice(0, at);
  }
  address = decodeURIComponent(address);

  const params = new URLSearchParams(queryPart);
  const extras: Record<string, string> = {};
  for (const [k, v] of params.entries()) extras[k] = v;

  const amountRaw = params.get("amount") ?? params.get("value") ?? params.get("uint256");
  const label = params.get("label");
  const message = params.get("message");
  const tokenSymbol = params.get("token") ?? params.get("symbol");

  let chain: ChainConfig | null = null;
  const mappedId = SCHEME_TO_CHAIN[scheme];
  if (mappedId) chain = CHAIN_LIST.find((c) => c.id === mappedId) ?? null;

  // EIP-681 chain id override (1=ETH mainnet, 56=BNB, 137=POL, 8453=Base, …).
  if (eipChainId != null) {
    const byEvmId = CHAIN_LIST.find((c) => c.kind === "evm" && c.evmChainId === eipChainId);
    if (byEvmId) chain = byEvmId;
  }

  let amount: string | null = null;
  if (amountRaw != null && amountRaw !== "") {
    // BIP21 `amount` is already in whole coins. EIP-681 `value`/`uint256` is base units (wei).
    if (chain?.kind === "evm" && (params.has("value") || params.has("uint256"))) {
      try {
        const wei = BigInt(amountRaw);
        amount = formatBaseUnits(wei, chain.decimals);
      } catch {
        amount = amountRaw;
      }
    } else {
      amount = amountRaw;
    }
  }

  return { scheme, chain, address, amount, tokenSymbol, label, message, extras };
}

function formatBaseUnits(value: bigint, decimals: number): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  if (frac === 0n) return (neg ? "-" : "") + whole.toString();
  let s = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toString() + "." + s;
}
