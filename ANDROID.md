# Android setup (Play Store + APK sideload)

The Lovable sandbox can't run `cap add android` (no Android SDK). Run this on
your Mac / Linux box after pulling the latest `main`:

```bash
bun run android:setup     # installs deps, builds web, adds android/, syncs, patches manifest, opens Android Studio
```

Or the one-shot APK build (no Android Studio needed, just a JDK + Android SDK):

```bash
bun run android:apk       # debug-signed APK at android/app/build/outputs/apk/debug/app-debug.apk
```

## Automated APK builds (GitHub Actions)

Two workflows ship in `.github/workflows/`:

- **`android-apk.yml`** — builds an installable APK
  - push to the `android` branch → APK artifact
  - `git tag android-vX.Y.Z && git push --tags` → release APK + GitHub Release
  - manual "Run workflow" → choose `debug` or `release`
  - No secrets? Falls back to debug signing (still sideloadable for testing).

- **`generate-keystore.yml`** — one-time helper. Run manually to generate a
  release keystore + the four `ANDROID_*` secrets you paste into repo settings.
  Download the `.jks` artifact and store it safely (1Password + offline). If
  you lose it you can never update existing installs on the Play Store.

## First APK on your device

1. Push a branch called `android` (any commit works).
2. Open the Actions tab → **Android APK** run → download the artifact.
3. Transfer the `.apk` to your phone and sideload it (allow "Install unknown
   apps" for the source).

## Signing / release

- App ID: `money.honest.beekeeper`
- Generate a keystore via the `Generate Android Keystore` workflow.
- Add these repo secrets so `android-apk.yml` produces a signed APK/AAB:
  - `ANDROID_KEYSTORE_BASE64`
  - `ANDROID_STORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`
- For Play Store bundle: locally run `cd android && ./gradlew bundleRelease`
  → `android/app/build/outputs/bundle/release/app-release.aab`.
