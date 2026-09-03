# Beekeeper ⇄ Nectar Pay — Wallet Link Protocol (v1)

Everything a Nectar Pay backend needs to implement to link a Beekeeper wallet
and receive its watch-only extended public keys. Wallet-side reference
implementation: `src/lib/wallet/nectar-link.ts`.

Nothing secret ever leaves the device. Only xpubs (watch-only) plus a signature
proving the wallet holds the seed.

---

## 1. Cryptographic primitive (identical for every message)

| Item | Value |
|---|---|
| Curve | secp256k1 |
| Identity key | TXC legacy P2PKH at `m/44'/696969'/0'/0/0` (base58check, version byte `0x42`) |
| Message bytes | UTF-8 of `canonicalJson(payload)` |
| Canonical JSON | object keys sorted recursively, arrays keep order, no whitespace |
| Signature | BIP-137 compact recoverable (65 bytes), base64 |
| Message prefix | `TEXITcoin Signed Message:\n` |
| Verify | `bitcoinjs-message.verify(canonical, address, sigB64, "TEXITcoin Signed Message:\n", true)` |

The `address` field in every request body is the wallet's TXC identity address —
it is the stable wallet ID across devices and reinstalls.

Trusted relying party: **`app.nectar-pay.com` only**. The wallet refuses any
manifest or callback on another host (the marketing apex is not trusted).

---

## 2. Happy path (manifest flow — preferred)

```text
Merchant dashboard              Beekeeper wallet
  mint link token
  render QR:                →   scan QR
  https://app.nectar-pay.com/api/public/v1/wallet-link?token=<token>
                                GET that URL  ──────────────► manifest JSON
                                show consent screen
                                derive xpubs, sign canonical payload
                                POST same URL ──────────────► claim token
  store xpubs, mark token used
                            ←   { ok, store_id, merchant_name, chains_linked }
```

The QR contains **only the manifest URL**. `manifest_url` and `callback_url` are
the same URL by design: GET reads, POST claims.

### 2.1 `GET /api/public/v1/wallet-link?token=<token>` → manifest

```json
{
  "v": 1,
  "type": "hm-link-xpubs",
  "challenge_id": "<uuid>",
  "from": "app.nectar-pay.com",
  "callback_url": "https://app.nectar-pay.com/api/public/v1/wallet-link?token=…",
  "manifest_url": "https://app.nectar-pay.com/api/public/v1/wallet-link?token=…",
  "chains": ["BTC", "TXC", "EVM", "LTC", "BCH", "TRX", "DOGE", "DASH", "ISK", "SOL", "ZCU"],
  "exp": 1735689600,
  "allow_new_wallet": false,
  "known_addresses_count": 1,
  "known_addresses_hash": "<sha256 hex lowercase>",
  "store_id": "optional",
  "merchant_name": "optional"
}
```

Wallet-side validation, all hard failures:

- every field above present with the right type; `exp` (seconds) in the future
- `manifest_url` is https and on `app.nectar-pay.com`
- `callback_url` on the same host and inside the manifest origin
- `chains` normalized/uppercased; unknown keys dropped; empty set rejected

### 2.2 `known_addresses_hash` recipe (must be byte-exact)

```text
sha256( dedupe(trim(addresses)) → drop empty → sort() → join("\n") )
→ hex, lowercase, no trailing newline, addresses compared case-sensitively
```

Empty set hashes to
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

### 2.3 Consent branching in the wallet

| `known_addresses_count` | Result |
|---|---|
| `0` | Silent enrolment — first wallet for this merchant, approve normally |
| `1` and `hash([myAddress])` matches | Known wallet — silent approve |
| `1`, no match, `allow_new_wallet: true` | "New wallet" warning + explicit checkbox |
| `1`, no match, `allow_new_wallet: false` | **Blocked** — tell merchant to re-mint with new-wallet enabled |
| `> 1` | Membership unprovable from a hash; wallet signs optimistically, server is the source of truth (return `403 { code: "unknown_signer" }` to reject) |

---

## 3. Signed link payload (POST body)

```json
{
  "payload": {
    "v": 1,
    "type": "hm-link-xpubs",
    "challenge_id": "<uuid from manifest>",
    "from": "app.nectar-pay.com",
    "callback_url": "https://app.nectar-pay.com/api/public/v1/wallet-link?token=…",
    "chains": ["BTC", "TXC", "EVM", "…"],
    "xpubs": { "BTC": "zpub6…", "TXC": "xpub6…", "EVM": "xpub6…" },
    "exp": 1735689600,
    "issued_at": "2026-09-03T09:10:11.234Z"
  },
  "signature": "<base64 BIP-137>",
  "address": "<TXC identity address>"
}
```

Server MUST check, in order: `challenge_id` matches an unconsumed token →
`callback_url` equals its own URL → `exp` not passed → signature verifies for
`address` over `canonicalJson(payload)` → `address` authorized (or
`allow_new_wallet`) → then persist `xpubs` and consume the token.

Success response (used verbatim in wallet toasts and local link records):

```json
{ "ok": true, "store_id": "…", "merchant_name": "…", "chains_linked": ["BTC", "TXC"] }
```

Errors should return JSON with `error`, `message`, or `hint` — the wallet
surfaces whichever is present. `403` with text matching
`registered|unknown signer|not authorized` triggers the wallet's "another wallet
is on file" guidance panel.

### 3.1 Chain keys and what each xpub is

| Key | Derivation handed over |
|---|---|
| `BTC` | BIP84 account zpub (`m/84'/0'/0'`) |
| `TXC` | account xpub, coin type `696969'` |
| `EVM` | account xpub `m/44'/60'/0'` (eth/base/bsc/polygon share it) |
| `ZCU` | same EVM account key, sent separately so Nectar can enable per-chain |
| `LTC`, `BCH`, `DOGE`, `DASH`, `ISK` | UTXO account xpub for that chain |
| `TRX` | account-level xpub `m/44'/195'/0'` (never the raw hex pubkey) |
| `SOL` | account address (Solana has no watch xpub) |

The wallet **offers every chain it can derive**, not only the requested set —
extra keys are watch-only and harmless. Keep what you understand, ignore the
rest. Re-sync any time to pick up new chains; re-linking never invalidates an
already-stored key.

---

## 4. Pre-flight status check (`hm-link-status`)

Answers "does Nectar already know this seed?" so a wallet restored on a new
phone doesn't ask the user to re-link.

`POST /api/public/v1/wallet-link/status`

```json
{
  "payload": { "v": 1, "type": "hm-link-status", "nonce": "<uuid>", "issued_at": "<ISO>" },
  "signature": "<base64 BIP-137>",
  "address": "<TXC identity address>"
}
```

Server enforces `issued_at` within ±5 minutes and verifies the signature with
the same primitive. Response:

```json
{
  "linked": true,
  "registered": true,
  "stores": [
    { "store_id": "…", "merchant_name": "…", "chains_linked": ["BTC"], "linked_at": "<ISO>" }
  ]
}
```

- `linked` — at least one store has consumed an xpub push from this address
- `registered` — address known, may not have pushed xpubs yet
- `404` — endpoint not deployed; the wallet silently falls back to local state

---

## 5. Legacy formats still accepted by the wallet

1. **Embedded JSON envelope** — `{ v: 1, type: "hm-link-xpubs", challenge_id,
   from, callback_url, chains, exp }` directly in the QR. No manifest, so no
   new-wallet branching: treated as "known".
2. **URL form** — `<scheme>://link-xpubs?id=&cb=&chains=&from=&exp=`.
3. **Plain merchant URL / `{ nectar: "merchant-link", url, token? }`** — fires
   the default BTC/TXC/EVM xpubs with no consent branching.

New integrations should use the manifest flow only.

---

## 6. Wallet-side storage

Links are stored locally keyed by **vault fingerprint**, so switching or
removing a seed never shows another seed's merchant links. Record shape:
`{ merchantId, merchantName, url, linkedAt }`.

---

## 7. Implementation map

| Concern | File |
|---|---|
| Protocol, parsing, canonical JSON, signing, network | `src/lib/wallet/nectar-link.ts` |
| Consent UI + three-way branch | `src/components/wallet/NectarLinkConsentDialog.tsx` |
| QR scan → manifest fetch → consent | `src/components/wallet/NectarLinkDialog.tsx` |
| Local link records (per vault) | `src/lib/wallet/nectar.ts` |
