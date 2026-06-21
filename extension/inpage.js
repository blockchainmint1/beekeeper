// Runs in the page's main world. Exposes window.honestMoney and a minimal
// EIP-1193 window.ethereum provider that proxies to the wallet via the
// content script.

(function () {
  const V = 1;
  const pending = new Map(); // id -> {resolve, reject}

  function uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function send(kind, payload, chain) {
    const id = uuid();
    const req = { v: V, id, kind, chain, origin: location.origin, payload, createdAt: Date.now() };
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.postMessage({ target: "hm-ext", v: V, req }, "*");
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.target !== "hm-page" || data.v !== V || !data.resp) return;
    const p = pending.get(data.resp.id);
    if (!p) return;
    pending.delete(data.resp.id);
    if (data.resp.ok) p.resolve(data.resp.result);
    else p.reject(Object.assign(new Error(data.resp.error?.message || "Rejected"), { code: data.resp.error?.code }));
  });

  const honestMoney = {
    isHonestMoney: true,
    version: "0.1.0",
    request: ({ method, params, chain }) => {
      switch (method) {
        case "hm_getAddress":   return send("getAddress", params, chain);
        case "hm_getXpub":      return send("getXpub", params, chain);
        case "hm_signMessage":  return send("signMessage", params, chain);
        case "hm_signLogin":    return send("signLogin", params, chain);
        case "hm_signTx":       return send("signTx", params, chain);
        default: return Promise.reject(new Error(`Unknown method: ${method}`));
      }
    },
  };

  // EIP-1193 shim for EVM dapps.
  const ethereum = {
    isHonestMoney: true,
    isMetaMask: false,
    _events: {},
    on(evt, cb) { (this._events[evt] ||= []).push(cb); },
    removeListener(evt, cb) { this._events[evt] = (this._events[evt] || []).filter(f => f !== cb); },
    async request({ method, params }) {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts": {
          const addr = await send("getAddress", { kind: "evm" }, "evm");
          return [addr.address];
        }
        case "personal_sign": {
          const [message, _address] = params || [];
          const text = typeof message === "string" && message.startsWith("0x")
            ? new TextDecoder().decode(Uint8Array.from(message.slice(2).match(/.{1,2}/g).map(h => parseInt(h, 16))))
            : message;
          const r = await send("signMessage", { message: text }, "evm");
          return r.signature;
        }
        case "eth_sendTransaction": {
          return send("signTx", { tx: params?.[0] }, "evm");
        }
        case "eth_chainId": return "0x1"; // overridden once active chain wired
        default: throw new Error(`Method not supported: ${method}`);
      }
    },
  };

  Object.defineProperty(window, "honestMoney", { value: honestMoney, writable: false });
  // Don't clobber an existing wallet — only set ethereum if none present.
  if (!window.ethereum) {
    try { Object.defineProperty(window, "ethereum", { value: ethereum, writable: false }); }
    catch { window.ethereum = ethereum; }
  }

  window.dispatchEvent(new Event("honestmoney#initialized"));
})();