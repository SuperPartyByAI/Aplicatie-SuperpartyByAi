# WhatsApp Project Status (Sanitized)

Last updated: 2026-01-21

## Runtime status (Ubuntu)
- waMode: `active`
- lockStatus: `held_by_this_instance`
- accounts_total: `1`
- connected: `1`
- needs_qr: `0`
- sessions_dir_writable: `true`
- runtime path: `WorkingDirectory=/opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend`
- ExecStart: `/usr/bin/node /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend/server.js`
- SESSIONS_PATH: `/var/lib/whatsapp-backend/sessions`
- creds.json_count: `1`

## Firestore mode (Flutter)
- default: `prod` (emulator disabled unless `USE_FIREBASE_EMULATOR=true`)
- emulator fallback: auto‑fallback to prod if emulator is unreachable

## Inbound sync strategy (Flutter)
- primary: Firestore stream `threads/{threadId}/messages`
- fallback: proxy polling `whatsappProxyGetMessages` (every ~3s) if stream errors or times out
- dedupe: skip `isDuplicate=true`, prefer `stableKeyHash` / `fingerprintHash`

## Duplicate audit (excludeMarked default)
- BEFORE 48h/500: totalDocs=`500`, markedDocs=`82`, activeDocs=`418`, duplicatesCountActive=`28`
- AFTER 48h/500: totalDocs=`500`, markedDocs=`82`, activeDocs=`418`, duplicatesCountActive=`28`
- BEFORE 1h/500: totalDocs=`500`, markedDocs=`82`, activeDocs=`418`, duplicatesCountActive=`28`
- AFTER 1h/500: totalDocs=`500`, markedDocs=`82`, activeDocs=`418`, duplicatesCountActive=`28`
- legacy duplicates are soft-marked (`isDuplicate=true`), no deletes

## Fast verification (1h window, restart x2)
- before (1h/500): totalDocs=`500`, uniqueFingerprints=`385`, duplicatesCount=`115`
- after (1h/500): totalDocs=`500`, uniqueFingerprints=`385`, duplicatesCount=`115`
- dashboard dedupe/history: `wrote=0`, `skipped=0`, `strongSkipped=0`, `history.wrote=0`
- verdict: `NO_NEW_DUPES_DETECTED` (counts stable), but legacy dupes remain

## Duplicate cleanup (soft-mark)
- threadId_hash: `ad7bd8a1`
- dry-run: scannedMessages=`849`, groupsWithDuplicates=`50`, duplicatesToMark=`72`
- apply: duplicatesToMark=`72`, threadsUpdated=`1`
- verdict: `CLEANUP_APPLIED` (audit counts unchanged because `isDuplicate` is not filtered in audit)

## Quick write test (15m window)
- threadId_hash: `88e6afbd`
- outbound send: status_code=`200`, messageId_hash=`e280ce1c`
- audit BEFORE restart (15m/500): totalDocs=`500`, markedDocs=`82`, activeDocs=`418`, duplicatesCountActive=`28`
- audit AFTER restart (15m/500): totalDocs=`500`, markedDocs=`82`, activeDocs=`418`, duplicatesCountActive=`28`
- dashboard BEFORE: dedupe.wrote=`0`, dedupe.skipped=`0`, history.wrote=`0`, history.skipped=`0`
- dashboard AFTER: dedupe.wrote=`0`, dedupe.skipped=`0`, history.wrote=`0`, history.skipped=`0`
- verdict: `NO_NEW_DUPES` (no increase in active dupes)

## Audit commands (sanitized)
- Global audit (48h/500): `node scripts/audit-firestore-duplicates.js --windowHours=48 --limit=500 --excludeMarked`
- Global audit (15m/500): `node scripts/audit-firestore-duplicates.js --windowHours=0.25 --limit=500 --excludeMarked`
- Thread audit: `node scripts/audit-threads-duplicates.js --limit=2000`
- Note: collectionGroup orderBy requires index on `messages.tsClient` (DESC)

## Audit ASC fallback
- If DESC index is missing, audit falls back to ASC with a time-window query.
- Output includes `modeUsed` and `usedFallback`.
- Verdict stays NOT READY unless `ALLOW_FALLBACK_READY=true`.

## Proxy sanity check
- `curl` without tokens should return `401` (expected)

## Production fixes in place
- Stable message persist + dedupe (realtime/history/outbound).
- Dashboard metrics fix: `d4dce26f`
- UI dedupe: `842b9153` (skip `isDuplicate`, prefer `stableKeyHash`/`fingerprintHash`)
- Sessions path set: `/var/lib/whatsapp-backend/sessions` (creds.json_count=1)

## TODO (next)
- Send 1 outbound + 1 inbound message (manual), then audit 15 min window.
- Restart service once, re-audit 15 min window.
- Expect duplicatesCount to stay at 0 for the new-message window.
- Verify UI remains clean without relying solely on client filter.
