import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
// Install the Buffer polyfill eagerly so wallet/crypto modules that read
// `globalThis.Buffer` at import time always see it.
import "../lib/wallet/buffer-polyfill";
// Native (Capacitor) shell: send /_serverFn and /api traffic to the deployed
// origin instead of the local asset server, which cannot answer them.
import "../lib/native/api-origin";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|error loading dynamically imported/i;

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  // In the native webview a single stale/missing route chunk otherwise dead-ends
  // the whole screen. Recover once automatically before showing the error.
  useEffect(() => {
    if (!CHUNK_ERROR.test(error?.message ?? "")) return;
    try {
      const key = "bk-chunk-reload";
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      location.reload();
    } catch {
      /* storage unavailable — fall through to the manual UI */
    }
  }, [error]);

  const detail = [error?.name, error?.message].filter(Boolean).join(": ");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        {detail ? (
          <pre className="mt-4 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-left text-[11px] leading-relaxed text-muted-foreground">
            {detail}
            {error?.stack ? `\n\n${error.stack.slice(0, 900)}` : ""}
          </pre>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            onClick={() => {
              try {
                sessionStorage.removeItem("bk-chunk-reload");
              } catch {
                /* ignore */
              }
              location.replace("/");
            }}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </button>
          {detail ? (
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(`${detail}\n\n${error?.stack ?? ""}`);
              }}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              Copy details
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "referrer", content: "no-referrer" },
      { name: "theme-color", content: "#0D1B33" },
      { title: "Beekeeper — Self-custody wallet · NectarPay ecosystem" },
      { name: "description", content: "Beekeeper is a self-custody, non-custodial wallet for TEXITcoin, Bitcoin, Ethereum, Base, BNB Chain and stablecoins. Part of the honest.money and NectarPay ecosystem — your keys, your money, zero fees." },
      { name: "author", content: "Honest Money" },
      { property: "og:title", content: "Beekeeper — Self-custody wallet · NectarPay ecosystem" },
      { property: "og:description", content: "Self-custody wallet for TEXITcoin, Bitcoin, ETH, Base, BSC and stablecoins. Part of the honest.money & NectarPay ecosystem." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Beekeeper — Self-custody wallet · NectarPay ecosystem" },
      { name: "twitter:description", content: "Self-custody wallet for TEXITcoin, Bitcoin, ETH, Base, BSC and stablecoins. Part of the honest.money & NectarPay ecosystem." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      // NectarPay typography — Satoshi (display), General Sans (body), JetBrains Mono (numbers)
      { rel: "preconnect", href: "https://api.fontshare.com" },
      { rel: "stylesheet", href: "https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&f[]=general-sans@400,500,600&display=swap" },
      { rel: "stylesheet", href: "https://api.fontshare.com/v2/css?f[]=jetbrains-mono@400,500,700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Blocking inline shim: production chunking can evaluate a crypto vendor chunk
// (sha3 / readable-stream / cipher-base) before the router module, so the
// module-level polyfill is too late. This runs in <head> before any bundle.
const PROCESS_SHIM = `(function(){var g=globalThis;var p=g.process;if(!p){p=g.process={};}
try{if(!p.env)p.env={};if(typeof p.version!=="string")p.version="v20.0.0";
if(!p.versions)p.versions={node:"20.0.0"};if(p.browser===undefined)p.browser=true;
if(typeof p.nextTick!=="function")p.nextTick=function(f){var a=[].slice.call(arguments,1);queueMicrotask(function(){f.apply(null,a)});};
if(typeof p.cwd!=="function")p.cwd=function(){return "/"};
if(!p.argv)p.argv=[];if(!p.platform)p.platform="browser";}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: PROCESS_SHIM }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Native shell setup: status bar, keyboard resize, hide splash.
    // All no-ops on web / Lovable preview.
    void (async () => {
      const { initNativeChrome, hideSplash } = await import("../lib/native/ui");
      await initNativeChrome();
      await hideSplash();
      // Pull the operator's Zero Chill node settings (chain id + explorer).
      const { hydrateZcu } = await import("../lib/chains/zcu-runtime");
      void hydrateZcu();
    })();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
