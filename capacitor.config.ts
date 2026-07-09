import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the Beekeeper wallet native app.
 *
 * The web app is served from TanStack Start's static SPA output.
 * `bun run build` runs vite build and then `scripts/generate-capacitor-index.mjs`
 * to render the SPA shell into `dist/client/index.html` — the native webview
 * entry point.
 *
 * SECURITY: a release build MUST bundle the web assets inside the binary and
 * NOT load them from a remote URL. Loading `server.url` at runtime means the
 * store binary is a thin shell that executes whatever JavaScript the server
 * serves at launch, so a server/CDN compromise or one bad deploy can push code
 * that steals seed phrases from every user. Default here is BUNDLED. To
 * live-reload against a remote preview during development only, set
 * `BEEKEEPER_REMOTE_URL`. Never ship a release with it set.
 *
 * MIGRATION-CRITICAL: `hostname` is kept at "beekeeper.honest.money" with the
 * https scheme so the bundled build serves its assets under the SAME origin
 * the web build uses. localStorage (the encrypted vault
 * `lovable-multi-wallet-vault-v1`) is keyed by origin — if the origin changed
 * (e.g. to capacitor://localhost), existing users' wallets would become
 * unreadable and they'd have to re-import from seed. DO NOT change `hostname`
 * without a data-migration plan.
 */
const REMOTE_URL = process.env.BEEKEEPER_REMOTE_URL;
const WEBVIEW_HOSTNAME = "beekeeper.honest.money";

const config: CapacitorConfig = {
  appId: "money.honest.beekeeper",
  appName: "Beekeeper",
  webDir: "dist/client",
  backgroundColor: "#0D1B33",
  server: {
    ...(REMOTE_URL ? { url: REMOTE_URL } : {}),
    hostname: REMOTE_URL ? new URL(REMOTE_URL).hostname : WEBVIEW_HOSTNAME,
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
    allowNavigation: [],
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0D1B33",
  },
  android: {
    backgroundColor: "#0D1B33",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 900,
      backgroundColor: "#0D1B33",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0D1B33",
    },
  },
};

export default config;
