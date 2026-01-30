# Verification: Inbox Admin vs Inbox Angajați split

## Summary

- **Inbox Admin** = only 0737571397. Shown to admin; route `/whatsapp/inbox`.
- **Inbox Angajați** = all accounts except 0737571397. Shown to admin and employees; route `/whatsapp/inbox-staff`.
- **getAccountsStaff** filters out admin phone server-side.
- **Firestore rules**: employees cannot read `threads` / `messages` / `extractions` for `accountId` in `config/whatsapp_inbox.adminOnlyAccountIds`.

## Copy-paste commands

Run from project root. **Run step 1 before step 2** (rules use `config/whatsapp_inbox`).

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi

# 1) Resolve admin accountId(s) for 0737571397 and write config/whatsapp_inbox
node scripts/set_admin_only_account.mjs --project superparty-frontend

# 2) Deploy rules
firebase use superparty-frontend
firebase deploy --only firestore:rules

# 3) Deploy functions (getAccountsStaff filter)
firebase deploy --only functions
```

## Manual checklist

- [ ] **Employee:** Sees only Inbox Angajați; cannot open Inbox Admin; no threads from 0737571397.
- [ ] **Admin:** Sees both Inbox Admin and Inbox Angajați; Inbox Admin shows only 0737571397; Inbox Angajați shows all others.
- [ ] **Employee opens admin thread:** Direct navigate to chat with admin `accountId` → **PERMISSION_DENIED**.

## Git diff (relevant files)

- `functions/lib/admin_phone.js` (new)
- `functions/whatsappProxy.js` (getAccountsStaff filter)
- `superparty_flutter/lib/config/admin_phone.dart` (new)
- `superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart` (use `isAdminPhone`)
- `superparty_flutter/lib/screens/whatsapp/whatsapp_screen.dart` (tiles: Inbox Admin, Inbox Angajați)
- `superparty_flutter/lib/screens/whatsapp/staff_inbox_screen.dart` (use `isAdminPhone`)
- `firestore.rules` (config + threads/messages/extractions adminOnlyAccountIds)
- `scripts/set_admin_only_account.mjs` (new)

## Logs

- **getAccountsStaff:** `[getAccountsStaff] Filtered admin-only account: accountId=… phoneLast4=1397`, `Accounts before=N after=M (excluded admin phone 0737571397)`.
- **Flutter:** `[WhatsAppInboxScreen] Filtered (admin phone): 1`, `[StaffInboxScreen] Account: … excluded=true/false`.

## Debug "nu se sincronizează conversațiile"

**Cauza** e în **pipeline-ul de ingestie** (backend → Firestore), nu în UI. Inbox citește doar din Firestore; dacă backend-ul n-a scris threads/messages (history sync, backfill), vezi 0 conversații.

→ **Detalii complete:** `docs/INGESTION_PIPELINE_INBOX.md` (cele 3 cauze, loguri, health/dashboard, aliniere Railway vs Hetzner).

**Ce să cauți în loguri (Flutter / Functions):**

1. **accountsCount, accountIds, threadsCount**
   - Flutter: `[StaffInboxScreen] DEBUG accountsCount=… accountIds=…`, `Rebuild from cache: … threadsCount=…`
   - Flutter: `[WhatsAppInboxScreen] DEBUG accountsCount=… accountIds=…`, `Rebuild from cache: … threadsCount=…`
   - API: `[WhatsAppApiService] getAccounts: success | accountsCount=…`, `getAccountsStaff: success | accountsCount=…`

2. **Status conturi (connected / disconnected / qr_ready / logged_out)**
   - `statusByAccount=…` în DEBUG line; sau `account id=… status=…`

3. **Backend PASSIVE / timeout / backend_error**
   - `waMode=passive` sau `BACKEND PASSIVE` → backend nu e activ; nu se sync.
   - `timeout` → backend URL greșit sau backend lent; verifică WHATSAPP_BACKEND_BASE_URL (Hetzner).
   - `backend_error` → eroare de la backend/proxy.

4. **Manage Accounts**
   - Conturi `disconnected` / `logged_out` → nu se importă nimic până nu reconectezi (QR).
   - Confirmă că WHATSAPP_BACKEND_BASE_URL pointează la Hetzner (ex. `http://37.27.34.179:8080`).

5. **Pipeline ingestie (0 threads dar conturi connected)**
   - Vezi `docs/INGESTION_PIPELINE_INBOX.md`: backfill, Railway vs Hetzner, backend alive, loguri.
