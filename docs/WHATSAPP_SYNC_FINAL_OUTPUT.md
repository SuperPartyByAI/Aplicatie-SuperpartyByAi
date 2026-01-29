# WhatsApp history sync – finalization output

**Task:** Finalize WhatsApp history sync with server-side auto-backfill on Hetzner; remove all automatic backfill from Flutter.

---

## 1. Files changed

| File | Change |
|------|--------|
| `superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart` | Removed all auto-backfill: `WidgetsBindingObserver`, `WhatsAppBackfillManager`, banner, snackbars, `_triggerAutoBackfill`. Kept manual "Sync / Backfill" debug-only. |
| `docs/WHATSAPP_AUTO_BACKFILL.md` | Updated Overview + Flutter section: no auto backfill; manual debug-only. Replaced client throttle/probe with deploy checklist. |
| `whatsapp-backend/RUNBOOK_WHATSAPP_SYNC.md` | Flutter: "never auto-calls backfill"; Sync debug-only. Uses Hetzner backend. |

**Backend** (`wa-auto-backfill.js`, `server.js`, `env.auto-backfill.example`): already implemented and wired. No code edits in this pass.

---

## 2. Key code snippets

### Backend (existing – verified)

**`whatsapp-backend/lib/wa-auto-backfill.js`**
- Lease: `acquireBackfillLease` / `releaseBackfillLease` via Firestore transaction; fields `autoBackfillLeaseUntil`, `autoBackfillLeaseHolder`, `autoBackfillLeaseAcquiredAt`.
- Eligibility: connected accounts only; sort by `lastAutoBackfillAt` asc; `AUTO_BACKFILL_MAX_ACCOUNTS_PER_TICK` (default 3), `AUTO_BACKFILL_MAX_CONCURRENCY` (default 1).
- Throttle: success cooldown 6 h; attempt backoff 10 min.
- Status: `lastAutoBackfillStatus` → `running` → `ok` / `error`; set `lastAutoBackfillSuccessAt` / `lastAutoBackfillAt` only on success.
- `getInstanceId()` from `INSTANCE_ID` or `hostname-pid`.

**`whatsapp-backend/server.js`**
- `initAutoBackfill()` builds ctx (`db`, `timestamp`, `instanceId`, `isPassive`, `getConnectedAccountIds`, `runBackfill`, `saveAccountMeta`, `getAccountMeta`) and `createAutoBackfill(ctx)`.
- `triggerInitialBackfillOnConnect(accountId, { stillConnected })` on connect and restore.
- `schedulePeriodicAutoBackfill()` once at startup (guard `schedulerStarted`); skip tick when `ctx.isPassive()`.

### Flutter (changes)

**Removed from `whatsapp_inbox_screen.dart`:**
- `with WidgetsBindingObserver`, `didChangeAppLifecycleState`, `addObserver` / `removeObserver`.
- `WhatsAppBackfillManager`, `_backfillStatusListener`, `_wasBackfillSyncing`, `_lastShownTransitionKey`, `_isAdmin`, `AdminService`.
- `_triggerAutoBackfill` and all calls (init, load, resume).
- `ValueListenableBuilder<BackfillState?>` "Syncing history…" banner.
- Imports: `whatsapp_backfill_manager`, `admin_service`.

**Kept:**
- Manual "Sync / Backfill history" in debug-only ⋯ menu (`kDebugMode`); calls `_runBackfill()` → `WhatsAppApiService.backfillAccount(accountId)`.

---

## 3. Deploy checklist (Hetzner)

### Required env vars

From `whatsapp-backend/env.auto-backfill.example`:

```
AUTO_BACKFILL_ENABLED=true
AUTO_BACKFILL_INTERVAL_MS=720000
AUTO_BACKFILL_COOLDOWN_SUCCESS_MS=21600000
AUTO_BACKFILL_ATTEMPT_BACKOFF_MS=600000
AUTO_BACKFILL_LEASE_MS=900000
AUTO_BACKFILL_MAX_ACCOUNTS_PER_TICK=3
AUTO_BACKFILL_MAX_CONCURRENCY=1
INSTANCE_ID=hetzner-1
```

Also ensure: `SESSIONS_PATH`, Firebase credentials (`GOOGLE_APPLICATION_CREDENTIALS` or service account), `ADMIN_TOKEN`, etc. (see RUNBOOK).

### systemd

- `WorkingDirectory` = backend dir (e.g. `/opt/superparty/whatsapp-backend`).
- `EnvironmentFile` = path to `.env` (contains vars above).
- `ExecStart=/usr/bin/node server.js`
- `User=deploy`
- `systemctl daemon-reload && systemctl enable whatsapp-backend && systemctl start whatsapp-backend`

### pm2

- `pm2 start server.js --name wa-backend`
- Env via `--env-file` or `ecosystem.config.js`. Use distinct `INSTANCE_ID` per process.

### Docker

- Build image; run with `-e AUTO_BACKFILL_ENABLED=true` (and other vars). One `INSTANCE_ID` per container.

### Verify

- `curl -fsS http://127.0.0.1:8080/ready`
- `journalctl -u whatsapp-backend -n 200` (or pm2/Docker logs) for `[wa-auto-backfill]` tick / start/end.
- Firestore `accounts/{accountId}`: `lastAutoBackfillStatus`, `lastAutoBackfillAt`, lease fields when running.

---

## 4. Acceptance

- [ ] Connect account → within minutes, Firestore `threads` / `messages` exist; Inbox shows history.
- [ ] With 2 backend instances, only one holds lease per account.
- [ ] No Flutter automatic backfill calls.
- [ ] Logs + Firestore show `lastAutoBackfillStatus` transitions (running → ok/error).
