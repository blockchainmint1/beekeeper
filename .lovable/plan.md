# Copper Coin onboarding + Nectar Pay link

Rewrite first-run setup so the **only** way to create a wallet is by scanning a 24-word Cold Storage Coin ("Copper Coin") QR. Once linked, the existing password unlock flow continues to work for repeat visits.

## 1. Scan-only onboarding

Replace the current `OnboardScreen` tab layout (Create / Import / Restore) with a single linear flow:

```text
[Step 1: Scan]  →  [Step 2: Disclaimers]  →  [Step 3: Password]  →  [Step 4: Link Nectar Pay]  →  Wallet
```

- **Step 1 — Scan Copper Coin**
  Big "Scan your Copper Coin" button → opens existing `QrScanDialog`. Expect plain text: 24 space-separated BIP39 words. Validate via `isValidMnemonic`; reject 12-word phrases with a clear error ("Copper Coin must be 24 words"). Hold the mnemonic in component state only — never display the words back on screen.
  Small "I don't have one yet" link → external info page (placeholder URL for now).

- **Step 2 — Disclaimers** (all 4 checkboxes required to continue)
  1. I understand my Copper Coin is my only backup. If I lose it, my account is gone forever.
  2. I will keep my Copper Coin safe. Anyone who finds it has unlimited access to my funds. I will store it in a safe or safe deposit box.
  3. I will never share my Copper Coin. No support agent, no app, no website will ever ask me to scan it elsewhere. It is for me only.
  4. I understand this wallet is non‑custodial. No one — not AOCS, not Nectar Pay — can recover my funds or reverse a transaction.

- **Step 3 — Set device password**
  Same min-8-char password + confirm. Calls existing `createVault(mnemonic, password)`. This is what's used for future unlocks on this device.

- **Step 4 — Link Nectar Pay** (see section 3 below)

## 2. Xpub derivation

Immediately after `createVault`, derive in memory (no UI for this step — runs in the background while the user reaches Step 4):

- **BTC** — `utxoAccountXpub(mnemonic, btcChain)` → native `xpub` at `m/84'/0'/0'` (or `m/44'/0'/0'` per current default).
- **TXC** — `utxoAccountXpub(mnemonic, txcChain)` → xpub at TXC's configured BIP44 base.
- **EVM** — `evmAccountXpub(mnemonic)` → BIP32 xpub at `m/44'/60'/0'` (already supported by `chainAccountXpub`).

Bundle into:

```ts
type NectarPayload = {
  version: 1;
  btc:  { xpub: string; path: string };
  txc:  { xpub: string; path: string };
  evm:  { xpub: string; path: string };
};
```

Xpubs are public — safe to send over HTTPS. The mnemonic never leaves the device.

## 3. Nectar Pay linking (wallet scans Nectar's QR)

- "Link your Nectar Pay merchant account" screen with two buttons:
  - **Scan Nectar Pay QR** → reuses `QrScanDialog`.
  - **Skip for now** (link later from Settings).

- Expected QR payload — JSON (with a fallback for a plain URL):

  ```json
  { "nectar": "merchant-link", "v": 1, "url": "https://nectar.pay/api/merchants/{id}/link", "token": "one-time-token" }
  ```

  If the QR is a plain `https://…` URL, treat it as `url` with no token.

- Wallet POSTs `NectarPayload` to `url` with `Authorization: Bearer {token}` (if present). Show success toast with the merchant name returned in the response, or a clear error if the request fails. Failures keep the user on this step so they can retry or skip.

- Persist link status (merchant id + linked-at timestamp) inside the vault metadata so Settings can show "Linked to Nectar Pay merchant XYZ" and offer "Re-link" / "Unlink".

- Add a **Settings → Nectar Pay** entry that re-runs the same scan-and-POST flow at any time, and a manual "Show my xpubs" view (already exists per chain via `XpubDialog`) plus a new "Show all 3 as one QR" option that encodes `NectarPayload` directly — useful if Nectar Pay's UI prefers to scan us.

## 4. Repeat visits

No change to `UnlockScreen` — once a vault exists locally, the user enters their password as today. The Copper Coin scan is only ever required when no vault exists (fresh install, cleared storage, new device).

If `getCachedMnemonic()` exists but `localStorage` has no Nectar link record, surface a non-blocking banner inside the wallet: "Finish linking your Nectar Pay merchant account →".

## Files to change / add

- `src/components/wallet/OnboardScreen.tsx` — rewrite into the 4-step linear flow; delete Create / Import / Restore tabs.
- `src/lib/wallet/nectar.ts` *(new)* — `buildNectarPayload(mnemonic)`, `parseNectarQr(text)`, `linkNectarMerchant(payload, target)`, plus local persistence helpers.
- `src/components/wallet/NectarLinkDialog.tsx` *(new)* — reusable link flow (used in onboarding step 4 and from Settings).
- `src/components/wallet/SettingsDialog.tsx` — add "Nectar Pay" section (status + re-link/unlink + "show combined xpub QR").
- `src/components/wallet/Wallet.tsx` — add the "finish linking" banner when vault exists but no link record.
- `src/lib/wallet/seed.ts` — leave `createMnemonic` exported but stop calling it from the UI. No vault-shape changes needed.

## Open items I'll assume unless you say otherwise

- Nectar Pay endpoint contract (URL shape, auth header, response body). I'll code against the JSON shape above and put the actual base URL behind a constant we can swap once you have it.
- "Skip linking" is allowed — users can finish later from Settings. Tell me if linking must be mandatory before the wallet opens.
- No additional disclaimers beyond the 4 above. Add more here if you want them.
