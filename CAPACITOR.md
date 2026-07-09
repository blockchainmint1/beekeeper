# Beekeeper — Native (Capacitor) builds

The web app also ships as a native iOS/Android binary via
[Capacitor](https://capacitorjs.com). The same web bundle runs in browser,
PWA, and native. Native adds Face ID / Touch ID unlock backed by Keychain /
Keystore, haptics, native share sheet, and native permissions plumbing.

## One-time setup (on your Mac / Linux box)

```bash
bun install
bun run build
bunx cap add ios
bunx cap add android
```

This generates `ios/` and `android/` projects. Commit them to whichever repo
you ship from.

## Build + sync the web bundle into the native projects

```bash
bun run cap:sync        # = bun run build && bunx cap sync
```

`bun run build` runs `vite build` and then renders the TanStack Start SPA
shell to `dist/client/index.html`. That is the file Capacitor loads as its
native-webview entry point.

## Convenience scripts

```bash
bun run ios:setup       # first time: install, build, cap add ios, assets, harden, open Xcode
bun run ios:reset       # nuke ios/ and rebuild from scratch
bun run android:setup   # first time: install, build, cap add android, patch, open Android Studio
bun run android:reset   # nuke android/ and rebuild
bun run android:apk     # one-shot debug APK build (no Android Studio needed, just JDK + SDK)
bun run cap:assets      # regenerate every icon + splash size from assets/icon.png + assets/splash.png
```

## Generate app icons and splash screens

Source PNGs live in `assets/`:
- `assets/icon.png` (1024×1024, no transparency, no rounded corners — iOS masks it)
- `assets/splash.png` (2732×2732)

After the native projects exist:

```bash
bun run cap:assets
```

Re-run any time you change the source PNGs.

## CRITICAL invariants

1. **Do not change `server.hostname` in `capacitor.config.ts`.** localStorage
   is keyed by origin. The stable hostname `beekeeper.honest.money` matches
   the web origin so the existing encrypted vault
   (`lovable-multi-wallet-vault-v1`) keeps unlocking. Changing this after
   first release would orphan every user's wallet.

2. **Never ship a release with `server.url` set** (or `BEEKEEPER_REMOTE_URL`
   env var). Release binaries must bundle their JS — loading remote code is
   an App Store rejection and a supply-chain risk. Use `BEEKEEPER_REMOTE_URL`
   only for local dev live-reload.

## Required native permissions

Both iOS `Info.plist` and Android `AndroidManifest.xml` are patched
automatically by `scripts/harden-ios-native.mjs` and
`scripts/patch-android-manifest.mjs`. Contents:

- iOS: `NSFaceIDUsageDescription`, `NSCameraUsageDescription`,
  `ITSAppUsesNonExemptEncryption=false`, iPhone-only.
- Android: `CAMERA`, `USE_BIOMETRIC`, `ACCESS_NETWORK_STATE`, `VIBRATE`.

## iOS pre-flight checklist for TestFlight

- [ ] `bun run cap:assets` re-ran after latest icon/splash edits
- [ ] `assets/icon.png` has no transparency and no rounded corners
- [ ] Info.plist includes NSFaceIDUsageDescription (missing = crash on first Face ID prompt)
- [ ] Deployment target ≥ iOS 14 (biometric-auth plugin requirement)
- [ ] Encryption Export Compliance: "Yes, uses encryption" → "No, only exempt encryption
      (standard iOS APIs and open-source algorithms)". No ERN required — Beekeeper uses
      only AES-GCM + secp256k1.
- [ ] Kill-and-relaunch after enabling biometric unlock — Face ID prompt appears on cold-start

## Store identity

- App ID: `money.honest.beekeeper`
- Display name: `Beekeeper`
- Icon: `assets/icon.png`
- Splash: `assets/splash.png`
