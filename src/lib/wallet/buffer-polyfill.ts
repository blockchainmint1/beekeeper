// bitcoinjs-lib expects a global Buffer in the browser. Import once at app entry.
// Only run in the browser — SSR/Worker builds already have Buffer or don't need it.
if (typeof window !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  const { Buffer } = await import("buffer");
  (globalThis as { Buffer: typeof Buffer }).Buffer = Buffer;
}

export {};