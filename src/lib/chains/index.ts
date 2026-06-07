import type { Network } from "bitcoinjs-lib";

export type ChainId = "txc" | "isk" | "eth" | "bsc" | "base" | "polygon" | "zchl";

export interface UtxoChain {
  kind: "utxo";
  id: ChainId;
  name: string;
  ticker: string;
  network: Network;
  coinType: number;
  bip44Base: string;
  bip84Base: string;
  defaultAddressType: "segwit" | "legacy";
  decimals: 8;
  dustSats: number;
  defaultFeeRate: number;
  apiBase: string;
  explorerTx: (h: string) => string;
  explorerAddr: (a: string) => string;
  supportsOmni: boolean;
  color: string;
}

export interface EvmChain {
  kind: "evm";
  id: ChainId;
  name: string;
  ticker: string;
  evmChainId: number;
  coinType: 60;
  derivationBase: string;
  decimals: 18;
  rpcUrls: string[];
  explorerTx: (h: string) => string;
  explorerAddr: (a: string) => string;
  nativeSymbol: string;
  color: string;
  coingeckoId?: string; // for USD price lookup
  tokens: Erc20Token[];
}

export interface Erc20Token {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  coingeckoId?: string;
}

export type ChainConfig = UtxoChain | EvmChain;

// TXC network — TEXITcoin (Litecoin-fork, Scrypt PoW)
const TXC_NETWORK: Network = {
  messagePrefix: "Texitcoin Signed Message:\n",
  bech32: "txc",
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x42,
  scriptHash: 0x32,
  wif: 0xc1,
};

// ISK network — Iskander Coin
const ISK_NETWORK: Network = {
  messagePrefix: "Iskander Signed Message:\n",
  bech32: "isk",
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x2d,
  scriptHash: 0x2c,
  wif: 0xad,
};

export const TXC: UtxoChain = {
  kind: "utxo",
  id: "txc",
  name: "TEXITcoin",
  ticker: "TXC",
  network: TXC_NETWORK,
  coinType: 696969,
  bip44Base: "m/44'/696969'/0'/0",
  bip84Base: "m/84'/696969'/0'/0",
  defaultAddressType: "legacy",
  decimals: 8,
  dustSats: 10_000,
  defaultFeeRate: 5,
  apiBase: "https://mempool.texitcoin.org/api",
  explorerTx: (h) => `https://mempool.texitcoin.org/tx/${h}`,
  explorerAddr: (a) => `https://mempool.texitcoin.org/address/${a}`,
  supportsOmni: true,
  color: "oklch(0.7 0.18 35)",
};

export const ISK: UtxoChain = {
  kind: "utxo",
  id: "isk",
  name: "Iskander Coin",
  ticker: "ISK",
  network: ISK_NETWORK,
  coinType: 969696,
  bip44Base: "m/44'/969696'/0'/0",
  bip84Base: "m/84'/969696'/0'/0",
  defaultAddressType: "legacy",
  decimals: 8,
  dustSats: 10_000,
  defaultFeeRate: 5,
  apiBase: "https://mempool.iskandercoin.com/api",
  explorerTx: (h) => `https://mempool.iskandercoin.com/tx/${h}`,
  explorerAddr: (a) => `https://mempool.iskandercoin.com/address/${a}`,
  supportsOmni: false,
  color: "oklch(0.7 0.15 200)",
};

export const ETH: EvmChain = {
  kind: "evm",
  id: "eth",
  name: "Ethereum",
  ticker: "ETH",
  evmChainId: 1,
  coinType: 60,
  derivationBase: "m/44'/60'/0'/0",
  decimals: 18,
  rpcUrls: [
    "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth",
    "https://cloudflare-eth.com",
  ],
  explorerTx: (h) => `https://etherscan.io/tx/${h}`,
  explorerAddr: (a) => `https://etherscan.io/address/${a}`,
  nativeSymbol: "ETH",
  color: "oklch(0.65 0.18 270)",
  coingeckoId: "ethereum",
  tokens: [
    { symbol: "USDC", name: "USD Coin", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, coingeckoId: "usd-coin" },
    { symbol: "USDT", name: "Tether",   address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, coingeckoId: "tether" },
    { symbol: "DAI",  name: "Dai",      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, coingeckoId: "dai" },
    { symbol: "WETH", name: "Wrapped Ether", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, coingeckoId: "weth" },
  ],
};

export const BSC: EvmChain = {
  kind: "evm",
  id: "bsc",
  name: "BNB Smart Chain",
  ticker: "BNB",
  evmChainId: 56,
  coinType: 60,
  derivationBase: "m/44'/60'/0'/0",
  decimals: 18,
  rpcUrls: [
    "https://bsc-rpc.publicnode.com",
    "https://binance.llamarpc.com",
    "https://bsc-dataseed.binance.org",
    "https://rpc.ankr.com/bsc",
  ],
  explorerTx: (h) => `https://bscscan.com/tx/${h}`,
  explorerAddr: (a) => `https://bscscan.com/address/${a}`,
  nativeSymbol: "BNB",
  color: "oklch(0.78 0.16 85)",
  coingeckoId: "binancecoin",
  tokens: [
    { symbol: "USDC", name: "USD Coin", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, coingeckoId: "usd-coin" },
    { symbol: "USDT", name: "Tether",   address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, coingeckoId: "tether" },
    { symbol: "BUSD", name: "Binance USD", address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18, coingeckoId: "binance-usd" },
    { symbol: "WBNB", name: "Wrapped BNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18, coingeckoId: "wbnb" },
  ],
};

export const BASE: EvmChain = {
  kind: "evm",
  id: "base",
  name: "Base",
  ticker: "ETH",
  evmChainId: 8453,
  coinType: 60,
  derivationBase: "m/44'/60'/0'/0",
  decimals: 18,
  rpcUrls: [
    "https://base-rpc.publicnode.com",
    "https://base.llamarpc.com",
    "https://mainnet.base.org",
    "https://rpc.ankr.com/base",
  ],
  explorerTx: (h) => `https://basescan.org/tx/${h}`,
  explorerAddr: (a) => `https://basescan.org/address/${a}`,
  nativeSymbol: "ETH",
  color: "oklch(0.62 0.2 250)",
  coingeckoId: "ethereum",
  tokens: [
    { symbol: "USDC", name: "USD Coin", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, coingeckoId: "usd-coin" },
    { symbol: "DAI",  name: "Dai",      address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18, coingeckoId: "dai" },
    { symbol: "WETH", name: "Wrapped Ether", address: "0x4200000000000000000000000000000000000006", decimals: 18, coingeckoId: "weth" },
  ],
};

export const POLYGON: EvmChain = {
  kind: "evm",
  id: "polygon",
  name: "Polygon",
  ticker: "POL",
  evmChainId: 137,
  coinType: 60,
  derivationBase: "m/44'/60'/0'/0",
  decimals: 18,
  rpcUrls: [
    "https://polygon-rpc.com",
    "https://polygon-bor-rpc.publicnode.com",
    "https://rpc.ankr.com/polygon",
  ],
  explorerTx: (h) => `https://polygonscan.com/tx/${h}`,
  explorerAddr: (a) => `https://polygonscan.com/address/${a}`,
  nativeSymbol: "POL",
  color: "oklch(0.6 0.22 305)",
  coingeckoId: "matic-network",
  tokens: [
    { symbol: "USDC", name: "USD Coin", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6, coingeckoId: "usd-coin" },
    { symbol: "USDT", name: "Tether",   address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6, coingeckoId: "tether" },
    { symbol: "DAI",  name: "Dai",      address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18, coingeckoId: "dai" },
  ],
};

export const ZCHL: EvmChain = {
  kind: "evm",
  id: "zchl",
  name: "Zero Chill",
  ticker: "ZCU",
  evmChainId: 90031273,
  coinType: 60,
  derivationBase: "m/44'/60'/0'/0",
  decimals: 18,
  rpcUrls: ["https://rpc.zerochill.com"],
  explorerTx: (h) => `https://scan.zerochill.com/tx/${h}`,
  explorerAddr: (a) => `https://scan.zerochill.com/address/${a}`,
  nativeSymbol: "ZCU",
  color: "oklch(0.75 0.15 180)",
  tokens: [],
};

export const CHAINS: Record<ChainId, ChainConfig> = {
  txc: TXC,
  isk: ISK,
  eth: ETH,
  bsc: BSC,
  base: BASE,
  polygon: POLYGON,
  zchl: ZCHL,
};

export const CHAIN_LIST: ChainConfig[] = [TXC, ISK, ETH, BSC, BASE, POLYGON, ZCHL];

export function getChain(id: ChainId): ChainConfig {
  const c = CHAINS[id];
  if (!c) throw new Error(`Unknown chain: ${id}`);
  return c;
}