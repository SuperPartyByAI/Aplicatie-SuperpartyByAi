# WhatsApp automatic backfill – implementation summary

## Overview

- **Server-side** (Hetzner): auto backfill on connect + periodic; **recent-sync** (gap-filler) every ~2 min. **Production-safe:** distributed lock, throttling, PASSIVE-aware. **No user action required.** History sync is 100% server-side.
- **Realtime:** `messages.upsert` → Firestore; diagnostics in `accounts/{id}`: `lastRealtimeIngestAt`, `lastRealtimeMessageAt`, `lastRealtimeError`. **`GET /diag`** returns `latestRealtime` for up to 3 connected accounts.
- **Flutter:** **never** auto-calls backfill. No admin gating, no BackfillManager in Inbox, no "Syncing history…" banner or auto snackbars.
- **Manual "Sync / Backfill"** in Inbox is **debug-only** (⋯ menu), if desired.

## Server-side (backend)

See **`whatsapp-backend/RUNBOOK_WHATSAPP_SYNC.md`** → **Server-side auto backfill**.

### Production-safe behaviour

- **Distributed lock:** Firestore lease per account (`autoBackfillLeaseUntil`, `autoBackfillLeaseHolder`, `autoBackfillLeaseAcquiredAt`). Only one instance runs backfill per account; others skip.
- **Eligibility:** Connected accounts sorted by `lastAutoBackfillAt` asc. Limits: `AUTO_BACKFILL_MAX_ACCOUNTS_PER_TICK`, `AUTO_BACKFILL_MAX_CONCURRENCY`.
- **Cooldown:** Success 6 h; attempt backoff 10 min for retry after failure.
- **Status:** `lastAutoBackfillStatus` → `running` → `ok` / `error` with `threads`, `messages`, `durationMs`, etc.
- **Instance ID:** `INSTANCE_ID` (env) or `hostname-pid`. Used in lease holder and logs.
- **Scheduler:** Starts once; skips ticks when backend is in **PASSIVE** mode.

### Env vars (defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTO_BACKFILL_ENABLED` | `true` | Enable auto backfill |
| `AUTO_BACKFILL_INTERVAL_MS` | `720000` (12 min) | Tick interval |
| `AUTO_BACKFILL_COOLDOWN_SUCCESS_MS` | `21600000` (6 h) | Skip if last success within |
| `AUTO_BACKFILL_ATTEMPT_BACKOFF_MS` | `600000` (10 min) | Retry-after-failure backoff |
| `AUTO_BACKFILL_LEASE_MS` | `900000` (15 min) | Lease duration |
| `AUTO_BACKFILL_MAX_ACCOUNTS_PER_TICK` | `3` | Max accounts per tick |
| `AUTO_BACKFILL_MAX_CONCURRENCY` | `1` | Max concurrent backfills |
| `INSTANCE_ID` | `hostname-pid` | Instance id for lease / logs |
| `RECENT_SYNC_ENABLED` | `true` | Enable gap-filler |
| `RECENT_SYNC_INTERVAL_MS` | `120000` (2 min) | Gap-filler interval |
| `RECENT_SYNC_MAX_THREADS` | `30` | Max threads per tick |
| `RECENT_SYNC_MAX_MESSAGES_PER_THREAD` | `20` | Max messages per thread |
| `RECENT_SYNC_LEASE_MS` | `300000` (5 min) | Lease per account |

## Flutter

- **No automatic backfill.** Flutter never auto-calls backfill functions. No `WidgetsBindingObserver`, no "Syncing history…" banner, no auto snackbars, no `WhatsAppBackfillManager` usage in Inbox.
- **Manual "Sync / Backfill"** is **debug-only** (⋯ menu, `kDebugMode`). Not in release. Optional.

## Commands (prod)

**Firebase Functions** (backend URL for proxy):

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
firebase functions:config:set whatsapp.backend_base_url="http://37.27.34.179:8080"
firebase deploy --only "functions:whatsappProxyGetAccounts,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr,functions:whatsappProxyGetThreads,functions:whatsappProxyDeleteAccount,functions:whatsappProxyBackfillAccount,functions:whatsappProxySend"
```

**Hetzner backend:** Set env vars (see RUNBOOK); run via systemd / pm2 / Docker. Use `INSTANCE_ID` per instance. See **Deploy checklist** below.

## How to tell if sync is running or blocked

See **`whatsapp-backend/RUNBOOK_WHATSAPP_SYNC.md`** → **“How to tell if sync is running or blocked”**:

1. **Firestore** `accounts/{accountId}`: `lastAutoBackfillStatus`, `lastAutoBackfillSuccessAt`, `lastAutoBackfillAttemptAt`, `lastRealtimeIngestAt`, `lastRealtimeMessageAt`.
2. **Live test:** Send a WhatsApp message → appears in Inbox/Firestore? If yes, live works; gaps → backfill/recent-sync. If no, fix backend first.
3. **`/ready`:** `mode: "active"` vs `"passive"` (ticks run only when active).
4. **Manual backfill** (debug) → check `lastBackfillAt` and `threads/…/messages` growth.

**Minimal steps:** Live test → Firestore fields → logs if live fails → manual backfill if gaps remain.

---

## Acceptance checks

**Server (Hetzner):**
- [ ] 1 instance: backfill on connect + periodic; no parallel runs per account.
- [ ] 2 instances: only one obtains lease per account; other skips.
- [ ] No spam: retry after failure limited; success cooldown respected.
- [ ] Firestore: `lastAutoBackfillStatus` running / ok / error; lease fields when running.
- [ ] Logs: tick summary + start/end per account (accountId masked).

**Flutter:**
- [ ] No automatic backfill calls. Flutter never auto-calls backfill.
- [ ] Manual Sync / Backfill **only in debug** builds (⋯ menu), if kept.

## Deploy checklist (Hetzner)

- **Required env vars:** `AUTO_BACKFILL_ENABLED=true`, `AUTO_BACKFILL_INTERVAL_MS`, `AUTO_BACKFILL_COOLDOWN_SUCCESS_MS`, `AUTO_BACKFILL_ATTEMPT_BACKOFF_MS`, `AUTO_BACKFILL_LEASE_MS`, `AUTO_BACKFILL_MAX_ACCOUNTS_PER_TICK`, `AUTO_BACKFILL_MAX_CONCURRENCY`, `INSTANCE_ID`. See `whatsapp-backend/env.auto-backfill.example`.
- **systemd:** `WorkingDirectory` = backend dir, `EnvironmentFile` = `.env`, `ExecStart=node server.js`, `User=deploy`. `systemctl daemon-reload && enable && start whatsapp-backend`.
- **pm2:** `pm2 start server.js --name wa-backend`; set env via `--env-file` or `ecosystem.config.js`. Use distinct `INSTANCE_ID` per process.
- **Docker:** Build image, run with `-e AUTO_BACKFILL_ENABLED=true` etc. One `INSTANCE_ID` per container.
- **Verify:** `curl -fsS http://127.0.0.1:8080/ready` and `curl -s http://127.0.0.1:8080/diag | jq`; `journalctl -u whatsapp-backend -n 200` for `[wa-auto-backfill]`, `[recent-sync]`, `[realtime]` logs; Firestore `accounts/{id}.lastAutoBackfillStatus`, `lastRealtimeIngestAt`, `lastRecentSyncAt`.
