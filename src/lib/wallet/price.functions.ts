// CoinMarketCap fallback price feed. Called from the client only when
// CoinGecko + Coinbase can't fill in a required coin.
import process from "node:process";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Maps our internal keys (CoinGecko ids + a couple of custom ones) to CMC symbols.
const KEY_TO_SYMBOL: Record<string, string> = {
  bitcoin: "BTC",
  litecoin: "LTC",
  "bitcoin-cash": "BCH",
  dogecoin: "DOGE",
  ethereum: "ETH",
  binancecoin: "BNB",
  "matic-network": "POL",
  tron: "TRX",
  solana: "SOL",
  tether: "USDT",
  "usd-coin": "USDC",
  dai: "DAI",
  weth: "WETH",
  wbnb: "WBNB",
  "binance-usd": "BUSD",
  txc: "TXC",
  isk: "ISK",
};

interface CmcQuote {
  price?: number;
}
interface CmcCoin {
  quote?: { USD?: CmcQuote };
}
interface CmcResponse {
  data?: Record<string, CmcCoin | CmcCoin[]>;
}

export const fetchCmcPrices = createServerFn({ method: "POST" })
  .inputValidator(z.object({ keys: z.array(z.string()).max(50) }))
  .handler(async ({ data }): Promise<Record<string, number>> => {
    const key = process.env.CMC_API;
    if (!key) return {};
    const symbols = Array.from(
      new Set(data.keys.map((k) => KEY_TO_SYMBOL[k]).filter((s): s is string => !!s)),
    );
    if (symbols.length === 0) return {};

    const url =
      "https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?convert=USD&symbol=" +
      encodeURIComponent(symbols.join(","));
    let json: CmcResponse;
    try {
      const r = await fetch(url, { headers: { "X-CMC_PRO_API_KEY": key, accept: "application/json" } });
      if (!r.ok) return {};
      json = (await r.json()) as CmcResponse;
    } catch {
      return {};
    }

    const out: Record<string, number> = {};
    const bySymbol: Record<string, number> = {};
    for (const [sym, entry] of Object.entries(json.data ?? {})) {
      const first = Array.isArray(entry) ? entry[0] : entry;
      const px = first?.quote?.USD?.price;
      if (typeof px === "number" && isFinite(px) && px > 0) bySymbol[sym.toUpperCase()] = px;
    }
    for (const k of data.keys) {
      const sym = KEY_TO_SYMBOL[k];
      if (sym && bySymbol[sym] != null) out[k] = bySymbol[sym];
    }
    return out;
  });
