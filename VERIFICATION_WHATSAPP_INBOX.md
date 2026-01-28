# WhatsApp Inbox Verification — Canonical Query + Schema Audit

## TASK 1 — Code-level enforcement ✅

All three inbox screens use the **same** canonical helper:

- **`superparty_flutter/lib/utils/threads_query.dart`**  
  `buildThreadsQuery(accountId)` =  
  `collection('threads').where('accountId', isEqualTo: accountId).orderBy('lastMessageAt', descending: true).limit(200)`

- **WhatsApp Inbox (canonical):** `whatsapp_inbox_screen.dart` → `buildThreadsQuery(accountId).snapshots().listen(...)`
- **Employee Inbox:** `employee_inbox_screen.dart` → `buildThreadsQuery(accountId).snapshots().listen(...)`
- **Staff Inbox:** `staff_inbox_screen.dart` → `buildThreadsQuery(accountId).snapshots().listen(...)`

No `collectionGroup`, no `whereIn`, no extra server-side filters. Filters (hidden/archived/broadcast/redirectTo) are in-memory only.

---

## If Inbox Angajați is still empty

The query shape is correct. The cause is one of:

1. **accountIds staff/employee empty** — RBAC / getAccountsStaff / mapping (nothing to query).
2. **Rules/RBAC** — Employee cannot read `threads` / `threads/*/messages` → **permission-denied**.
3. **Missing / wrong data** — Threads exist for those accountIds but missing `lastMessageAt` or wrong type → query/sort issues.

---

## Run audit **without** JSON key (ADC, recommended)

Use user ADC instead of a service-account key:

```bash
gcloud auth application-default login
```

Run scripts from **`functions`** so Node finds `firebase-admin` from `functions/node_modules`:

```bash
cd functions

node ../scripts/audit_whatsapp_inbox_schema.mjs --project superparty-frontend --accountId <ID>
node ../scripts/migrate_threads_backfill_lastMessageAt.mjs --project superparty-frontend --accountId <ID> --dryRun
```

(Optional: `GOOGLE_APPLICATION_CREDENTIALS` for a service-account key still works.)

---

## Interpreting audit results

| Result | Meaning |
|--------|--------|
| **threadsCount > 0** for a staff/employee accountId | Data exists; UI should show threads (if rules allow). |
| **0 threads** for that accountId | No data for those accounts, or wrong project/env. |
| **Anomalies** on `lastMessageAt` (missing / wrong type) | Run migration: `--dryRun` first, then `--apply`. |
| **permission-denied** in Flutter logs | Not schema — **rules/RBAC**. |

---

## Quick check (30 seconds, no scripts)

1. Open **Employee** or **Staff Inbox**.
2. In logs, search for:
   - `accountIds queried: [...]`
   - Any `FirebaseException code=...`

**Interpretation:**

- **Empty `accountIds queried`** → Problem *before* Firestore (RBAC / getAccountsStaff / mapping).
- **`FirebaseException code=failed-precondition`** → Index/query mismatch or index still building.
- **`FirebaseException code=permission-denied`** → Rules/RBAC.

With those two log lines, you can tell which of the three causes it is.

---

## TASK 2 & 3 — Scripts

- **Audit (read-only):** `scripts/audit_whatsapp_inbox_schema.mjs`  
  - Uses `firebase-admin` + `applicationDefault()`. ADC via `gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS`.  
  - Exits non-zero if >5% of sampled threads lack `lastMessageAt`.

- **Migration (write, guarded):** `scripts/migrate_threads_backfill_lastMessageAt.mjs`  
  - Default **dry run** (no writes). Use `--apply` to write.  
  - Backfills `thread.lastMessageAt` from latest message in `threads/{id}/messages` (tsClient desc, fallback createdAt desc).

---

## Manual checklist

- [ ] Log in as **non-admin employee**.
- [ ] Open **WhatsApp → Staff Inbox** or **Employee Inbox**.
- [ ] If **empty**: run audit for those accountIds; check **0 threads** vs **permission-denied** vs **failed-precondition** (see above).

---

## Flutter analyze

```bash
cd superparty_flutter && flutter analyze
```

Expected: **0 errors** (warnings/infos only).

---

## Git — include new files + clean commit

```bash
# Preview full diff (including new files)
git add -N superparty_flutter/lib/utils/threads_query.dart \
        superparty_flutter/lib/utils/inbox_schema_guard.dart \
        scripts/audit_whatsapp_inbox_schema.mjs \
        scripts/migrate_threads_backfill_lastMessageAt.mjs \
        VERIFICATION_WHATSAPP_INBOX.md
git diff --no-color --stat
git diff --no-color

# Commit
git add superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart \
        superparty_flutter/lib/screens/whatsapp/employee_inbox_screen.dart \
        superparty_flutter/lib/screens/whatsapp/staff_inbox_screen.dart \
        superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart \
        superparty_flutter/lib/utils/threads_query.dart \
        superparty_flutter/lib/utils/inbox_schema_guard.dart \
        scripts/audit_whatsapp_inbox_schema.mjs \
        scripts/migrate_threads_backfill_lastMessageAt.mjs \
        VERIFICATION_WHATSAPP_INBOX.md
git commit -m "WhatsApp: canonical threads query + schema audit tools"
```
