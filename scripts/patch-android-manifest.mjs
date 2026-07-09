#!/usr/bin/env node
/**
 * Applies Beekeeper-specific tweaks to android/app/src/main/AndroidManifest.xml
 * after `bunx cap add android`. Idempotent — safe to re-run.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml");
if (!existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}. Run \`bunx cap add android\` first.`);
  process.exit(1);
}

let xml = readFileSync(manifestPath, "utf8");
const original = xml;

const permissions = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-permission android:name="android.permission.USE_BIOMETRIC" />',
  '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
  '<uses-permission android:name="android.permission.VIBRATE" />',
];

for (const line of permissions) {
  if (!xml.includes(line)) {
    xml = xml.replace(/<application\b/, `    ${line}\n\n    <application`);
  }
}

if (xml === original) {
  console.log("AndroidManifest.xml already patched — no changes.");
} else {
  writeFileSync(manifestPath, xml);
  console.log("Patched AndroidManifest.xml (permissions).");
}
