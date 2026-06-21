const $ = (s) => document.querySelector(s);

async function load() {
  const { walletUrl, pairedAt } = await chrome.storage.local.get(["walletUrl", "pairedAt"]);
  $("#walletUrl").value = walletUrl || "https://wallet.honest.money";
  $("#status").textContent = pairedAt
    ? `Paired ${new Date(pairedAt).toLocaleString()}`
    : "Not paired yet";
  $("#version").textContent = "v" + chrome.runtime.getManifest().version;
}

$("#save").addEventListener("click", async () => {
  const url = $("#walletUrl").value.trim().replace(/\/$/, "");
  await chrome.storage.local.set({ walletUrl: url });
  $("#status").textContent = "Saved.";
});

$("#openWallet").addEventListener("click", async () => {
  const { walletUrl } = await chrome.storage.local.get("walletUrl");
  chrome.tabs.create({ url: (walletUrl || "https://wallet.honest.money") + "/" });
});

$("#pair").addEventListener("click", async () => {
  const { walletUrl } = await chrome.storage.local.get("walletUrl");
  const base = walletUrl || "https://wallet.honest.money";
  chrome.tabs.create({ url: `${base}/extension/pair?ext=${chrome.runtime.id}` });
});

load();