# Message waKeyId Migration Guide

## Overview

This migration ensures that all messages have a valid WhatsApp key ID (`waKeyId`) stored, which is required for `fetchMessageHistory` to work correctly in backfill/recent-sync operations.

**⚠️ IMPORTANT**: Backfill-ul este "best-effort" și nu garantează recuperarea istoricului lipsă. Pentru recuperare completă de istoric, folosește History Sync la (re)pair (vezi secțiunea "Recuperare Istoric Complet").

## Problem

- Old messages in Firestore don't have `key.id` (original WhatsApp message ID) saved
- Without `waKeyId`, `fetchMessageHistory` cannot construct a valid `oldestMsgKey` → backfill returns 0 messages
- New messages (after fix) have `key.id` saved, but old messages need migration

## Solution

1. **Standardized extraction**: `lib/extract-wa-key-id.js` extracts `waKeyId` from various field formats
2. **Writer standardization**: New messages use `key.id` as `doc.id` when available
3. **Migration script**: `scripts/migrate-message-waKeyId.js` migrates old messages (last 7 days by default)
4. **Helper update**: `lib/fetch-messages-wa.js` only uses messages with valid `waKeyId` as anchors

## Usage

**⚠️ RECOMANDARE**: Rulează migrarea pe serverul Hetzner, unde backend-ul are deja credențiale funcționale pentru Firestore. Varianta locală necesită configurare suplimentară de credențiale.

### Opțiunea 1: CLI Script direct pe server (CEL MAI SIMPLU - Recomandat)

**Nu necesită deploy** - rulează direct scriptul pe server:

```bash
ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443"

# Dry run (verifică ce s-ar face)
ssh root@37.27.34.179 "
cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend &&
ACCOUNT_ID=${ACCOUNT_ID} DAYS=7 DRY_RUN=1 node scripts/migrate-message-waKeyId.js
"

# Migrare reală
ssh root@37.27.34.179 "
cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend &&
ACCOUNT_ID=${ACCOUNT_ID} DAYS=7 DRY_RUN=0 node scripts/migrate-message-waKeyId.js
"
```

**Monitorizare progres**:
```bash
# Urmărește logs în timp real
ssh root@37.27.34.179 "journalctl -u whatsapp-backend -f | egrep -i 'waKeyId|migration|migrate-message-keyid|copied|missingWaKeyId|summary'"

# Verifică efectul (recent-sync/backfill)
ssh root@37.27.34.179 "journalctl -u whatsapp-backend -n 600 --no-pager | egrep -i 'recent-sync.*end|fetchStats|threadsNoAnchorKeyId|messagesFetched' | tail -n 200"
```

### Opțiunea 2: Endpoint Admin (Necesită deploy)

Rulează migrarea prin endpoint-ul admin de pe serverul Hetzner:

```bash
ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443"

# Obține ADMIN_TOKEN din serviciu (fără să-l expui în chat)
ssh root@37.27.34.179 "systemctl show whatsapp-backend --property=Environment"

# Dry run (verifică ce s-ar face)
ssh root@37.27.34.179 "
curl -sS -X POST \
  -H 'Authorization: Bearer '\"\$ADMIN_TOKEN\" \
  'http://127.0.0.1:8080/admin/migrate-message-keyid/${ACCOUNT_ID}?days=7&dryRun=1'
"

# Migrare reală
ssh root@37.27.34.179 "
curl -sS -X POST \
  -H 'Authorization: Bearer '\"\$ADMIN_TOKEN\" \
  'http://127.0.0.1:8080/admin/migrate-message-keyid/${ACCOUNT_ID}?days=7&dryRun=0'
"
```

**Monitorizare progres**:
```bash
# Urmărește logs în timp real
ssh root@37.27.34.179 "journalctl -u whatsapp-backend -f | egrep -i 'waKeyId|migration|migrate-message-keyid|copied|missingWaKeyId|summary'"

# Verifică efectul (recent-sync/backfill)
ssh root@37.27.34.179 "journalctl -u whatsapp-backend -n 600 --no-pager | egrep -i 'recent-sync.*end|fetchStats|threadsNoAnchorKeyId|messagesFetched' | tail -n 200"
```

**Notă**: Endpoint-ul necesită ca codul să fie deployat pe server. Dacă primești eroarea "Cannot POST", înseamnă că endpoint-ul nu există încă pe server. Folosește **Opțiunea 1** (CLI Script direct) care nu necesită deploy.

### Opțiunea 3: CLI Script local (Nu recomandat - necesită configurare credențiale)

**IMPORTANT**: Rulează comanda din directorul `whatsapp-backend`:

**Pe local (Mac)** - Opțiunea 1: Folosind gcloud Application Default Credentials:
```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/whatsapp-backend

# Configurează credențialele (doar o dată)
gcloud auth application-default login

# Dry run (recommended first)
ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443" \
DAYS=7 \
DRY_RUN=1 \
node scripts/migrate-message-waKeyId.js

# Real migration
ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443" \
DAYS=7 \
DRY_RUN=0 \
node scripts/migrate-message-waKeyId.js
```

**Pe local (Mac)** - Opțiunea 2: Folosind fișier de service account:
```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/whatsapp-backend

# Dry run
GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json" \
ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443" \
DAYS=7 \
DRY_RUN=1 \
node scripts/migrate-message-waKeyId.js

# Real migration
GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json" \
ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443" \
DAYS=7 \
DRY_RUN=0 \
node scripts/migrate-message-waKeyId.js
```

**Pe local (Mac)** - Opțiunea 2: Folosind fișier de service account:
```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/whatsapp-backend

# Dry run
GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json" \
ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443" \
DAYS=7 \
DRY_RUN=1 \
node scripts/migrate-message-waKeyId.js

# Real migration
GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json" \
ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443" \
DAYS=7 \
DRY_RUN=0 \
node scripts/migrate-message-waKeyId.js
```

**Notă**: Pentru rulare locală, trebuie să refaci ADC login cu scope-ul corect:
```bash
gcloud auth application-default login --no-launch-browser --scopes=https://www.googleapis.com/auth/cloud-platform
```

## What the Migration Does

1. **Scans canonical threads** (non-@lid) for the account
2. **For each thread**, queries messages from last N days
3. **For each message**:
   - Extracts `waKeyId` using priority: `key.id` → `waMessageId` → `message.key.id` → `doc.id` (if looks like WA ID)
   - If `waKeyId` found:
     - Updates `key.id` field if missing
     - If `doc.id != waKeyId`, copies message to `messages/{waKeyId}` and marks old doc with `migratedTo`
   - If `waKeyId` not found: marks as `missingWaKeyId: true`

## Verification

After migration, check:

1. **Firestore**: `accounts/{accountId}.lastMessageIdMigrationResult`
   ```json
   {
     "threadsScanned": 14,
     "messagesScanned": 150,
     "messagesUpdated": 120,
     "messagesCopiedToNewId": 30,
     "messagesStillMissingKeyId": 0,
     "errors": 0
   }
   ```

2. **Logs**: Recent-sync should show `messagesFetched > 0`
   ```
   [recent-sync] ... end ... messages=15 ... | fetchStats: threadsProcessed=14 threadsNoAnchorKeyId=0 messagesFetched=15
   ```

3. **API**: Check if messages exist in canonical threads
   ```bash
   curl "http://127.0.0.1:8080/api/whatsapp/messages/${ACCOUNT_ID}/${THREAD_ID}?limit=1" | jq '.count'
   # Should be > 0
   ```

## Notes

- Migration is **idempotent**: safe to run multiple times
- Old docs are **not deleted** automatically (marked with `migratedTo` for safety)
- Only processes **canonical threads** (skips @lid)
- Uses **batch writes** (max 450 ops per batch) for efficiency
- **Dry run** mode logs what would be done without making changes

## Firestore Index Required

Recent-sync necesită un index Firestore compus pentru query-ul de threads. Vezi [FIRESTORE_INDEXES.md](./FIRESTORE_INDEXES.md) pentru instrucțiuni complete.

**Quick fix**: Când vezi eroarea în logs cu link-ul de index, deschide link-ul și creează indexul.

## Troubleshooting

### `messagesStillMissingKeyId > 0`

Some messages don't have a recoverable `waKeyId`. These cannot be used for backfill. Options:
- Re-pair account to trigger `messaging-history.set` (full history sync)
- Accept that these messages won't be backfilled

### `messagesCopiedToNewId > 0`

Messages were copied to new doc IDs. Old docs remain with `migratedTo` field. You can:
- Keep them (no harm, just duplicates)
- Delete manually after verifying new docs work
- Run cleanup script (not provided, but can be added)

### Migration takes too long

- Reduce `LIMIT_THREADS` and `LIMIT_MESSAGES_PER_THREAD`
- Process in batches by account
- Run during low-traffic periods
