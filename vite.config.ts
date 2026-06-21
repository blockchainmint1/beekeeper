// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const rpcWebsocketsBrowserEntry = fileURLToPath(
  new URL("./node_modules/rpc-websockets/dist/index.browser.mjs", import.meta.url),
);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      // rpc-websockets (transitive via @solana/web3.js) publishes a broken
      // package export map: it has "browser"/"node" at the top level instead
      // of a "." entry. Some production resolvers reject that before falling
      // back to main/module, so bypass the package entry map entirely.
      alias: [{ find: "rpc-websockets", replacement: rpcWebsocketsBrowserEntry }],
      conditions: ["browser", "import", "module", "default"],
    },
    ssr: {
      resolve: {
        conditions: ["node", "import", "module", "default"],
        externalConditions: ["node", "import", "module", "default"],
      },
    },
    plugins: [
      // bitcoinjs-message / ripemd160 / cipher-base / etc. expect Node's
      // Buffer / stream / crypto in the browser. Polyfill them so the
      // production bundle ships a real Buffer instead of Vite's stub.
      nodePolyfills({
        include: ["buffer", "stream", "util", "events", "string_decoder", "crypto"],
        globals: { Buffer: true, global: true, process: true },
        protocolImports: true,
      }),
    ],
  },
});
