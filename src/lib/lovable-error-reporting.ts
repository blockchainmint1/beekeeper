type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
  }
}

/* ─── Secret scrubbing ───
   Error reporting leaves the device, and wallet errors love to quote the thing
   that broke: a mnemonic, a WIF, an xprv, a raw signed transaction. Everything
   forwarded is filtered through these patterns first, strings are length-capped,
   and only an allowlist of context keys is sent. If in doubt, it doesn't go. */

const REDACTED = "[redacted]";
const MAX_STRING = 2_000;

const PATTERNS: Array<[RegExp, string]> = [
  // 12/15/18/21/24 lowercase words in a row — a BIP39 phrase.
  [/\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/gi, REDACTED],
  // Extended keys.
  [/\b(?:xprv|yprv|zprv|tprv|xpub|ypub|zpub|tpub)[1-9A-HJ-NP-Za-km-z]{50,}\b/g, REDACTED],
  // WIF private keys.
  [/\b[5KLc9][1-9A-HJ-NP-Za-km-z]{50,51}\b/g, REDACTED],
  // Hex blobs: raw private keys, signed transactions, signatures.
  [/\b(?:0x)?[0-9a-fA-F]{64,}\b/g, REDACTED],
  // Base64-ish signature payloads.
  [/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, REDACTED],
];

export function scrubSecrets(input: string): string {
  let out = input.length > MAX_STRING ? `${input.slice(0, MAX_STRING)}…` : input;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

const ALLOWED_CONTEXT_KEYS = new Set(["source", "route", "component", "chain", "action", "stage"]);

function scrubContext(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!ALLOWED_CONTEXT_KEYS.has(key)) continue;
    out[key] = typeof value === "string" ? scrubSecrets(value) : typeof value === "number" || typeof value === "boolean" ? value : REDACTED;
  }
  return out;
}

function scrubError(error: unknown): Error {
  const source = error instanceof Error ? error : new Error(String(error));
  const safe = new Error(scrubSecrets(source.message || "Unknown error"));
  safe.name = source.name;
  safe.stack = source.stack ? scrubSecrets(source.stack) : undefined;
  return safe;
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    scrubError(error),
    scrubContext({
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    }),
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
}
