# Canonical Thread Migration Runbook (Firestore)

Goal: merge duplicate threads into a single canonical thread per conversation, without deleting data.

## Pre-reqs
- Backend deployed on Ubuntu (ACTIVE mode, sessions ok).
- Service account available via `FIREBASE_SERVICE_ACCOUNT_JSON` (no output of secrets).
- Ensure **single writer** (only one ACTIVE instance) during apply.

## Dry-run (default)
```bash
node scripts/migrate-firestore-canonical.js --accountId=<accountId> --days=30 --threads=200
```

Interpretation (sanitized output keys):
- `scannedThreads`: total threads inspected
- `mergeCandidates`: threads needing merge
- `messagesScanned`: messages inspected
- `messagesCopied`: would be copied (apply)
- `duplicatesSkipped`: detected duplicates (by docId or fingerprint)
- `timestampsFixedCount`: messages missing tsClient fixed
- `groupNamesFixedCount`: groups where displayName can be corrected
- `aliasMarkedCount`: threads to mark as alias (apply)

## Apply (gated)
```bash
MIGRATE_APPLY=1 node scripts/migrate-firestore-canonical.js --accountId=<accountId> --days=30 --threads=200 --apply
```

Notes:
- No hard deletes; duplicates are **marked** `isDuplicate=true`.
- Source threads are **marked** `isAlias=true` with `aliasTo=<canonicalThreadId>`.

## Rollback
No destructive writes. Stop the script. Aliases can be ignored or reverted by removing `isAlias` fields.

## Post-checks
- Run duplicate audit:
```bash
npm run audit:dupes -- --threadId=<threadId> --limit=500 --windowHours=48
```
- Verify UI: one thread per conversation, correct group name, timestamps correct.

## Duplicate cleanup (soft-mark)
Goal: mark legacy duplicate messages inside a thread without deleting data.

Dry-run (default):
```bash
node scripts/cleanup-firestore-duplicates.js --threadId=<threadId> --windowHours=48 --limit=2000
```

Apply (gated):
```bash
node scripts/cleanup-firestore-duplicates.js --threadId=<threadId> --windowHours=48 --limit=2000 --apply
```

Output keys (sanitized):
- `scannedMessages`
- `groupsWithDuplicates`
- `duplicatesToMark`
- `duplicatesAlreadyMarked`
- `threadsUpdated`
- `sampleGroups` (hashes only)

Notes:
- No hard deletes; duplicates are **marked** `isDuplicate=true` with `duplicateOf`.
- Thread `lastMessageAt` is recalculated from non-duplicate messages.

## Safety
- Do not run concurrently with another writer instance.
- Start with a limited `--days` window to reduce load.
