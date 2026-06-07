# Unified TXC + ISK + EVM Web Wallet

One non-custodial, browser-based wallet that holds **TEXITcoin (TXC)**, **Iskander Coin (ISK)**, and **EVM accounts** (Ethereum + any EVM chains we configure) under a single BIP39 seed. Keys never leave the device. Each chain talks to its own API (Esplora for UTXO, JSON-RPC for EVM). The same backup phrase recovers all balances.

## Why this works
- BIP39 mnemonic is chain-agnostic. One seed → many key trees via different SLIP-44 coin types.
- TXC & ISK projects are near-identical forks differing only in `lib/txc/network.ts` (address bytes, bech32 HRP, SLIP-44, mempool URL).
- The EVM Wallet project already provides `lib/wallet/{hd,chains,rpc,scan,ledger,disperse,secret,storage}.ts` plus routes for balances/ledger/onboarding.
- Same seed derives:
  - TXC at `m/84'/696969'/0'/0/i` (bech32 `txc1…`) and `m/44'/696969'/…` (legacy `T…`)
  - ISK at `m/84'/969696'/0'/0/i` (bech32 `isk1…`) and `m/44'/969696'/…` (legacy `K…`)
  - EVM at `m/44'/60'/0'/0/i` (single address per chain, reused across Ethereum, Polygon, Base, etc.)

## Architecture

### Chain registry (discriminated union)
```ts
// src/lib/chains/index.ts
export type ChainId = "txc" | "isk" | "eth" | string; // EVM chains keyed by chainId

type UtxoChain = {
  kind: "utxo";
  id: ChainId;
  name: string; ticker: string;
  network: bitcoinjs.Network;
  coinType: number;       // 696969 / 969696
  bip44Base: string; bip84Base: string;
  decimals: 8;
  dustSats: number; defaultFeeRate: number;
  apiBase: string;        // Esplora root
  explorerTx: (h: string) => string;
  explorerAddr: (a: string) => string;
  supportsOmni: boolean;
};

type EvmChain = {
  kind: "evm";
  id: ChainId;            // "eth", "polygon", "base", ...
  name: string; ticker: string;
  evmChainId: number;     // 1, 137, 8453, ...
  coinType: 60;
  derivationBase: "m/44'/60'/0'/0";
  decimals: 18;
  rpcUrls: string[];
  explorerTx: (h: string) => string;
  explorerAddr: (a: string) => string;
  nativeSymbol: string;   // ETH / MATIC / ...
  tokens?: { address: `0x${string}`; symbol: string; decimals: number }[]; // ERC-20s
};

export type ChainConfig = UtxoChain | EvmChain;
export const CHAINS: Record<ChainId, ChainConfig> = { txc, isk, eth /*, ...*/ };
```

All call sites branch on `chain.kind`:
- `kind === "utxo"` → existing TXC/ISK code path (Esplora, UTXO selection, PSBT signing, Omni when supported).
- `kind === "evm"` → EVM path (JSON-RPC, nonce, EIP-1559 gas, `eth_sendRawTransaction`, ERC-20 transfers).

### Single seed, three key trees
- One BIP39 mnemonic in IndexedDB (existing `storage.ts`).
- `deriveAccount(seed, chain)`:
  - UTXO chains → bitcoinjs HD path with chain's `bip84Base` / `bip44Base`.
  - EVM chains → `m/44'/60'/0'/0/i` (the same address works on every EVM network, so we derive once and reuse across configured EVM chains).
- Same backup phrase recovers everything.

### Per-chain state (storage namespacing)
- UTXO: UTXOs, tx history, address book, labels — namespaced by `chainId`.
- EVM: nonce cache, token list, tx history — namespaced by `chainId`.
- React: `useActiveChain()` hook + chain switcher in header. Wallet screen also shows a combined balances card at the top.

## UI

1. **Chain switcher** in the top bar (TXC | ISK | ETH | …). Persists last selected.
2. **Balances overview** at top: TXC, ISK, ETH (and any other EVM chains), each clickable to switch active chain. Optional USD totals via existing `price.ts` extended with a CoinGecko-style lookup for EVM natives.
3. **Send** branches on `chain.kind`:
   - UTXO → existing flow: amount, fee rate sat/vB, address prefix validation per chain.
   - EVM → recipient, amount, native vs. ERC-20 selector, gas estimate (EIP-1559 maxFee/maxPriority), nonce auto.
4. **Receive** shows the active chain's next unused address (UTXO) or the single account address (EVM) as QR.
5. **History** filtered by active chain with a chain badge per row.
6. **Settings → Backup**: one phrase covers all chains; shows derivation path per chain.
7. **Omni** UI only visible when active chain has `supportsOmni`.
8. **ERC-20 token management** (add by contract address) only visible for EVM chains.

## File plan

```text
src/
  lib/
    chains/
      index.ts            # ChainConfig union + CHAINS registry
      txc.ts isk.ts       # UTXO configs (ported)
      evm/
        eth.ts            # mainnet
        index.ts          # registered EVM chains
    wallet/               # chain-agnostic shell
      seed.ts             # BIP39 mnemonic + IndexedDB (ported from TXC)
      utxo/               # ported from TXC lib/txc/*
        crypto.ts wallet.ts esplora.ts omni.ts units.ts storage.ts
        contacts.ts labels.ts price.ts
      evm/                # ported from EVM Wallet lib/wallet/*
        hd.ts rpc.ts scan.ts ledger.ts disperse.ts secret.ts storage.ts
        erc20.ts          # token transfers + balance reads
  components/
    wallet/
      Wallet.tsx                  # shell + chain tabs
      ChainSwitcher.tsx           # NEW
      BalancesOverview.tsx        # NEW (all chains)
      send/{UtxoSendForm,EvmSendForm}.tsx
      ReceiveCard.tsx
      history/{UtxoHistory,EvmHistory}.tsx
      SettingsDialog.tsx ContactsDialog.tsx
  routes/
    __root.tsx
    index.tsx              # Wallet shell
```

## Implementation steps
1. Install UTXO deps: `bitcoinjs-lib`, `bip32`, `ecpair`, `wif`, `@bitcoinerlab/secp256k1`, `buffer`, `qrcode`, `@yudiel/react-qr-scanner`.
2. Install EVM deps: `viem` (preferred — small, edge-friendly, has wallet/account/HD helpers) or reuse whatever the EVM Wallet project uses (verify on port). Plus `@scure/bip39` and `@scure/bip32` if not already pulled in transitively.
3. Port `lib/txc/*` → `lib/wallet/utxo/*` and create `lib/chains/{txc,isk}.ts`.
4. Port `lib/wallet/*` from EVM Wallet → `lib/wallet/evm/*` and create `lib/chains/evm/eth.ts` (and any additional EVM chains we want by default).
5. Build a shared `seed.ts` that owns the mnemonic and exposes `deriveAccount(chain)` dispatching by `chain.kind`.
6. Build `ChainSwitcher`, `BalancesOverview`, and split `SendForm` / `History` by `kind`.
7. Add per-chain address-prefix validation in the send forms (UTXO prefix per chain; EVM checksum address).
8. Optional: legacy-storage migration from either single-chain wallet or the EVM Wallet so existing users keep their data.
9. Manual test on mainnets: receive on TXC + ISK + ETH; send native + an ERC-20; backup + restore the seed and recover all three balances.

## Out of scope (v1)
- No custodial accounts, no server, no database.
- No cross-chain swap. The wallet just holds the three asset classes.
- WalletConnect / dApp connector for EVM — can be added later (viem + `@walletconnect/sign-client`).
- L2s beyond what we hard-configure on day one; users can add EVM chains later via a custom-RPC form.