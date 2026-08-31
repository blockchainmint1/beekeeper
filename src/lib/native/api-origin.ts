/**
 * Native API origin bridge.
 *
 * In the Capacitor build the web assets are served from a LOCAL asset server
 * that answers for the app's own hostname (see capacitor.config.ts). That means
 * a same-origin request to `/_serverFn/...` or `/api/...` never reaches our
 * Cloudflare worker — the local server answers it with the SPA shell (or a raw
 * error page), the server-function client tries to parse HTML as a result, and
 * the whole wallet screen throws into the root error boundary
 * ("This page didn't load").
 *
 * Fix: inside the native shell, rewrite those two path prefixes onto the real
 * deployed origin. Everything else (assets, chunks, images) keeps loading from
 * the bundle, so the app still works offline for local-only screens.
 *
 * Imported for its side effect from the root route, before any wallet module.
 */

const DEFAULT_ORIGIN = "https://beekeeper.money";

export const NATIVE_API_ORIGIN: string =
  (import.meta.env["VITE_NATIVE_API_ORIGIN"] as string | undefined) || DEFAULT_ORIGIN;

/** True only inside the Capacitor native shell (never in a normal browser). */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  try {
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

const REWRITE_PREFIXES = ["/_serverFn/", "/api/"];

function rewriteUrl(raw: string): string {
  try {
    const u = new URL(raw, window.location.href);
    if (u.origin !== window.location.origin) return raw;
    if (!REWRITE_PREFIXES.some((p) => u.pathname.startsWith(p))) return raw;
    return `${NATIVE_API_ORIGIN}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return raw;
  }
}

let installed = false;

export function installNativeApiOrigin(): void {
  if (installed || typeof window === "undefined") return;
  if (!isNativeShell()) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      if (typeof input === "string" || input instanceof URL) {
        return originalFetch(rewriteUrl(String(input)), init);
      }
      const next = rewriteUrl(input.url);
      if (next === input.url) return originalFetch(input, init);
      return originalFetch(new Request(next, input), init);
    } catch {
      return originalFetch(input as RequestInfo, init);
    }
  };
}

installNativeApiOrigin();
