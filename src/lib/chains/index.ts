import type { Network } from "bitcoinjs-lib";

export type ChainId =
  | "btc" | "ltc" | "bch" | "doge" | "txc" | "isk"
  | "eth" | "bsc" | "base" | "polygon" | "zchl"
  | "trx" | "sol";

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
  /** Bitcoin Cash & friends — adds SIGHASH_FORKID (0x40) per BIP143 (e.g. 0x00 for BCH). */
  forkId?: number;
  /** CashAddr-style prefix for display (e.g. "bitcoincash"). When set, the wallet
   *  normalizes incoming addresses and displays addresses in CashAddr form. */
  cashAddrPrefix?: string;
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

export interface TronChain {
  kind: "tron";
  id: ChainId;
  name: string;
  ticker: string;
  /** Tron uses Sun (1 TRX = 1e6 Sun). */
  decimals: 6;
  derivationPath: string;
  apiBase: string; // TronGrid REST
  rpcUrl: string;  // TronGrid HTTP for tx submission
  explorerTx: (h: string) => string;
  explorerAddr: (a: string) => string;
  color: string;
  coingeckoId?: string;
}

export interface SolanaChain {
  kind: "solana";
  id: ChainId;
  name: string;
  ticker: string;
  /** SOL uses lamports (1 SOL = 1e9 lamports). */
  decimals: 9;
  derivationPath: string;
  rpcUrls: string[];
  explorerTx: (h: string) => string;
  explorerAddr: (a: string) => string;
  color: string;
  coingeckoId?: string;
}

export type ChainConfig = UtxoChain | EvmChain | TronChain | SolanaChain;

// TXC network — TEXITcoin (Litecoin-fork, Scrypt PoW)
const TXC_NETWORK: Network = {
  messagePrefix: "TEXITcoin Signed Message:\n",
  bech32: "txc",
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x42,
  scriptHash: 0x32,
  wif: 0xc1,
};

// BTC network — Bitcoin mainnet
const BTC_NETWORK: Network = {
  messagePrefix: "\x18Bitcoin Signed Message:\n",
  bech32: "bc",
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
};

// LTC network — Litecoin mainnet
const LTC_NETWORK: Network = {
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "ltc",
  bip32: { public: 0x019da462, private: 0x019d9cfe },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

// BCH network — Bitcoin Cash (bytes identical to BTC; segwit not supported)
const BCH_NETWORK: Network = {
  messagePrefix: "\x18Bitcoin Signed Message:\n",
  bech32: "bc", // unused — BCH has no native segwit; CashAddr is handled separately.
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
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

export const BTC: UtxoChain = {
  kind: "utxo",
  id: "btc",
  name: "Bitcoin",
  ticker: "BTC",
  network: BTC_NETWORK,
  coinType: 0,
  bip44Base: "m/44'/0'/0'/0",
  bip84Base: "m/84'/0'/0'/0",
  defaultAddressType: "segwit",
  decimals: 8,
  dustSats: 546,
  defaultFeeRate: 5,
  apiBase: "https://mempool.space/api",
  explorerTx: (h) => `https://mempool.space/tx/${h}`,
  explorerAddr: (a) => `https://mempool.space/address/${a}`,
  supportsOmni: false,
  color: "oklch(0.78 0.17 65)",
};

export const LTC: UtxoChain = {
  kind: "utxo",
  id: "ltc",
  name: "Litecoin",
  ticker: "LTC",
  network: LTC_NETWORK,
  coinType: 2,
  bip44Base: "m/44'/2'/0'/0",
  bip84Base: "m/84'/2'/0'/0",
  defaultAddressType: "segwit",
  decimals: 8,
  dustSats: 546,
  defaultFeeRate: 3,
  apiBase: "https://litecoinspace.org/api",
  explorerTx: (h) => `https://litecoinspace.org/tx/${h}`,
  explorerAddr: (a) => `https://litecoinspace.org/address/${a}`,
  supportsOmni: false,
  color: "oklch(0.86 0.02 245)",
};

export const BCH: UtxoChain = {
  kind: "utxo",
  id: "bch",
  name: "Bitcoin Cash",
  ticker: "BCH",
  network: BCH_NETWORK,
  coinType: 145,
  bip44Base: "m/44'/145'/0'/0",
  // BCH has no segwit; bip84Base is unused but kept for type compatibility.
  bip84Base: "m/44'/145'/0'/0",
  defaultAddressType: "legacy",
  decimals: 8,
  dustSats: 546,
  defaultFeeRate: 1,
  apiBase: "https://bchplorer.com/api",
  explorerTx: (h) => `https://blockchair.com/bitcoin-cash/transaction/${h}`,
  explorerAddr: (a) => `https://blockchair.com/bitcoin-cash/address/${a}`,
  supportsOmni: false,
  color: "oklch(0.74 0.18 145)",
  forkId: 0x00, // SIGHASH_FORKID base; sighash byte = (TYPE | FORKID | 0x40)
  cashAddrPrefix: "bitcoincash",
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

export const TRX: TronChain = {
  kind: "tron",
  id: "trx",
  name: "TRON",
  ticker: "TRX",
  decimals: 6,
  derivationPath: "m/44'/195'/0'/0/0",
  apiBase: "https://api.trongrid.io",
  rpcUrl: "https://api.trongrid.io",
  explorerTx: (h) => `https://tronscan.org/#/transaction/${h}`,
  explorerAddr: (a) => `https://tronscan.org/#/address/${a}`,
  color: "oklch(0.65 0.22 25)",
  coingeckoId: "tron",
};

export const SOL: SolanaChain = {
  kind: "solana",
  id: "sol",
  name: "Solana",
  ticker: "SOL",
  decimals: 9,
  derivationPath: "m/44'/501'/0'/0'",
  rpcUrls: [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
  ],
  explorerTx: (h) => `https://explorer.solana.com/tx/${h}`,
  explorerAddr: (a) => `https://explorer.solana.com/address/${a}`,
  color: "oklch(0.68 0.22 295)",
  coingeckoId: "solana",
};

export const CHAINS: Record<ChainId, ChainConfig> = {
  btc: BTC,
  ltc: LTC,
  bch: BCH,
  txc: TXC,
  isk: ISK,
  eth: ETH,
  bsc: BSC,
  base: BASE,
  polygon: POLYGON,
  zchl: ZCHL,
  trx: TRX,
  sol: SOL,
};

export const CHAIN_LIST: ChainConfig[] = [BTC, LTC, BCH, TXC, ISK, ETH, BSC, BASE, POLYGON, ZCHL, TRX, SOL];

export function getChain(id: ChainId): ChainConfig {
  const c = CHAINS[id];
  if (!c) throw new Error(`Unknown chain: ${id}`);
  return c;
}