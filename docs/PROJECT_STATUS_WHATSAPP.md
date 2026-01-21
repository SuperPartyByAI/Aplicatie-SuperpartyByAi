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

## Duplicate audit (sanitized)
- window `48h`, limit `500` -> totalDocs=`500`, uniqueFingerprints=`388`, duplicatesCount=`112`
- legacy duplicates present (cleanup planned, no deletes)

## Fast verification (1h window, restart x2)
- before (1h/500): totalDocs=`500`, uniqueFingerprints=`388`, duplicatesCount=`112`
- after (1h/500): totalDocs=`500`, uniqueFingerprints=`388`, duplicatesCount=`112`
- dashboard dedupe/history: `wrote=0`, `skipped=0`, `strongSkipped=0`, `history.wrote=0`
- verdict: `NO_NEW_DUPES_DETECTED` (counts stable), but legacy dupes remain

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
