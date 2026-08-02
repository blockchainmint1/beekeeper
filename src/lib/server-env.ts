// Server-only env accessor.
//
// IMPORTANT: `import process from "node:process"` returns a shim with an EMPTY
// env in this runtime (Worker / Vite SSR) — secrets are injected onto the
// GLOBAL `process.env` at request time. Always read them through this helper
// inside a handler, never at module scope.
export function env(name: string): string | undefined {
  const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.[name];
}
