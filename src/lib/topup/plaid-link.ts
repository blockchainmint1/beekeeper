// Browser-side Plaid Link loader. Loads the CDN script on demand and resolves
// with the public token + chosen account when the user finishes the flow.

const SRC = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

interface PlaidHandler {
  open: () => void;
  exit: (opts?: { force?: boolean }) => void;
  destroy: () => void;
}

interface PlaidGlobal {
  create: (opts: {
    token: string;
    onSuccess: (publicToken: string, metadata: { accounts?: { id: string }[] }) => void;
    onExit: (err: { display_message?: string; error_message?: string } | null) => void;
  }) => PlaidHandler;
}

let loading: Promise<PlaidGlobal> | null = null;

function loadScript(): Promise<PlaidGlobal> {
  if (typeof window === "undefined") return Promise.reject(new Error("Plaid Link needs a browser."));
  const existing = (window as unknown as { Plaid?: PlaidGlobal }).Plaid;
  if (existing) return Promise.resolve(existing);
  if (loading) return loading;
  loading = new Promise<PlaidGlobal>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => {
      const p = (window as unknown as { Plaid?: PlaidGlobal }).Plaid;
      if (p) resolve(p);
      else reject(new Error("Couldn't load the bank connection window."));
    };
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the bank connection window. Check your connection."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface LinkOutcome {
  publicToken: string;
  accountId?: string;
}

export async function openPlaidLink(linkToken: string): Promise<LinkOutcome> {
  const Plaid = await loadScript();
  return new Promise<LinkOutcome>((resolve, reject) => {
    const handler = Plaid.create({
      token: linkToken,
      onSuccess: (publicToken, metadata) => {
        resolve({ publicToken, accountId: metadata.accounts?.[0]?.id });
        setTimeout(() => handler.destroy(), 0);
      },
      onExit: (err) => {
        setTimeout(() => handler.destroy(), 0);
        reject(
          new Error(
            err?.display_message || err?.error_message || "Bank connection cancelled.",
          ),
        );
      },
    });
    handler.open();
  });
}
