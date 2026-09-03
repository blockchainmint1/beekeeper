#!/usr/bin/env node
/**
 * Applies Beekeeper-specific tweaks to the generated Android project after
 * `bunx cap add android`. Idempotent — safe to re-run.
 *
 *  1. AndroidManifest.xml — camera / biometric / network permissions.
 *  2. MainActivity.java    — FLAG_SECURE so the OS never screenshots or shows
 *                            the wallet in the recents thumbnail, and screen
 *                            recording / mirroring is blocked.
 *  3. build.gradle         — versionName / versionCode from src/lib/version.ts,
 *                            plus a release signingConfig driven by env vars.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const root = process.cwd();
const androidDir = resolve(root, "android");
if (!existsSync(androidDir)) {
  console.error("android/ not found. Run `bunx cap add android` first.");
  process.exit(1);
}

/* ------------------------------------------------------------------ version */
const versionSrc = readFileSync(resolve(root, "src/lib/version.ts"), "utf8");
const APP_VERSION = /APP_VERSION\s*=\s*"([^"]+)"/.exec(versionSrc)?.[1] ?? "1.0.0";
const APP_BUILD = Number(/APP_BUILD\s*=\s*(\d+)/.exec(versionSrc)?.[1] ?? "1");

/* --------------------------------------------------------------- manifest */
const manifestPath = resolve(androidDir, "app/src/main/AndroidManifest.xml");
let xml = readFileSync(manifestPath, "utf8");
const beforeXml = xml;

const permissions = [
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-permission android:name="android.permission.USE_BIOMETRIC" />',
  '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
  '<uses-permission android:name="android.permission.VIBRATE" />',
];
for (const line of permissions) {
  if (!xml.includes(line)) xml = xml.replace(/<application\b/, `    ${line}\n\n    <application`);
}
if (xml !== beforeXml) {
  writeFileSync(manifestPath, xml);
  console.log("✓ AndroidManifest.xml permissions");
} else {
  console.log("· AndroidManifest.xml already patched");
}

/* -------------------------------------------------------- FLAG_SECURE */
function findMainActivity(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      const hit = findMainActivity(p);
      if (hit) return hit;
    } else if (entry === "MainActivity.java") {
      return p;
    }
  }
  return null;
}

const activityPath = findMainActivity(resolve(androidDir, "app/src/main/java"));
if (!activityPath) {
  console.warn("! MainActivity.java not found — FLAG_SECURE not applied");
} else {
  let java = readFileSync(activityPath, "utf8");
  if (java.includes("FLAG_SECURE")) {
    console.log("· FLAG_SECURE already applied");
  } else {
    if (!java.includes("import android.os.Bundle;")) {
      java = java.replace(
        /(package [^\n]+\n)/,
        "$1\nimport android.os.Bundle;\nimport android.view.WindowManager;\n",
      );
    } else if (!java.includes("import android.view.WindowManager;")) {
      java = java.replace(
        "import android.os.Bundle;",
        "import android.os.Bundle;\nimport android.view.WindowManager;",
      );
    }

    const onCreate = `
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Block screenshots, screen recording and the recents-screen thumbnail.
        // A wallet must never leak a recovery phrase or balance to the OS cache.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
        super.onCreate(savedInstanceState);
    }
`;
    // Insert right after the class opening brace.
    java = java.replace(/(class MainActivity[^{]*\{)/, `$1${onCreate}`);
    writeFileSync(activityPath, java);
    console.log("✓ FLAG_SECURE applied to MainActivity");
  }
}

/* ---------------------------------------------------- version + signing */
const gradlePath = resolve(androidDir, "app/build.gradle");
let gradle = readFileSync(gradlePath, "utf8");
const beforeGradle = gradle;

// CI supplies release-specific values after the web bundle is built. Read them
// here so Capacitor App.getInfo() reports the actual installed APK identity.
gradle = gradle.replace(
  /versionCode\s+(?:\d+|\(?System\.getenv\("VERSION_CODE"\)[^\n]*)/,
  `versionCode Integer.parseInt(System.getenv("VERSION_CODE") ?: "${APP_BUILD}")`,
);
gradle = gradle.replace(
  /versionName\s+(?:"[^"]*"|System\.getenv\("VERSION_NAME"\)[^\n]*)/,
  `versionName System.getenv("VERSION_NAME") ?: "${APP_VERSION}"`,
);

if (!gradle.includes("BEEKEEPER_SIGNING")) {
  const signing = `
    // BEEKEEPER_SIGNING — release signing driven by environment variables so no
    // keystore or password is ever committed. Set ANDROID_KEYSTORE_PATH,
    // ANDROID_STORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
    signingConfigs {
        release {
            def ksPath = System.getenv("ANDROID_KEYSTORE_PATH")
            if (ksPath != null && !ksPath.isEmpty()) {
                storeFile file(ksPath)
                storePassword System.getenv("ANDROID_STORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
`;
  gradle = gradle.replace(/(\n\s*buildTypes\s*\{)/, `${signing}$1`);
  gradle = gradle.replace(
    /(buildTypes\s*\{\s*release\s*\{)/,
    `$1
            if (System.getenv("ANDROID_KEYSTORE_PATH") != null) {
                signingConfig signingConfigs.release
            }`,
  );
}

if (gradle !== beforeGradle) {
  writeFileSync(gradlePath, gradle);
  console.log(`✓ build.gradle → ${APP_VERSION} (${APP_BUILD}) + release signingConfig`);
} else {
  console.log("· build.gradle already patched");
}
