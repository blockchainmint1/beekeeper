import type { Network } from "bitcoinjs-lib";

export type ChainId = "txc" | "isk" | "eth";

export interface UtxoChain {
  kind: "utxo";
  id: ChainId;
  name: string;
  ticker: string;
  network: Network;
  coinType: number;
  bip44Base: string;
  bip84Base: string;
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
};

export const CHAINS: Record<ChainId, ChainConfig> = {
  txc: TXC,
  isk: ISK,
  eth: ETH,
};

export const CHAIN_LIST: ChainConfig[] = [TXC, ISK, ETH];

export function getChain(id: ChainId): ChainConfig {
  const c = CHAINS[id];
  if (!c) throw new Error(`Unknown chain: ${id}`);
  return c;
}