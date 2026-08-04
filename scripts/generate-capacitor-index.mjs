/**
 * After `vite build`, render the TanStack Start SPA shell at "/" and write
 * dist/client/index.html — the native webview entry Capacitor loads. Also
 * mirrors the built assets so `bunx cap sync` always finds them in dist/client
 * even if the adapter wrote them under .output/public.
 *
 * Adapted from HME Mobile's script for Beekeeper.
 */
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
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

/**
 * Native-only boot watchdog. In a webview a single failed module load (bad
 * asset path, stale sync, WebKit parse error) leaves the body empty and the app
 * looks dead with no way to read the error on device. This captures early
 * errors and, if nothing has rendered after a few seconds, paints the reason
 * on screen with a reload button.
 */
const BOOT_WATCHDOG = `(function(){
var errs=[];
function push(m){try{errs.push(String(m).slice(0,400));}catch(e){}}
addEventListener("error",function(e){push(e&&e.message?e.message+" @ "+(e.filename||"")+":"+(e.lineno||0):"error");},true);
addEventListener("unhandledrejection",function(e){push("unhandled: "+((e&&e.reason&&(e.reason.message||e.reason))||"?"));});
function booted(){var b=document.body;if(!b)return false;return (b.innerText||"").trim().length>0;}
setTimeout(function(){
  if(booted())return;
  var d=document.createElement("div");
  d.setAttribute("style","position:fixed;inset:0;z-index:2147483647;padding:24px;padding-top:56px;background:#0D1B33;color:#fff;font:14px/1.5 -apple-system,system-ui,sans-serif;overflow:auto");
  d.innerHTML='<div style="font-weight:700;font-size:17px;margin-bottom:8px">Beekeeper couldn\\'t start</div>'+
    '<div style="opacity:.75;margin-bottom:14px">The app shell loaded but the interface never rendered.</div>'+
    '<pre style="white-space:pre-wrap;font:12px/1.45 ui-monospace,Menlo,monospace;background:rgba(255,255,255,.07);padding:12px;border-radius:10px;margin:0 0 16px">'+
    (errs.length?errs.join("\\n\\n"):"No JavaScript error was reported. The bundle at /assets/ may be missing from the native build (re-run: bun run build && bunx cap sync).").replace(/</g,"&lt;")+'</pre>'+
    '<button id="bk-reload" style="appearance:none;border:0;border-radius:10px;padding:12px 18px;background:#F0A81E;color:#0D1B33;font-weight:700;font-size:15px">Reload</button>';
  document.body.appendChild(d);
  var b=d.querySelector("#bk-reload");
  if(b)b.addEventListener("click",function(){location.replace("/");});
},6000);
})();`;

const rawHomeHtml = await renderShell(serverEntryPath, "/");
const homeHtml = rawHomeHtml.replace(
  "</head>",
  `<script>${BOOT_WATCHDOG}</script></head>`,
);
if (homeHtml === rawHomeHtml) throw new Error("Could not inject boot watchdog into SPA shell.");

/**
 * The native webview loads files off disk, so a hard load of a client route
 * (after a reload, a background restore, or a deep link) asks for e.g.
 * /wallet/index.html. Without that file iOS/Android render a blank error page
 * and the app looks dead. Write the same SPA shell at every route path so any
 * URL resolves, then let the router hydrate the real match.
 */
async function routeFallbackPaths() {
  const routesDir = resolve(root, "src/routes");
  const chainsSrc = await readFile(resolve(root, "src/lib/chains/index.ts"), "utf8");
  const unionMatch = chainsSrc.match(/export type ChainId =([\s\S]*?);/);
  const chainIds = [...(unionMatch?.[1] ?? "").matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
  if (chainIds.length === 0) throw new Error("Could not read ChainId union for SPA fallbacks");

  const files = (await readdir(routesDir)).filter(
    (f) => f.endsWith(".tsx") && !f.startsWith("__") && !f.startsWith("api."),
  );
  const paths = new Set();
  for (const file of files) {
    const segments = file.replace(/\.tsx$/, "").split(".");
    if (segments.some((s) => s.startsWith("_"))) continue;
    const expand = (prefix, rest) => {
      if (rest.length === 0) {
        const p = prefix.filter((s) => s !== "index").join("/");
        if (p) paths.add(p);
        return;
      }
      const [head, ...tail] = rest;
      if (head === "$chain") {
        for (const id of chainIds) expand([...prefix, id], tail);
      } else if (head.startsWith("$")) {
        // Unknown dynamic segment — no safe value to prerender.
      } else {
        expand([...prefix, head], tail);
      }
    };
    expand([], segments);
  }
  return [...paths];
}

const fallbackPaths = await routeFallbackPaths();

for (const outputDir of outputDirs) {
  if (outputDir !== publicDir) {
    await mkdir(dirname(outputDir), { recursive: true });
    await cp(publicDir, outputDir, { recursive: true, force: true });
  }
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "index.html"), homeHtml);
  for (const routePath of fallbackPaths) {
    const dir = resolve(outputDir, routePath);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, "index.html"), homeHtml);
  }
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

console.log(`SPA fallback pages: ${fallbackPaths.length} route paths`);
console.log(`Generated Capacitor SPA entry: ${outputDirs.map((d) => `${d}/index.html`).join(", ")}`);
