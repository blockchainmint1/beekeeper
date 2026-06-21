// bitcoinjs-lib / bitcoinjs-message / secp256k1 all expect a global Buffer.
// Use a synchronous static import so the polyfill is installed BEFORE any
// consumer module evaluates — top-level `await import()` is too late because
// dependent modules can run their own top-level code first.
import { Buffer as BufferPolyfill } from "buffer";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer: typeof BufferPolyfill }).Buffer = BufferPolyfill;
}

export const Buffer = BufferPolyfill;