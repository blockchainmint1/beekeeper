## Goal

Add four new chains as first-class wallets: **Litecoin (LTC)**, **Bitcoin Cash (BCH)**, **TRON (TRX)**, and **Solana (SOL)** — each with derive, balance, send, receive, history, and message signing.

## Scope by chain

### LTC (easy — drop-in UTXO)
- New `UtxoChain` config: Litecoin mainnet network params (bech32 `ltc`, pubkeyHash `0x30`, scriptHash `0x32`, wif `0xb0`, BIP44 coin `2`).
- API: `https://litecoinspace.org/api` (Esplora-compatible). Explorer same host.
- Reuses every existing UTXO codepath (derive, balance, send, history, sign).

### BCH (UTXO + CashAddr layer)
- New `UtxoChain` config with Bitcoin-mainnet bytes (BCH never changed them) but BIP44 coin `145`.
- Add a `cashaddr` encoder/decoder so we can:
  - Display addresses as `bitcoincash:q…` by default.
  - Accept either legacy `1…` or CashAddr when sending (decode → P2PKH script).
- API: `https://bchplorer.com/api` (Esplora-compatible). If unreachable, surface a clear error and let user swap via `apiBase`.
- Sighash: BCH uses `SIGHASH_ALL | SIGHASH_FORKID` (0x41) with BIP143 hashing. Need a small fork-id signer path in `buildAndSign` (gated by a `forkId` field on the chain). Without this, BCH txs will be rejected by the network.

### TRON (new chain kind: `tron`)
- New `ChainConfig` kind `tron`. Derivation: BIP44 coin `195'`, secp256k1; address = `Base58Check(0x41 ‖ keccak256(uncompressedPubKey[1:])[-20:])`.
- Library: `tronweb` for tx building + broadcast (RPC: `https://api.trongrid.io`). Native TRX send only (no TRC20 yet — same caveat as ERC20 tokens shipping later).
- Balance/history via TronGrid REST: `/v1/accounts/{addr}` and `/v1/accounts/{addr}/transactions`.
- Sign message: TRON personal-sign (keccak256 with `\x19TRON Signed Message:\n32` prefix, secp256k1 recoverable).
- Explorer: `https://tronscan.org/#/transaction/<h>` and `/address/<a>`.

### Solana (new chain kind: `solana`)
- New `ChainConfig` kind `solana`. Derivation: SLIP-0010 ed25519, path `m/44'/501'/0'/0'` (Phantom-compatible).
- Library: `@solana/web3.js` for tx + RPC (`https://api.mainnet-beta.solana.com` with public fallback `https://solana-rpc.publicnode.com`).
- Native SOL send only to start (no SPL tokens yet).
- History via RPC `getSignaturesForAddress` + `getParsedTransaction`.
- Sign message: nacl detached signature over UTF-8 bytes (Phantom-compatible).
- Explorer: `https://explorer.solana.com/tx/<h>` and `/address/<a>`.

## Cross-cutting changes

### Type system
- Extend `ChainId` to include `ltc | bch | trx | sol`.
- Add `TronChain` and `SolanaChain` interfaces. `ChainConfig` union grows to four kinds.
- `BTC`/`TXC`/`LTC`/`BCH` get an optional `forkId?: number` (BCH only) and `cashAddrPrefix?: string` (BCH only).

### Derivation (`accountQuery` in `Wallet.tsx`)
- Branch on `kind`: utxo → existing path; evm → existing; **tron** → new `deriveTronAccount`; **solana** → new `deriveSolanaAccount`.
- New account union: `{ kind: "tron"; account: TronAccount }` and `{ kind: "solana"; account: SolanaAccount }`.

### Send / Receive / History / Sign / Xpub dialogs
- Each dialog currently branches on utxo vs evm. Add tron + solana branches:
  - `SendDialog` — render amount input, fetch fee estimate, call chain-specific `buildAndBroadcast`.
  - `ReceiveDialog` — just renders the address, already chain-agnostic ✅.
  - `HistoryDialog` + `RecentActivity` — add tron/solana fetchers behind a single `fetchHistory(chain, address)` dispatcher (keeps the UI dumb).
  - `SignDialog` — add tron/solana signing branches; signatures returned as hex (tron) / base58 (solana).
  - `XpubDialog` — TRON exposes account xpub (secp256k1, same as EVM); Solana has no xpub concept → show the ed25519 public key with a note.

### Aggregator (`totalQuery` and prices)
- `priceForChain`: map `ltc → "litecoin"`, `bch → "bitcoin-cash"`, `trx → "tron"`, `sol → "solana"` on CoinGecko.
- `totalQuery`: add tron/solana balance branches.

### Visible chains
- Add `ltc`, `bch`, `trx`, `sol` to the default visible list.

### Settings → security
- `SignDialog` chain picker already iterates `CHAIN_LIST` — auto-includes new chains.

### Assets
- Generate four logos: `ltc-logo.png`, `bch-logo.png`, `trx-logo.png`, `sol-logo.png`. Register in `chain-style.ts`.

## New / changed files

```text
src/lib/chains/index.ts              # add LTC, BCH, TRX, SOL configs + new kinds
src/lib/wallet/utxo.ts               # BCH fork-id signing path + cashaddr decode on send
src/lib/wallet/cashaddr.ts           # new — encode/decode CashAddr (P2PKH)
src/lib/wallet/tron.ts               # new — derive, balance, send, sign, history
src/lib/wallet/solana.ts             # new — derive, balance, send, sign, history
src/lib/wallet/history.ts            # dispatcher learns tron/solana
src/lib/wallet/price.ts              # add new coingecko ids
src/lib/wallet/visible-chains.ts     # add to DEFAULT
src/lib/wallet/chain-style.ts        # register 4 new logos
src/components/wallet/Wallet.tsx     # accountQuery + totalQuery branches
src/components/wallet/SendDialog.tsx # tron/solana send branches
src/components/wallet/SignDialog.tsx # tron/solana sign branches
src/components/wallet/HistoryDialog.tsx
src/components/wallet/RecentActivity.tsx
src/components/wallet/XpubDialog.tsx
src/assets/{ltc,bch,trx,sol}-logo.png
```

## Dependencies to add
- `tronweb` (TRON tx building, broadcast, address utils)
- `@solana/web3.js` + `tweetnacl` (Solana tx + ed25519 sign)
- `ed25519-hd-key` (SLIP-0010 derivation for Solana)
- `bchaddrjs` *(optional — replaces hand-rolled cashaddr if size allows)*

All four are pure JS and work in the browser. None are imported on the server, so Worker compatibility is not an issue.

## Risks / caveats
- **BCH API endpoint**: free public Esplora hosts for BCH come and go. Picking `bchplorer.com/api` initially; if it's down we add `apiBase` swap in Settings.
- **TRON fees**: TRX uses Energy/Bandwidth, not a sat/byte fee. Fee estimate shown as "≈1 TRX" worst-case if account has no free bandwidth.
- **Solana rent**: receiving SOL into a brand-new account requires the sender to cover rent-exempt minimum (~0.00089 SOL). SendDialog will warn when target balance is 0.
- **No tokens yet**: TRC20 (USDT-TRON) and SPL (USDC-Solana) are deferred — same pattern as ERC20 already, can add in a follow-up.

## Validation
- Production build passes.
- Playwright: unlock wallet, switch to each new chain card, verify address renders in the expected format (ltc1…, bitcoincash:q…, T…, base58 32 chars), verify balance fetch returns 0 without error, verify Send dialog opens and validates a self-address.
