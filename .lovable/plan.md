## Goal
Notify the user the moment new funds land in their Beekeeper wallet — in-app, by email, and on Telegram.

## Architecture note (important)
Beekeeper is non-custodial: the mnemonic lives in the browser, there's no Supabase user account. So:

- **Detection runs client-side**, by diffing the existing transaction history poll against a "seen" set in localStorage.
- **Notification prefs (email, Telegram chat id, toggles) live in localStorage** keyed to the wallet — no central account.
- The server only does delivery (email send / Telegram send). It never sees private keys.

## Pieces I'll build

### 1. In-app (toast + bell)
- `useNotifications` hook + provider that:
  - Watches the existing `historyQuery` (cross-chain).
  - On startup, snapshots current tx ids as "seen" (no flood of historical alerts).
  - On every refetch, any new `direction === "in"` tx becomes a Notification.
- Notifications stored in `localStorage` (last 50) with `read` flag.
- New `<NotificationBell />` in `TopBar` (bell icon + unread badge + popover list, click row → open explorer, "Mark all read").
- Fire `toast.success("+0.0042 BTC received")` on new arrivals.

### 2. Notification settings (in existing `SettingsDialog`)
New "Alerts" section with three toggles + fields:
- **In-app** — on by default, no config.
- **Email** — email address + on/off toggle.
- **Telegram** — chat id + on/off + a small "How do I get my chat id?" helper that links to `@BeekeeperAlertsBot` with `/start` instructions.

### 3. Delivery server functions (TanStack `createServerFn`)
- `sendEmailAlert({ to, subject, html })` — uses **Lovable Emails** (built-in). Requires enabling Lovable Cloud + email domain.
- `sendTelegramAlert({ chatId, text })` — uses **Telegram connector** through the Lovable connector gateway.
- Both: per-IP in-memory rate limit (e.g. 10/min) so the public endpoints can't be trivially abused.

### 4. New "Beekeeper Alerts" email template
Branded React Email template: amount, asset, short txid, explorer link, "View in wallet" CTA.

### 5. Telegram bot setup
- I'll connect the Telegram connector (you'll create a bot in @BotFather and paste the token into the connector dialog — Lovable handles the rest).
- No webhook needed for outgoing alerts. We send from the server when the client reports a new tx.

## Flow on a new incoming tx
```text
client polls history  →  diff vs localStorage "seen"
                         │
                         ├─ add to in-app notifications + toast
                         ├─ if email enabled  → POST sendEmailAlert
                         └─ if telegram enabled → POST sendTelegramAlert
```

## What I need from you mid-flow
1. Approve enabling **Lovable Cloud** (one click — required for email infra).
2. Approve setting up an **email domain** for `beekeeper.money` (DNS step at your registrar).
3. Create a Telegram bot in `@BotFather` and link the **Telegram connector** when prompted (one paste).

## Out of scope for this pass
- Outgoing/cash-out alerts (you asked for incoming only).
- Confirmation-state transitions (first-sight → confirmed) — just one alert per tx for now.
- Per-asset thresholds, quiet hours, multi-device sync. Easy to add later.

## Deliverable order
1. In-app bell + toast + settings UI + localStorage plumbing (works immediately, no Cloud).
2. Enable Cloud + email domain prompt + email template + `sendEmailAlert`.
3. Connect Telegram connector + `sendTelegramAlert`.
4. Wire prefs to call the delivery fns from the detection loop.

Ship it?