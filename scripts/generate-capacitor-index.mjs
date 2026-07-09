/**
 * After `vite build`, render the TanStack Start SPA shell at "/" and write
 * dist/client/index.html — the native webview entry Capacitor loads. Also
 * mirrors the built assets so `bunx cap sync` always finds them in dist/client
 * even if the adapter wrote them under .output/public.
 *
 * Adapted from HME Mobile's script for Beekeeper.
 */
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const capacitorWebDir = resolve(root, "dist/client");
const iosWebDir = resolve(root, "ios/App/App/public");
const iosConfigPath = resolve(root, "ios/App/App/capacitor.config.json");
const publicCandidates = [resolve(root, "dist/client"), resolve(root, ".output/public")];
const serverCandidates = [resolve(root, "dist/server/index.mjs"), resolve(root, ".output/server/index.mjs")];

async function isDirectory(p) { try { return (await stat(p)).isDirectory(); } catch { return false; } }
async function findFirstDirectory(paths) { for (const p of paths) if (await isDirectory(p)) return p; return undefined; }
async function findFirstFile(paths) { for (const p of paths) if (existsSync(p)) return p; return undefined; }

async function renderShell(serverEntryPath, route = "/") {
  const mod = await import(pathToFileURL(serverEntryPath).href + `?t=${Date.now()}`);
  const server = mod.default ?? mod;
  if (typeof server.fetch !== "function") {
    throw new Error(`${serverEntryPath} does not export a fetch handler.`);
  }
  const response = await server.fetch(
    new Request(`http://localhost${route}`, { headers: { "X-TSS_SHELL": "true" } }),
    {},
    { waitUntil() {} },
  );
  if (!response.ok) throw new Error(`SPA shell render failed: HTTP ${response.status}`);
  const html = await response.text();
  if (!html.includes("$_TSR") || !html.includes("/assets/")) {
    throw new Error("Generated SPA shell is missing TanStack hydration data or asset links.");
  }
  return html;
}

const publicDir = await findFirstDirectory(publicCandidates);
if (!publicDir) throw new Error("No built web assets found. Run `bun run build` first.");

if (publicDir !== capacitorWebDir) {
  await mkdir(dirname(capacitorWebDir), { recursive: true });
  await cp(publicDir, capacitorWebDir, { recursive: true, force: true });
}

const serverEntryPath = await findFirstFile(serverCandidates);
if (!serverEntryPath) throw new Error("No server entry found to render the SPA shell.");

const iosExists = await isDirectory(resolve(root, "ios/App/App"));
const outputDirs = Array.from(new Set([capacitorWebDir, publicDir, ...(iosExists ? [iosWebDir] : [])]));

const homeHtml = await renderShell(serverEntryPath, "/");

for (const outputDir of outputDirs) {
  if (outputDir !== publicDir) {
    await mkdir(dirname(outputDir), { recursive: true });
    await cp(publicDir, outputDir, { recursive: true, force: true });
  }
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "index.html"), homeHtml);
}

if (iosExists) {
  try {
    const cfgMod = await import(pathToFileURL(resolve(root, "capacitor.config.ts")).href + `?t=${Date.now()}`);
    const cfg = cfgMod.default ?? cfgMod;
    await mkdir(dirname(iosConfigPath), { recursive: true });
    await writeFile(iosConfigPath, `${JSON.stringify(cfg, null, 2)}\n`);
  } catch (err) {
    console.warn(`Could not stage iOS capacitor.config.json: ${err.message}`);
  }
}

console.log(`Generated Capacitor SPA entry: ${outputDirs.map((d) => `${d}/index.html`).join(", ")}`);
