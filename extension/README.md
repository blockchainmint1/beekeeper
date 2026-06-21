# Honest Money — Browser Extension

Bridges any website to your Honest Money wallet:

- **Sign in with Honest Money** (QR/SIWE-style)
- **`window.honestMoney`** provider for TXC / ZCU / ISK dapps
- **`window.ethereum`** (EIP-1193) shim for EVM dapps
- Get addresses & xpubs from the active wallet

## How it works

The extension never holds keys. Every signing request is forwarded to the
paired wallet web app (default: `https://wallet.honest.money`) which opens
in a popup window for user confirmation. The wallet posts the signed result
back to the extension via `chrome.runtime.sendMessage` (the wallet origin is
whitelisted in the extension's `externally_connectable`).

## Install (dev)

1. Run `bash scripts/build-extension.sh` from the project root.
2. Open `chrome://extensions`, enable Developer Mode.
3. Click **Load unpacked** and select the `extension/` folder
   (or unzip `public/honest-money-extension.zip`).
4. Click the extension icon → **Pair with this browser** to link the wallet.

## Protocol

See `src/lib/extension/protocol.ts` for the canonical message types.