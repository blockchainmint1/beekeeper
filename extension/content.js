// Bridges window <-> background. Injects the inpage provider into the page,
// forwards page messages to the service worker, and relays responses back.

(function injectInpage() {
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("inpage.js");
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => s.remove();
  } catch (err) {
    console.warn("[honest-money] inpage inject failed", err);
  }
})();

const V = 1;

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.target !== "hm-ext" || data.v !== V) return;
  const req = data.req;
  if (!req) return;
  // Stamp the dapp origin from the content script (page can't spoof this).
  req.origin = window.location.origin;
  chrome.runtime.sendMessage({ v: V, type: "request", req }, (resp) => {
    window.postMessage({ target: "hm-page", v: V, resp: resp || { v: V, id: req.id, ok: false, error: { code: "NO_RESPONSE", message: "Extension unreachable" } } }, "*");
  });
});

// Detect payhme:// QR-login links and surface a "Sign in with Honest Money" hint.
document.addEventListener("DOMContentLoaded", () => {
  const links = document.querySelectorAll('a[href^="payhme://login"], a[href^="hm://login"]');
  links.forEach((a) => a.setAttribute("data-honest-money", "login"));
});