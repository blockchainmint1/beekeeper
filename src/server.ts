import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { buildCsp } from "./lib/security/csp";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// A wallet must never be frameable: an overlay on top of an invisible "send"
// or "approve" control is a straightforward clickjacking theft. These are set
// as real headers because <meta> can't express framing or transport policy.
//
// The CSP's `connect-src` is the one that matters most: even if a script we
// didn't write somehow runs, it cannot POST the seed to an attacker's domain.
const IS_PRODUCTION = process.env["NODE_ENV"] === "production";

const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": buildCsp(IS_PRODUCTION),
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy":
    "geolocation=(), microphone=(), payment=(), usb=(), serial=(), midi=(), display-capture=()",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "origin-agent-cluster": "?1",
};

function withSecurityHeaders(response: Response): Response {
  // Header mutation on an immutable (e.g. redirect) Response throws — clone it.
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!out.headers.has(k)) out.headers.set(k, v);
  }
  return out;
}

/**
 * The Capacitor app serves its bundle from a local asset server, so its calls
 * to /_serverFn and /api are cross-origin. Allow exactly the native shell
 * origins (nothing else — no wildcard) so the mobile app can reach the backend.
 */
const NATIVE_ORIGINS = new Set([
  "https://beekeeper.honest.money",
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost",
]);

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/_serverFn/") || pathname.startsWith("/api/");
}

// The server-function client sends framework headers (x-tsr-server,
// x-tss-serialized, x-tss-raw, x-tss-framed, …). If any one of them is missing
// from access-control-allow-headers the PREFLIGHT fails and EVERY server
// function call dies in the native shell — balances, history and prices all
// break at once while the web build (same-origin, no preflight) looks fine.
// So we reflect whatever the browser asked for instead of maintaining a list.
const DEFAULT_ALLOW_HEADERS =
  "content-type, accept, x-tsr-redirect, x-tsr-server, x-tss-serialized, x-tss-raw, x-tss-framed";

function withNativeCors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  if (!origin || !NATIVE_ORIGINS.has(origin)) return response;
  if (!isApiPath(new URL(request.url).pathname)) return response;
  const requested = request.headers.get("access-control-request-headers");
  const out = new Response(response.body, response);
  out.headers.set("access-control-allow-origin", origin);
  out.headers.set("vary", "origin, access-control-request-headers");
  out.headers.set(
    "access-control-allow-headers",
    requested ? `${DEFAULT_ALLOW_HEADERS}, ${requested}` : DEFAULT_ALLOW_HEADERS,
  );
  out.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  out.headers.set(
    "access-control-expose-headers",
    "content-type, x-tsr-redirect, x-tsr-server, x-tss-serialized, x-tss-raw, x-tss-framed",
  );
  out.headers.set("access-control-max-age", "86400");
  // CORP: same-origin would make the native shell's cross-origin reads fail.
  out.headers.set("cross-origin-resource-policy", "cross-origin");
  return out;
}


export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // CORS preflight from the native shell.
      if (request.method === "OPTIONS") {
        const origin = request.headers.get("origin");
        if (origin && NATIVE_ORIGINS.has(origin) && isApiPath(new URL(request.url).pathname)) {
          return withNativeCors(request, new Response(null, { status: 204 }));
        }
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withNativeCors(
        request,
        withSecurityHeaders(await normalizeCatastrophicSsrResponse(response)),
      );
    } catch (error) {
      console.error(error);
      return withNativeCors(
        request,
        withSecurityHeaders(
          new Response(renderErrorPage(), {
            status: 500,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
        ),
      );
    }
  },
};

