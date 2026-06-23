import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { decodeRequest, type ExtRequest, type ExtResponse } from "@/lib/extension/protocol";

const search = z.object({ req: z.string().min(1) });

export const Route = createFileRoute("/extension/sign")({
  validateSearch: search,
  component: SignPage,
  head: () => ({ meta: [{ title: "Confirm Signature — Nectar" }] }),
});

function SignPage() {
  const { req: encoded } = useSearch({ from: "/extension/sign" });
  const [extensionId, setExtensionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "signing" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const req: ExtRequest | null = useMemo(() => {
    try { return decodeRequest(encoded); } catch { return null; }
  }, [encoded]);

  useEffect(() => {
    (async () => {
      try {
        const { walletExtensionId } = await new Promise<any>((res) =>
          (window as any).chrome?.storage?.local?.get?.("walletExtensionId", res) ?? res({}),
        );
        if (walletExtensionId) setExtensionId(walletExtensionId);
      } catch {}
    })();
  }, []);

  async function postBack(resp: ExtResponse) {
    const chrome = (window as any).chrome;
    if (!chrome?.runtime?.sendMessage || !extensionId) {
      // Best-effort: try opener postMessage too.
      window.opener?.postMessage(resp, "*");
      return;
    }
    await new Promise<void>((resolve) =>
      chrome.runtime.sendMessage(extensionId, { type: "response", ...resp }, () => resolve()),
    );
  }

  async function approve() {
    if (!req) return;
    setStatus("signing");
    try {
      // TODO: route req.kind to existing wallet signing helpers (evmSignMessage / utxoSignMessage / xpub / tx).
      // For now we stub a deterministic placeholder so the round-trip is testable end-to-end.
      const result = await stubSign(req);
      await postBack({ v: 1, id: req.id, ok: true, result });
      setStatus("done");
      setTimeout(() => window.close(), 600);
    } catch (e: any) {
      setError(e.message || String(e));
      setStatus("error");
    }
  }

  async function reject() {
    if (!req) return;
    await postBack({ v: 1, id: req.id, ok: false, error: { code: "USER_REJECTED", message: "User rejected" } });
    window.close();
  }

  if (!req) {
    return <Centered>Invalid request payload.</Centered>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Signature request</p>
        <h1 className="mt-1 text-xl font-semibold">{labelFor(req.kind)}</h1>
        <p className="mt-2 text-xs text-muted-foreground break-all">from {req.origin}</p>

        <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap break-all">
{JSON.stringify(req.payload ?? {}, null, 2)}
        </pre>

        {status === "error" && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {status === "done" && <p className="mt-3 text-sm text-green-500">Signed. Closing…</p>}

        <div className="mt-6 flex gap-2">
          <button onClick={reject} className="flex-1 rounded-md border border-border py-2 text-sm">Reject</button>
          <button onClick={approve} disabled={status === "signing"} className="flex-1 rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium disabled:opacity-50">
            {status === "signing" ? "Signing…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function labelFor(k: ExtRequest["kind"]): string {
  switch (k) {
    case "getAddress": return "Share wallet address";
    case "getXpub":    return "Share extended public key";
    case "signMessage": return "Sign message";
    case "signLogin":  return "Sign in to website";
    case "signTx":     return "Sign transaction";
  }
}

async function stubSign(req: ExtRequest): Promise<unknown> {
  // Placeholder — replace with calls into src/lib/wallet/{signing,xpub,evm,utxo}.
  return { stub: true, kind: req.kind, signedAt: Date.now() };
}