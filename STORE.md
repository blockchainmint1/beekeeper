# Store submission pack — Beekeeper

Everything the App Store and Play Console will ask for. Copy/paste ready.

- **App name:** Beekeeper
- **Subtitle / short description:** Self-custody wallet for honest money
- **Bundle / App ID:** `money.honest.beekeeper`
- **Version:** see `src/lib/version.ts` (single source of truth — the Android
  patch script writes `versionName` / `versionCode` from it)
- **Category:** Finance (secondary: Utilities)
- **Content rating:** 4+ / Everyone. No ads, no UGC, no gambling.
- **Price:** Free, no in-app purchases.

## Required URLs

| Field | URL |
| --- | --- |
| Privacy Policy | https://beekeeper.money/privacy |
| Terms of Use (EULA) | https://beekeeper.money/terms |
| Support URL | https://beekeeper.money |
| Marketing URL | https://honest.money |
| Support email | hello@honest.money |

## Description (long)

> Beekeeper is a self-custody wallet built for people who actually get paid in
> crypto — small businesses, market stalls, freelancers, and anyone who'd rather
> hold their own money than ask permission to spend it.
>
> Scan your recovery coin, set a password, and the hive comes to life: TEXITcoin
> and its Omni layer-2 tokens, Bitcoin, Ethereum, Base, BNB Chain, Litecoin,
> Bitcoin Cash, Dogecoin, Dash, and the major stablecoins — all from one seed.
>
> • Your keys never leave your device. The wallet is encrypted with your
>   password and can be unlocked with Face ID or fingerprint.
> • No account, no email, no ID check, no KYC queue.
> • One balance screen that adds up every chain and every derived address.
> • Send, receive, scan payment QR codes, and keep a contacts book.
> • Link a NectarPay merchant account with watch-only extended public keys, so
>   your storefront can generate receive addresses it can never spend from.
> • Zero platform fees — you pay only the network fee the blockchain charges.
>
> Beekeeper is part of the honest.money ecosystem. Learn about the TEXITcoin
> blockchain and the Omni layer 2 at texitcoin.org/build.
>
> Beekeeper is non-custodial software. We never hold your funds and cannot
> recover your wallet, reverse a transaction, or reset your password. Back up
> your recovery phrase offline.

## Keywords (App Store, 100 char max)

`wallet,crypto,bitcoin,self custody,texitcoin,stablecoin,usdt,usdc,merchant,payments`

## Release notes (1.0.0)

> First public release. Self-custody wallet for TEXITcoin, Bitcoin, Ethereum,
> Base, BNB Chain, Litecoin, Bitcoin Cash, Dogecoin and Dash, with stablecoin
> support, biometric unlock, QR scanning, and NectarPay merchant linking.

## Permission justifications (paste into review notes)

- **Camera** — only to read QR codes: recovery coin, wallet addresses, payment
  requests, signing requests, merchant-link requests. Frames are processed
  on-device and never stored or uploaded. String: *"Beekeeper uses the camera to
  scan wallet address and payment QR codes."*
- **Face ID / biometrics** — to unlock the locally encrypted wallet. The
  password is stored in the OS Keychain / Keystore. String: *"Beekeeper uses
  Face ID to unlock your wallet."*
- **Network** — public blockchain nodes, block explorers and price feeds.

## Apple review notes

> Beekeeper is a non-custodial wallet. There is no account system and nothing to
> sign into, so no demo credentials are needed — the app opens straight to the
> setup screen.
>
> To review the full app, tap "Scan my copper coin" and scan (or paste) a BIP-39
> test recovery phrase. Any standard 12- or 24-word phrase works; an empty test
> wallet is fine — every screen renders with zero balances.
>
> We do not generate or display a recovery phrase inside the app: users bring an
> existing phrase from a metal backup coin, which is why there is no seed-backup
> screenshot flow to review.
>
> The app does not exchange currency, take deposits, or provide financial
> services. It signs transactions locally and broadcasts them to public
> blockchains. There are no in-app purchases and no platform fees.

## Play Console Data safety answers

- Data collected: **none**. Data shared: **none**.
- No data is collected or transmitted to us: no personal info, no financial
  info, no identifiers, no app activity, no analytics, no crash-reporting SDK,
  no advertising ID.
- Data is encrypted in transit (HTTPS only, cleartext disabled).
- Users can request deletion: all data is local — Settings → Danger zone →
  "Erase wallet from this browser", or uninstalling the app.

## Play Console Financial-features declaration

- Declare: **cryptocurrency wallet — non-custodial**.
- Not a custodial exchange, not a licensed money transmitter, no fiat on-ramp.
- Supporting docs: link https://beekeeper.money/terms and
  https://beekeeper.money/privacy.

## Assets

Source art lives in `resources/` and is expanded to every required size by
`bun run cap:assets` (`@capacitor/assets`).

| File | Size | Used for |
| --- | --- | --- |
| `resources/icon.png` | 1024×1024 | iOS + Android app icon, adaptive icon |
| `resources/splash.png` | 2732×2732 | launch screen (light) |
| `resources/splash-dark.png` | 2732×2732 | launch screen (dark) |
| `public/favicon.png` | 64×64 | web |

Store listing graphics still needed by hand:
- Play feature graphic 1024×500.
- iPhone 6.7" screenshots (1290×2796) ×3–5, and 6.5" (1284×2778) if required.
- Android phone screenshots ×2–8, 16:9 or 9:16, min 1080px on the long edge.

Suggested screenshot set (all render with an empty wallet):
1. Activation screen — "Activate your Beekeeper Wallet".
2. Total balance with breakdown expanded (TXC / ETH / Base / BSC / BTC).
3. Receive screen with QR.
4. Send screen with QR scan.
5. Settings → chains list.

## Build commands

```bash
# iOS (needs macOS + Xcode)
bun run ios:setup            # adds ios/, generates assets, hardens Info.plist
# then: Xcode → Product → Archive → Distribute to App Store Connect

# Android debug APK for sideloading
bun run android:apk

# Android release AAB for the Play Store
export ANDROID_KEYSTORE_PATH=/absolute/path/beekeeper-release.jks
export ANDROID_STORE_PASSWORD=...
export ANDROID_KEY_ALIAS=beekeeper
export ANDROID_KEY_PASSWORD=...
bun run android:aab          # → android/app/build/outputs/bundle/release/app-release.aab
```

> Release builds must bundle the web assets (the default). Never ship with
> `BEEKEEPER_REMOTE_URL` set — that would make the store binary run whatever
> JavaScript a server hands it at launch.

## Pre-submission checklist

- [ ] `src/lib/version.ts` bumped (`APP_BUILD` always increments).
- [ ] `bun run build` clean.
- [ ] `bun run android:patch` reports FLAG_SECURE + signing applied.
- [ ] Privacy, Terms and Manifesto pages live on the published domain.
- [ ] Keystore backed up offline (losing it means no more Play updates, ever).
- [ ] Tested on a real device: scan, unlock with biometrics, send, receive.
