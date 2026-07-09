/**
 * Overwrites ios/App/App/Info.plist with Beekeeper's required strings
 * (Face ID, camera usage) and locks the target to iPhone-only. Idempotent.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const iosDir = resolve(root, "ios");
const infoPlistPath = resolve(root, "ios/App/App/Info.plist");
const iosGitignorePath = resolve(root, "ios/.gitignore");
const pbxprojPath = resolve(root, "ios/App/App.xcodeproj/project.pbxproj");

if (!existsSync(iosDir)) {
  console.log("iOS project not present; skipping native hardening.");
  process.exit(0);
}

const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CAPACITOR_DEBUG</key>
\t<string>$(CAPACITOR_DEBUG)</string>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>en</string>
\t<key>CFBundleDisplayName</key>
\t<string>Beekeeper</string>
\t<key>CFBundleExecutable</key>
\t<string>$(EXECUTABLE_NAME)</string>
\t<key>CFBundleIdentifier</key>
\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundleName</key>
\t<string>$(PRODUCT_NAME)</string>
\t<key>CFBundlePackageType</key>
\t<string>APPL</string>
\t<key>CFBundleShortVersionString</key>
\t<string>$(MARKETING_VERSION)</string>
\t<key>CFBundleVersion</key>
\t<string>$(CURRENT_PROJECT_VERSION)</string>
\t<key>ITSAppUsesNonExemptEncryption</key>
\t<false/>
\t<key>LSRequiresIPhoneOS</key>
\t<true/>
\t<key>NSCameraUsageDescription</key>
\t<string>Beekeeper uses the camera to scan wallet address and payment QR codes.</string>
\t<key>NSFaceIDUsageDescription</key>
\t<string>Beekeeper uses Face ID to unlock your wallet.</string>
\t<key>UILaunchStoryboardName</key>
\t<string>LaunchScreen</string>
\t<key>UIMainStoryboardFile</key>
\t<string>Main</string>
\t<key>UIRequiredDeviceCapabilities</key>
\t<array>
\t\t<string>arm64</string>
\t</array>
\t<key>UISupportedInterfaceOrientations</key>
\t<array>
\t\t<string>UIInterfaceOrientationPortrait</string>
\t</array>
\t<key>UISupportedInterfaceOrientations~ipad</key>
\t<array>
\t\t<string>UIInterfaceOrientationPortrait</string>
\t\t<string>UIInterfaceOrientationLandscapeLeft</string>
\t\t<string>UIInterfaceOrientationLandscapeRight</string>
\t</array>
\t<key>UIViewControllerBasedStatusBarAppearance</key>
\t<true/>
</dict>
</plist>
`;

await writeFile(infoPlistPath, infoPlist);

if (existsSync(iosGitignorePath)) {
  const current = await readFile(iosGitignorePath, "utf8");
  const next = current
    .split("\n")
    .filter((line) => line.trim() !== "App/App/capacitor.config.json")
    .join("\n")
    .replace(/\n*$/, "\n");
  await writeFile(iosGitignorePath, next);
}

if (existsSync(pbxprojPath)) {
  const pbx = await readFile(pbxprojPath, "utf8");
  const patched = pbx.replace(/TARGETED_DEVICE_FAMILY = "1,2";/g, 'TARGETED_DEVICE_FAMILY = "1";');
  if (patched !== pbx) await writeFile(pbxprojPath, patched);
}

console.log("Hardened iOS native shell for Beekeeper.");
