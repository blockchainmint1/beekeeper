/**
 * Content Security Policy for Beekeeper.
 *
 * Why this matters more here than in a normal app: the encrypted vault lives in
 * localStorage and the plaintext mnemonic lives in JS memory while unlocked. If
 * a script ever runs that we didn't write, the thing that decides whether the
 * seed leaves the device is `connect-src`. So the allowlist below is an explicit
 * list of every host the BROWSER is allowed to talk to — public RPC endpoints,
 * mempool/Esplora APIs, the mint registry, and the Nectar Pay app. Everything
 * else (NowNodes, BlockCypher, Blockchair keys, price feeds) is proxied through
 * our own server functions and therefore covered by 'self'.
 *
 * Adding a chain that the browser calls directly? Add its host here in the same
 * change, or the request will be blocked at runtime.
 */

/** Hosts the browser may open network connections to (fetch / XHR / WebSocket). */
const CONNECT_HOSTS = [
  // Our own surfaces (native shell calls the API cross-origin).
  "https://beekeeper.money",
  "https://beekeeper.honest.money",
  "https://tsd.honest.money",
  // Merchant link + login handshake.
  "https://app.nectar-pay.com",
  // Cold Storage Coin mint registry.
  "https://admin.coldstoragecoins.com",
  "https://blockchainmint.com",
  // UTXO mempool / Esplora APIs.
  "https://mempool.space",
  "https://blockstream.info",
  "https://mempool.texitcoin.org",
  "https://mempool.iskandercoin.com",
  "https://litecoinspace.org",
  "https://api.blockchair.com",
  "https://api.blockcypher.com",
  // EVM public RPCs (fallbacks when our proxy is unavailable).
  "https://eth.llamarpc.com",
  "https://cloudflare-eth.com",
  "https://rpc.ankr.com",
  "https://bsc-rpc.publicnode.com",
  "https://binance.llamarpc.com",
  "https://bsc-dataseed.binance.org",
  "https://base-rpc.publicnode.com",
  "https://base.llamarpc.com",
  "https://mainnet.base.org",
  "https://polygon-rpc.com",
  "https://polygon-bor-rpc.publicnode.com",
  "https://rpc.zerochill.com",
  // Solana + Tron.
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://api.trongrid.io",
  // Price feeds used client-side as a fallback.
  "https://api.coingecko.com",
  "https://api.coinbase.com",
];

/** Hosts allowed to serve fonts/styles. */
const FONT_HOSTS = ["https://api.fontshare.com"];

export function buildCsp(isProduction: boolean): string {
  const connect = ["'self'", ...CONNECT_HOSTS];
  const scripts = ["'self'", "'unsafe-inline'"];

  if (!isProduction) {
    // Vite dev/HMR needs eval and a websocket back to the dev server.
    scripts.push("'unsafe-eval'");
    connect.push("ws:", "wss:", "http://localhost:*", "ws://localhost:*");
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // TODO: drop 'unsafe-inline' once TanStack Start can carry a per-request
    // script nonce through <Scripts>.
    "script-src": scripts,
    // Tailwind + Radix write inline style attributes.
    "style-src": ["'self'", "'unsafe-inline'", ...FONT_HOSTS],
    "font-src": ["'self'", "data:", ...FONT_HOSTS],
    // blob: for QR camera frames and generated QR images.
    "img-src": ["'self'", "data:", "blob:"],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "connect-src": connect,
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
  };

  // Would rewrite the dev server's http://localhost requests to https.
  if (isProduction) directives["upgrade-insecure-requests"] = [];

  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}
