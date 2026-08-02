// bitcoinjs-lib / bitcoinjs-message / secp256k1 all expect a global Buffer.
// Use a synchronous static import so the polyfill is installed BEFORE any
// consumer module evaluates — top-level `await import()` is too late because
// dependent modules can run their own top-level code first.
// Force resolution to the npm `buffer` package (not Node's `node:buffer`,
// which Vite externalizes for browser builds).
import { Buffer as BufferPolyfill } from "buffer";
import processPolyfill from "process";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as unknown as { Buffer: unknown }).Buffer = BufferPolyfill;
}

// Legacy hashing/stream packages (readable-stream, md5.js, cipher-base) read
// `process.version`, `process.browser` and `process.nextTick` directly.
// A partial `process` may already exist (dev server / SSR), so patch missing
// fields instead of only assigning when absent. Injecting the shim through
// Vite is not an option — it corrupts TSS_SERVER_FN_BASE request URLs.
{
  const g = globalThis as unknown as { process?: Record<string, unknown> };
  if (!g.process) {
    g.process = processPolyfill as unknown as Record<string, unknown>;
  }
  const p = g.process!;
  if (typeof p["version"] !== "string") p["version"] = "v20.0.0";
  if (!Array.isArray(p["versions"])) p["versions"] = p["versions"] ?? { node: "20.0.0" };
  if (typeof p["nextTick"] !== "function") {
    p["nextTick"] = (fn: (...args: unknown[]) => void, ...args: unknown[]) => {
      queueMicrotask(() => fn(...args));
    };
  }
  if (!p["env"]) p["env"] = {};
  if (p["browser"] === undefined && typeof window !== "undefined") p["browser"] = true;
}


export const Buffer = BufferPolyfill;