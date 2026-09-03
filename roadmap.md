- [x] Fix APK crash after balance screen: TypeError a.data.map is not a function (harden Omni/EVM token + activity list rendering against non-array payloads)

## HME Wallet parity
- [x] ZCU/ZCHL RPC proxy + runtime chain config
- [x] Dynamic UTXO fee estimation with per-chain clamps (DOGE fix)
- [x] APK update check card in Wallet → Settings
- [x] Single-key (WIF) import + sweep at /wallet/import-key
- [ ] ZCU/ZCHL transaction history
- [ ] Key-rotation policy card
- [ ] Scribble pad
- [ ] Deep-rescan reservation release
- [ ] Fix new-seed balance discovery plus TXC price and transaction-history failures

## Security hardening (parity with HME SECURITY-AUDIT.md)
- [x] Full CSP with an explicit `connect-src` host allowlist (`src/lib/security/csp.ts`, served from `src/server.ts`)
- [x] PBKDF2 raised to 1,000,000 iterations; v1/v2 vaults still unlock and silently re-encrypt at the new cost
- [x] Password policy: 10-char floor, common-password blocklist, repetition/run checks (`src/lib/security/password-strength.ts`)
- [x] Error reporting scrubs mnemonics / WIF / xprv / long hex and allowlists context keys
- [x] Fail-open per-IP rate limiting on the metered Alchemy and ZCU RPC proxies
- [ ] Nonce-based CSP (drop `script-src 'unsafe-inline'`) — needs a nonce threaded through TanStack `<Scripts>`
- [ ] H3: bind biometric unlock to an OS access-control flag (keychain / Keystore) instead of app-gated secure storage
- [ ] Argon2id KDF migration (envelope already versioned)
- [ ] L1: render seed words only on explicit reveal, clear from React state on unmount
