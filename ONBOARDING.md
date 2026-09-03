# Beekeeper Onboarding — Coin Scan → Disclaimers → Password

Portable spec of the activation flow. There is **no** "create new wallet" path:
a wallet only exists if a Cold Storage Coin (or a raw 12/24-word phrase) is
scanned in. This document is enough to reimplement the flow in another app.

Primary file: `src/components/wallet/OnboardScreen.tsx`
Rendered by: `src/routes/index.tsx` (stage `onboard`) and `src/routes/wallet.tsx`

---

## 1. Shape of the flow

Three steps, strictly linear, tracked by `step: 1 | 2 | 3`, with a step chip
indicator (`Scan → Rules → Password`).

```text
Step 1  Scan copper coin      -> validates BIP39, sets mnemonic in memory
Step 2  Four disclaimers      -> all four checkboxes required
Step 3  Device password       -> encrypts vault, optional biometric opt-in
                              -> onReady(mnemonic) hands the seed to the session
```

Header copy: "POLLINATED MONEY" / "Activate your Beekeeper Wallet" with an
inline SVG honeycomb + bee mark (`HoneycombMark`, no image assets).

Step titles/descriptions come from `titleFor(step)` / `descFor(step)`.

---

## 2. Step 1 — scanning the coin

UI: one big primary button `Scan my copper coin` opening
`<QrScanDialog>` (`src/components/wallet/QrScanDialog.tsx`), plus two escape
hatches:

- `https://coldstoragecoins.com` — "Don't have one yet?"
- `https://words.honest.money` — "Really know what you're doing? Get some words"

Scanner properties (matters for real devices):

- rendered via `createPortal` straight into `<body>` — no dialog transform or
  `overflow` container, because Chrome/Android silently killed the camera inside
  an animated dialog.
- `qr-scanner` with `preferredCamera: "environment"`, `maxScansPerSecond: 8`,
  `returnDetailedScanResult: true`, scan-region + outline highlight.
- fallbacks: **scan from photo** (`QrScanner.scanImage`) and **paste manually**
  (textarea) — required for cameras blocked by permissions or a WebView.
- help link surfaced in the overlay:
  `https://blockchainmint.com/redeem` ("How to remove the security seal and clean your coin").

### Validation ladder in `handleScan(text)`

1. Normalize: `trim().toLowerCase().replace(/\s+/g, " ")`.
2. `looksLikePublicAddressOrKey(m)` (`src/lib/wallet/payment-uri.ts`) → the user
   scanned the **outside sticker** (address / xpub / BIP21 URI / 0x address /
   base58). Show an informational toast for 10s telling them to peel the
   security seal and scan the laser-etched words underneath. Do **not** error.
3. Word count must be exactly 12 or 24 → else `"Recovery phrase must be 12 or 24 words"`.
4. `isValidMnemonic(m)` — `@scure/bip39` `validateMnemonic` against the English
   wordlist (checksum enforced) → else "not a valid Copper Coin recovery phrase".
5. Success: hold the mnemonic in React state only, toast "Copper Coin recognized",
   advance to step 2.

The mnemonic is never written to storage at this stage.

---

## 3. Step 2 — the four disclaimers

Four checkboxes, all must be checked before `I agree — continue` enables.
Verbatim text (`DISCLAIMERS` array):

1. "I understand my copper coin is my only backup. If I lose it, my account is gone forever."
2. "I will keep my copper coin safe. Anyone who finds it has unlimited access to my funds. I will store it in a safe or safe deposit box."
3. "I will never share my copper coin. No support agent, no app, and no website will ever ask me to scan it elsewhere. It is for me only."
4. "I understand this wallet is non-custodial. No one — not Nectar Pay, not the hive — can recover my funds or reverse a transaction."

State: `acks: boolean[]` initialized from `DISCLAIMERS.map(() => false)`;
gate is `acks.every(Boolean)`. A `← Back` button returns to step 1.
No acknowledgement is persisted — a reset wallet re-reads the rules.

---

## 4. Step 3 — device password + biometrics

Two password inputs (choose / confirm) and, on native only, a biometric opt-in
row (default **on**) explaining that the password lives in the iOS Keychain /
Android Keystore and is still required for sensitive actions.

`handleCreate()`:

1. Length + match checks in the component, then `createVault(mnemonic, password)`
   applies the real policy via `assertPasswordPolicy`.
2. If biometrics available and opted in → `enableBiometric(password)`; failure is
   non-fatal (toast: turn it on later in Settings).
3. `onReady(mnemonic)` hands the seed to the unlocked session, then the component
   clears its own `mnemonic`/`pass1`/`pass2` state.

### Vault creation (`src/lib/wallet/seed.ts`)

- `assertPasswordPolicy` → `src/lib/security/password-strength.ts`:
  min **10** chars, rejects a common-password list, single-char repeats and
  keyboard/number runs; scores 0-4 for a meter.
- `encryptJson({ mnemonic, createdAt }, password)` → AES-GCM-256 with a
  PBKDF2-SHA256 key at **1,000,000** iterations (blob `v: 3`, random salt + IV,
  base64 fields). Older 600k/250k blobs still decrypt and are silently
  re-encrypted upward on a successful unlock.
- `saveVault(blob)` → `localStorage["lovable-multi-wallet-vault-v1"]`.
- `rememberVaultFingerprint(mnemonic)` → first 8 bytes of `sha256(normalized
  mnemonic)` in `…-vault-fp-v1`. All per-seed state (Nectar Pay link, HD
  watermarks, caches) is scoped by this fingerprint so a wipe + fresh seed can't
  inherit another wallet's state.
- `cacheMnemonic(mnemonic)` — **process memory only**, deliberately not
  sessionStorage. A reload therefore requires re-entering the password; that's
  the accepted trade.

---

## 5. What happens after onboarding

`onReady(seed)` puts the app in the unlocked stage; the derived hive
(TXC / BTC / EVM and the rest) comes from the one mnemonic — see
`src/lib/wallet/utxo.ts`, `evm.ts`, and `NECTARPAY-LINK.md` for the merchant
link step that usually follows.

---

## 6. Porting checklist

- BIP39 checksum validation is mandatory; word-count-only checks let typo'd
  coins through and silently create an empty wallet.
- Keep the "you scanned the sticker" branch — it is the single most common
  support issue with physical coins.
- Keep the photo-upload and manual-paste fallbacks; WebView camera permission
  failures are common in APK builds.
- Never persist the plaintext mnemonic; only the encrypted blob.
- Keep the seed fingerprint, or per-wallet state will leak across seeds.

## 7. Known nit

`OnboardScreen.handleCreate` pre-checks `pass1.length < 8`, while the real
policy floor is `MIN_PASSWORD_LENGTH = 10`. Passwords of 8-9 chars pass the
component check and then fail inside `createVault` with the policy message.
Use `MIN_PASSWORD_LENGTH` in the component when porting.
