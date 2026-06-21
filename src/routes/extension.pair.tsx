import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

const search = z.object({ ext: z.string().min(8).optional() });

export const Route = createFileRoute("/extension/pair")({
  validateSearch: search,
  component: PairPage,
  head: () => ({ meta: [{ title: "Pair Browser Extension — Honest Money" }] }),
});

function PairPage() {
  const { ext } = useSearch({ from: "/extension/pair" });
  const [status, setStatus] = useState<"idle" | "ok" | "err" | "missing">(
    ext ? "idle" : "missing",
  );
  const [err, setErr] = useState<string>("");

  async function pair() {
    if (!ext) return;
    try {
      const chrome = (window as any).chrome;
      if (!chrome?.runtime?.sendMessage) throw new Error("This page must be opened from the extension.");
      const resp: any = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          ext,
          { v: 1, type: "pair" },
          (r: any) => {
            const e = chrome.runtime.lastError;
            if (e) reject(new Error(e.message));
            else resolve(r);
          },
        );
      });
      if (resp?.ok) setStatus("ok");
      else throw new Error("Extension did not acknowledge");
    } catch (e: any) {
      setErr(e.message || String(e));
      setStatus("err");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-semibold">Pair browser extension</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Link this wallet with the Honest Money extension so dapps can request signatures.
        </p>
        {status === "missing" && (
          <p className="mt-6 text-sm text-destructive">Missing extension id. Open this page from the extension popup.</p>
        )}
        {status === "idle" && (
          <button onClick={pair} className="mt-6 w-full rounded-md bg-primary text-primary-foreground py-2 font-medium">
            Pair with extension
          </button>
        )}
        {status === "ok" && (
          <p className="mt-6 text-sm text-green-500">Paired. You can close this tab.</p>
        )}
        {status === "err" && (
          <>
            <p className="mt-6 text-sm text-destructive">Pairing failed: {err}</p>
            <button onClick={pair} className="mt-3 w-full rounded-md border border-border py-2">Retry</button>
          </>
        )}
        {ext && <p className="mt-6 text-[10px] text-muted-foreground break-all">Extension ID: {ext}</p>}
      </div>
    </div>
  );
}