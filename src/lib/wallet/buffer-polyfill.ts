// bitcoinjs-lib expects a global Buffer in the browser. Import once at app entry.
import { Buffer } from "buffer";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer: typeof Buffer }).Buffer = Buffer;
}

export {};