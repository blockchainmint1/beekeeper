import nodeProcess from "node:process";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/probe")({
  server: { handlers: { GET: async () => {
    const g = (globalThis as any).process;
    return Response.json({
      nodeHas: Boolean(nodeProcess?.env?.["ALCHEMY_API"]),
      globalHas: Boolean(g?.env?.["ALCHEMY_API"]),
      nodeKeys: Object.keys(nodeProcess?.env ?? {}).length,
      globalKeys: Object.keys(g?.env ?? {}).length,
    });
  } } },
});
