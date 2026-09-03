# Dashboard Balance Summary Workflow (v1)

Portable spec for the Beekeeper "My Funds" home dashboard: how balances are
discovered, priced, aggregated, cached and rendered. Written so another wallet
can reimplement it without reading this repo.

Reference implementation: `src/components/wallet/SimpleDashboard.tsx` (plus the
helpers listed at the end).

---

## 1. Inputs

| Input | Source | Notes |
|---|---|---|
| `mnemonic` | passed in from unlock/onboarding, memory only | never read from storage inside the dashboard |
| `seedKey` | `vaultFingerprint(mnemonic)` | scopes **every** cache key |
| visible chains | `useVisibleChainIds()` (localStorage `quad-wallet-visible-chains`) | default `["txc","eth","base","bsc","btc"]`, TXC first |
| scan gap | `useScanGap()` (localStorage `beekeeper-scan-gap-v1`) | default/min 20, max 100 |
| prices | `fetchAllPrices()` | see §4 |

**Rule:** the mnemonic is never cached, and cache keys always include
`seedKey`. Switching seeds must produce a fresh scan, never a stale row.

---

## 2. Query topology

Three independent React Query layers, so partial results render immediately:

1. `["prices"]` — `fetchAllPrices`, `refetchInterval` 90s, `staleTime` 60s.
2. **One query per visible chain**: `["simple-asset", seedKey, chainId, !!prices, scanGap]`,
   `refetchInterval` 60s, `staleTime` 30s, `enabled: !!mnemonic`.
   Balance scans **never** block on the price feed — if pricing is missing the
   scan still runs and USD fills in on the next pass (the `!!prices` key bit
   forces a re-run once prices arrive).
3. `["simple-history", seedKey, "<chainId>:<address>,…"]` — cross-chain recent
   activity, `refetchInterval` 90s, enabled once ≥1 asset row exists.

Rows sort by USD descending as they land. Failed chain queries are counted and
surfaced with a single "N balance scans failed … Retry" banner that refetches
only the failed queries.

---

## 3. Per-chain balance load (`loadChainAsset`)

Returns `AssetRow { chain, address, balance, usd, nativeUsd, tokens[], utxoAddrs?, evmAddrs? }`.

### UTXO chains (BTC, TXC, LTC, BCH, DOGE, DASH, ISK)
1. `deriveUtxoAccount(mnemonic, chain, 0, chain.defaultAddressType)` → display address.
2. `minIndex = scanCeiling(chainId, gap)` where
   `scanCeiling = max(floor 20, watermark + 1 + gap)`.
3. `scanUtxoHd(mnemonic, chain, { type, gapLimit: gap, minIndex })` walks
   receive+change branches and returns `{ totalSats, active[], highestUsedIndex }`.
4. `bumpWatermark(chainId, highestUsedIndex)` — persists the high-water mark so
   later scans never regress (handles merchants who burst from 2/day to 200/hr).
5. `balance = totalSats / 10 ** decimals`; `nativeUsd = balance * price`.
6. **TXC only** (`supportsOmni`): for every *active* address call
   `getOmniBalancesForAddress({ address })`, aggregate by `propertyid`, and emit
   one token line per property. TSD (`TSD_PROPERTY_ID`, Omni #39) is a
   dollar-pegged stable → `usd = amount * 1`. All other Omni properties show a
   quantity with no USD. Omni failures are swallowed; native balance still shows.

### EVM chains (ETH, Base, BSC)
1. `deriveEvmAccount(mnemonic, chain, 0)` → display address.
2. `count = scanCeiling(chainId, gap, 20, "evm")`.
3. `scanEvmHd(mnemonic, chain, { count, includeTokens: true })` — Multicall3
   batch across the derived addresses → `{ totalNativeWei, tokenTotals[], active[], highestUsedIndex }`.
4. `bumpWatermark(chainId, highestUsedIndex, "evm")`.
5. Native = `totalNativeWei / 1e18`; each token line = `raw / 10**decimals`
   priced by its `coingeckoId`.

### Tron / Solana
Single account-0 address, direct `tronBalance` / `solanaBalance` call, no HD walk.

### Row USD
`usd = nativeUsd + Σ token.usd` (token USD counted as 0 when unpriced).

---

## 4. Pricing (`fetchAllPrices`)

One `PriceMap` keyed by CoinGecko id / lowercase ticker. Cached in memory +
`sessionStorage` (`lovable-wallet-prices-v1`) with a 90s TTL. Resolution order:

1. **CoinMarketCap** via a server function (key stays private) — one call covers
   every tracked coin and token; avoids CoinGecko mobile rate limits.
2. **CoinGecko** `simple/price` for anything CMC missed.
3. **ISK** — overrides everything: `GET {wrap.iskandercoin.com}/api/public/price`
   (Uniswap V3 wISK/USDC pool read; no CEX lists ISK).
4. **ZCU** — `GET https://wzcu.zerochill.com/api/public/price`.
5. **TXC** — `GET https://mempool.texitcoin.org/api/v1/price` (`{ usd }`) when CMC had no quote.
6. **Coinbase spot** last resort for BTC/ETH/BNB/USDT/USDC.
7. **Stablecoin floor** — USDT/USDC pinned to `$1` if every feed failed
   (showing `$1` beats showing `$0` for a merchant holding thousands).

`priceForChain(prices, chain)` maps chain → key (`txc`, `isk`, `bitcoin`,
`litecoin`, `bitcoin-cash`, `dogecoin`, `dash`, else `chain.coingeckoId`).
`formatUsd` scales decimals: 0 above $1000, 2 above $1, 4 above $0.01, else 6;
`null`/non-finite renders `—`.

---

## 5. Total + breakdown UI

- **Headline total** sums only the five `PRIMARY_CHAIN_IDS`
  (`txc, eth, base, bsc, btc`) — not every visible chain. While loading it shows
  `Total Balance · loaded/total` and a spinner; with zero rows it shows `—`.
- **Breakdown** is collapsed behind a "Show breakdown" toggle. One card per
  primary chain, always rendered even before its data lands (spinner →
  `Unavailable` on error → value). Each card shows ticker chip (chain color at
  22% mix), USD, chain name, native amount (≤8 dp).
- **Token lines** nest under their chain card with a left border rail: symbol,
  quantity, and USD when known. TSD appears as a TXC child line, so its $1 peg
  simply rolls into the TXC row total.
- Footer of the section: "Still scanning N chains…" while primaries pend.
- Actions: **Top Up** → `/wallet/topup`, **Cash Out** → `/wallet/cashout`,
  "Go to wallet →" link at the top, **Lock** at the bottom
  (`clearCachedMnemonic()` then `onLocked()`).

---

## 6. Recent transactions + notifications

- For each loaded row with `hasNativeHistory(chain)`:
  - UTXO with `utxoAddrs`: fetch history for **every active address**, dedupe by
    `txid`, keep 10 per chain.
  - Otherwise: `fetchHistory(chain, address)`, keep 5.
- Merge, sort by `whenSec` desc, slice to 5 for display; each entry links to the
  explorer URL and shows direction icon, ticker, pending/date, txid, signed amount.
- After each successful history fetch (guarded by `dataUpdatedAt` so it fires
  once per fetch), `detectNewIncoming(items)` yields unseen inbound txs →
  `addNotification(...)` plus a `toast.success("+amount TICKER received")` with a
  "View" action.

---

## 7. Nectar Pay banner

On mount: if `hasNectarLink()` → linked. Otherwise call
`refreshNectarLinkFromServer()` — a fresh device may already be linked on
Nectar's side. Unlinked wallets see a one-line "Link Nectar Pay" card with a
Link button opening `NectarLinkDialog`; once linked the banner disappears and
management lives in Wallet → Settings → Nectar Pay.

---

## 8. Porting checklist

- [ ] Memory-only mnemonic; `vaultFingerprint` in every query key.
- [ ] One query per chain, never a single all-chains query (partial render).
- [ ] Scans independent of the price feed.
- [ ] Persistent per-seed, per-branch HD watermark + user-tunable gap (20–100).
- [ ] Omni aggregation across *all* active TXC addresses; TSD = $1.
- [ ] Multicall3 batching for EVM derived addresses.
- [ ] Multi-source price ladder with stablecoin $1 floor.
- [ ] Per-chain error isolation with a retry-failed-only banner.
- [ ] Multi-address history dedupe by txid before merge.

## 9. File map

| File | Role |
|---|---|
| `src/components/wallet/SimpleDashboard.tsx` | the whole dashboard |
| `src/lib/wallet/price.ts` | `fetchAllPrices`, `priceForChain`, `formatUsd` |
| `src/lib/wallet/utxo.ts` | `deriveUtxoAccount`, `scanUtxoHd` |
| `src/lib/wallet/evm.ts`, `evm-sweep.ts` | `deriveEvmAccount`, `scanEvmHd` |
| `src/lib/wallet/omni.functions.ts` | `getOmniBalancesForAddress` |
| `src/lib/wallet/hd-watermark.ts` | `scanCeiling`, `bumpWatermark` |
| `src/lib/wallet/scan-prefs.ts` | scan gap preference |
| `src/lib/wallet/visible-chains.ts` | visible/ordered chain list |
| `src/lib/wallet/history.ts` | `fetchHistory`, `hasNativeHistory` |
| `src/lib/wallet/notifications.ts` | `detectNewIncoming`, `addNotification` |
| `src/lib/wallet/nectar.ts` | link state + server refresh |
| `src/lib/cashout/tsd.ts` | `TSD_PROPERTY_ID` |
