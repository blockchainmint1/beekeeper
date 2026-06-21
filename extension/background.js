// Honest Money — background service worker (MV3).
// Role: route signing requests from dapps (via content/inpage) to the paired
// wallet web app, and accept signed responses back via externally_connectable.

import { encodeRequest, EXT_PROTOCOL_VERSION } from "./shared/protocol.js";

const DEFAULT_WALLET_URL = "https://wallet.honest.money";
const PENDING = new Map(); // id -> {resolve, reject, tabId, timer}
const REQUEST_TTL_MS = 5 * 60 * 1000;

async function getWalletUrl() {
  const { walletUrl } = await chrome.storage.local.get("walletUrl");
  return walletUrl || DEFAULT_WALLET_URL;
}

async function openSigner(req) {
  const base = await getWalletUrl();
  const url = `${base}/extension/sign?req=${encodeRequest(req)}`;
  const win = await chrome.windows.create({ url, type: "popup", width: 440, height: 720 });
  return win;
}

function settle(id, resp) {
  const p = PENDING.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  PENDING.delete(id);
  if (resp.ok) p.resolve(resp.result);
  else p.reject(resp.error || { code: "USER_REJECTED", message: "Rejected" });
}

function dispatch(req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      PENDING.delete(req.id);
      reject({ code: "TIMEOUT", message: "Wallet did not respond" });
    }, REQUEST_TTL_MS);
    PENDING.set(req.id, { resolve, reject, timer });
    openSigner(req).catch((err) => {
      clearTimeout(timer);
      PENDING.delete(req.id);
      reject({ code: "OPEN_FAILED", message: String(err?.message || err) });
    });
  });
}

// Messages from content scripts (dapps).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.v !== EXT_PROTOCOL_VERSION) return;
  if (msg.type === "request") {
    dispatch(msg.req).then(
      (result) => sendResponse({ v: EXT_PROTOCOL_VERSION, id: msg.req.id, ok: true, result }),
      (error) => sendResponse({ v: EXT_PROTOCOL_VERSION, id: msg.req.id, ok: false, error }),
    );
    return true; // async
  }
  if (msg.type === "ping") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }
});

// Messages from the paired wallet web app.
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.v !== EXT_PROTOCOL_VERSION) return;
  if (msg.type === "response") {
    settle(msg.id, msg);
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === "pair") {
    chrome.storage.local.set({
      walletUrl: sender.origin || sender.url || DEFAULT_WALLET_URL,
      pairedAt: Date.now(),
    });
    sendResponse({ ok: true, extensionId: chrome.runtime.id });
    return false;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("walletUrl").then(({ walletUrl }) => {
    if (!walletUrl) chrome.storage.local.set({ walletUrl: DEFAULT_WALLET_URL });
  });
});