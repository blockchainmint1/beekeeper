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

// Legacy hashing/stream packages read the global directly. Install it here,
// after TanStack's compile-time env expressions have already been replaced;
// injecting it through Vite would corrupt TSS_SERVER_FN_BASE request URLs.
if (typeof globalThis !== "undefined" && !(globalThis as { process?: unknown }).process) {
  (globalThis as unknown as { process: unknown }).process = processPolyfill;
}

export const Buffer = BufferPolyfill;