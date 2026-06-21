// Mirror of src/lib/extension/protocol.ts for the extension runtime.
export const EXT_PROTOCOL_VERSION = 1;

export function encodeRequest(req) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(req))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeRequest(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}