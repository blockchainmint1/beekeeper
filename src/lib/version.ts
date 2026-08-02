/**
 * Single source of truth for the shipped app version.
 *
 * Keep in step with:
 *   - iOS      → MARKETING_VERSION / CURRENT_PROJECT_VERSION in Xcode
 *   - Android  → versionName / versionCode in android/app/build.gradle
 *
 * APP_BUILD is the integer build number; bump it on every store submission
 * even when APP_VERSION is unchanged.
 */
export const APP_VERSION = "1.0.0";
export const APP_BUILD = 1;
export const APP_NAME = "Beekeeper";

export function versionLabel(): string {
  return `${APP_NAME} ${APP_VERSION} (${APP_BUILD})`;
}
