# Backing up TXC on a Ledger (the sneaky way)

Ledger doesn't ship a TEXITcoin app, and Ledger Live won't list TXC. But
TEXITcoin is a near-clone of Bitcoin (P2PKH + P2WPKH, standard
SIGHASH_ALL, no fork-id, BIP32 derivation), which gives us two practical
ways to put TXC under Ledger protection without waiting for an official app.

## Option A — "Shared seed" trick (easiest, no signing on Ledger)

1. On a Ledger Nano, initialize the device and **write down the 24-word
   recovery phrase**. That phrase is a standard BIP39 seed.
2. Type that same phrase into this wallet's **Import phrase** flow.
3. Now the same seed controls your Bitcoin/ETH on the Ledger *and* your TXC
   address in this wallet. The Ledger never has to "know" about TXC — the
   seed itself is the backup, and any BIP39-compatible wallet can re-derive
   the TXC keys from it.
4. Treat the Ledger's metal/paper backup as the canonical TXC backup too.
   If the laptop dies, restore the seed into this wallet and TXC is back.

Trade-off: TXC signing still happens in the browser (hot key). The Ledger
is the *backup* and *cold-storage source of truth*, not the live signer.

## Option B — "Bitcoin app" PSBT trick (cold signing for TXC)

Because TXC's transaction format is byte-identical to Bitcoin's:

1. Build the TXC transaction in this wallet (PSBT, segwit or legacy).
2. Re-tag the PSBT with Bitcoin mainnet network bytes / WIF prefix.
3. Open the **Bitcoin app** on the Ledger and have it sign the PSBT as if
   it were a Bitcoin tx — the sighash is `SIGHASH_ALL`, no fork-id, so the
   signature is valid.
4. Take the signed PSBT back, re-tag outputs/addresses to TXC parameters,
   finalize, and broadcast to a TXC node.

Caveats:
- The Ledger screen will display BTC amounts and Bitcoin addresses. You
  must manually verify the *script hashes* match what your TXC wallet
  expects — there is no human-readable TXC confirmation on-device.
- Works for P2WPKH and P2PKH. Won't work for taproot or any TXC-specific
  opcodes (TXC currently has none).
- This is the same trick the early Litecoin/Dogecoin community used
  before Ledger added native apps.

## Option C — Treat the Ledger as a "key escrow"

1. On the Ledger, derive an xpub at `m/84'/696969'/0'` using a tool like
   `hwi` or `ledger-app-builder` test mode (advanced).
2. Import that xpub into this wallet as a **watch-only** account for
   receiving.
3. When you need to spend, temporarily install the unofficial TEXITcoin
   Ledger app build (if/when one exists) or fall back to Option B.

## TL;DR

The shortest path is **Option A**: use the Ledger's 24-word seed as the
TXC backup. Same seed → same TXC keys, every time, forever. The Ledger
becomes the most secure metal/paper backup you'll ever have for TXC,
even though it doesn't "know" the coin exists.