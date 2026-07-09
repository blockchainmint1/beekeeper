# Package Beekeeper as native iOS / Android app

Port HME Mobile's proven Capacitor setup — already through a security audit and shipping to TestFlight — into this project, adapted for the Beekeeper wallet (multi-chain, `lovable-multi-wallet-vault-v1` keystore).

## What ships

**Native shell**
- Capacitor 8 wrapping the current TanStack Start web app
- iOS project → `.ipa` for TestFlight / App Store
- Android project → signed `.apk` (sideload) and `.aab` (Play Store)
- Same web bundle runs unchanged in browser, PWA, and native

**Security posture (adopted verbatim from HME's audit)**
- Bundled web assets (no `server.url` in release) — store binary never runs remote code
- Stable WebView origin so the existing encrypted vault (`lovable-multi-wallet-vault-v1`) keeps unlocking after install
- Biometric unlock (Face ID / Touch ID / Android fingerprint) via Keychain / Keystore
- CSP already in place stays in place

**Native niceties**
- Face ID / Touch ID unlock on the UnlockScreen
- Haptics on send success / failure
- Native share sheet on Receive
- Native QR scanner (way faster than webcam) for the Scan dialog
- Safe-area padding, status bar theming, keyboard resize
- Deep-link handler stub (ready for future `beekeeper://` or Nectar tap-to-pay)

## Identity

| | Proposed |
|---|---|
| Bundle ID | `money.honest.beekeeper` |
| Display name | `Beekeeper` |
| WebView hostname | `beekeeper.honest.money` (stable origin — critical for vault continuity) |
| Theme color | `#0b0f14` (matches current dark theme) |

**Confirm before I generate:** bundle ID and display name. Everything else follows.

## Files to add

**Config / scripts**
```text
capacitor.config.ts                       # bundled, stable hostname, allowNavigation locked
scripts/generate-capacitor-index.mjs      # renders TanStack SPA shell → dist/client/index.html
scripts/patch-android-manifest.mjs        # perms (CAMERA, USE_BIOMETRIC), deep-link filters
scripts/patch-android-icons.mjs           # adaptive icons from brand mark
scripts/harden-ios-native.mjs             # Info.plist (NSFaceID/Camera usage), deployment target
.github/workflows/android-apk.yml         # CI builds signed APK
.github/workflows/generate-keystore.yml   # one-shot helper to generate release keystore
package.json                              # add: build, cap:sync, cap:assets, ios:setup, ios:reset,
                                          #      android:setup, android:apk, android:reset, ios:harden
assets/icon.png (1024×1024)               # I'll generate from Beekeeper brand
assets/splash.png (2732×2732)             # I'll generate
```

**Web-layer glue (`src/lib/native/*`)**
```text
platform.ts      # isNative() / nativePlatform() guards
biometric.ts     # Face ID / Touch ID enable / disable / unlockWithBiometric()
ui.ts            # hapticSuccess/Error/Tap, shareText, initNativeChrome, hideSplash
deeplink.ts      # App URL listener stub (no-op until we wire a scheme)
```

**Component wiring**
```text
src/routes/__root.tsx           # call initNativeChrome() + hideSplash() on mount
src/components/wallet/UnlockScreen.tsx    # "Unlock with Face ID" button when enabled
src/components/wallet/SettingsDialog.tsx  # toggle to enable/disable biometrics
src/components/wallet/QrScanDialog.tsx    # use BarcodeScanner on native, webcam on web
src/components/wallet/ReceiveDialog.tsx   # use shareText() instead of copy-only
src/components/wallet/SendDialog.tsx      # hapticSuccess/hapticError on result
src/styles.css                            # safe-area-inset padding on root shell
```

**Docs**
```text
CAPACITOR.md   # how to build iOS/Android locally
ANDROID.md     # CI workflow + keystore instructions
```

## Deps to add
```text
@capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
@capacitor/app @capacitor/haptics @capacitor/share @capacitor/status-bar
@capacitor/keyboard @capacitor/splash-screen @capacitor/clipboard
@capacitor/browser @capacitor/network
@capacitor-community/barcode-scanner
@aparajita/capacitor-biometric-auth
@aparajita/capacitor-secure-storage
@capacitor/assets (dev)
```

## Critical invariants

1. **Do not change `server.hostname` after first release.** localStorage is keyed by origin. Changing the WebView origin orphans every user's encrypted vault. Fixed at `beekeeper.honest.money` from day one.
2. **No `server.url` in release builds.** Loading remote JS = store rejection + supply-chain risk. Dev-only via `BEEKEEPER_REMOTE_URL` env var.
3. **Biometric stores the password, not the seed.** Same design as HME — the vault stays encrypted with the user's password; biometrics gates a Keychain read that hands the password back to the existing unlock flow. Password remains the recovery path.
4. **Sandbox can't run `cap add ios/android`.** I add config + scripts + CI. You (on a Mac / Linux box) run `bun run ios:setup` and `bun run android:setup` once to generate the native projects, then commit them.

## What you'll need on your end (I can't do these)

- **iOS build:** a Mac with Xcode + Apple Developer account ($99/yr) to archive and upload to TestFlight
- **Android release:** run the "Generate Android Keystore" GitHub Action once, save the `.jks` in 1Password, paste the four `ANDROID_*` secrets into repo settings — then every push to the `android` branch produces a signed APK artifact
- **Play Store:** $25 one-time developer account (only if you want Play Store distribution — APK sideload works without it)

## Rollout order (single turn)

1. Add deps → 2. Config + scripts → 3. `src/lib/native/*` → 4. Wire biometric into UnlockScreen + settings → 5. Wire haptics/share/scan → 6. Generate icon + splash → 7. Root layout: safe-area + initNativeChrome + hideSplash → 8. CI workflows → 9. Docs.

I won't touch business logic, chain code, or the vault format. Vault stays where it is; native shell just wraps it.

---

**Confirm to proceed:**
- Bundle ID `money.honest.beekeeper`?
- Display name `Beekeeper`?
- OK to generate a new brand icon + splash from the current Beekeeper visual identity (I'll match the honeycomb / amber theme), or do you have existing 1024×1024 PNGs you want me to use?