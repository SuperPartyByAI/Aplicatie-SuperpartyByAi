# RBAC findings — Admin / Employee / Staff Inbox

## Where “admin” is decided

| Source | File | Lines | Notes |
|--------|------|-------|--------|
| **Custom claim** `admin` | `superparty_flutter/lib/services/admin_service.dart` | 44–47 | `token.claims?['admin'] == true` via `getIdTokenResult(true)`. |
| **Firestore** `users/{uid}.role` | `admin_service.dart` | 51–55 | Fallback if no claim; `role == 'admin'` → admin. |
| **Scripts** | `scripts/set_admin_role.js`, `tools/set_admin_claim.js` | — | Set claim and/or `users` role. |

Flutter uses **either** claim **or** `users.role` for “admin” (Manage Accounts, Inbox All Accounts). No allowlist in Flutter.

## Where “employee” is decided

| Source | File | Lines | Notes |
|--------|------|-------|--------|
| **Allowlist** (Functions) | `functions/whatsappProxy.js` | 17–18, 24–28, 76–84 | `SUPER_ADMIN_EMAIL` + `getAdminEmails()` (env `ADMIN_EMAILS`). Email in list → `isEmployee: true`, `role: 'admin'`. |
| **Firestore** `staffProfiles/{uid}` | `whatsappProxy.js` | 86–108 | If doc exists → `isEmployee: true`; `role` from `staffData.role` (e.g. `admin`, `gm`, `staff`). |

Functions **never** use `users.role` for employee. Employee = allowlist **or** `staffProfiles/{uid}`.

## Staff / Employee Inbox data source

| What | File | Lines |
|------|------|--------|
| **getAccountsStaff** (API) | `functions/whatsappProxy.js` | 743–846 |
| **RBAC** | `requireEmployee` → `isEmployee(uid, email)` | 342–360, 76–108 |
| **Flutter** | `whatsapp_api_service.dart` → `getAccountsStaff()` | 376–455 |
| **Staff Inbox** | `staff_inbox_screen.dart` | 604–681 |
| **Employee accountIds** | `whatsapp_account_service.dart` | 39–69 | `users.employeeWhatsAppAccountIds` or `staffProfiles.whatsAppAccountIds` / `employeeWhatsAppAccountIds`. |

## Minimal path for “admin view” + Staff Inbox

1. **staffProfiles/{uid}** with `role: 'admin'` → Functions `isEmployee` ✓, getAccountsStaff ✓.
2. **users/{uid}.role** = `'admin'` **and** custom claim **admin: true** → Flutter `isCurrentUserAdmin()` ✓ (Manage Accounts, Inbox All).

Use one script that sets **claim + users.role + staffProfiles** (see `scripts/set_admin_claims.mjs`).

---

## Verification

**Important:** Run everything from the **project root**  
`/Users/universparty/Aplicatie-SuperpartyByAi`  
(or `~/Aplicatie-SuperpartyByAi`). The `scripts/` and `superparty_flutter/` folders are inside it.

### 1. Set admin + employee for your user

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
node scripts/set_admin_claims.mjs --project superparty-frontend --email YOUR_REAL_EMAIL --admin --employee
```

Replace `YOUR_REAL_EMAIL` with your Firebase Auth email (e.g. `superpartybyai@gmail.com`).  
Uses ADC or `GOOGLE_APPLICATION_CREDENTIALS` (see VERIFICATION_WHATSAPP_INBOX.md).

Then **sign out and sign in again** in the app so claims and role apply.

### 2. Run app and open Staff Inbox

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/superparty_flutter
flutter run
```

- Open **WhatsApp** → **Inbox Angajați** (or **Employee Inbox** if visible).
- In logs, grep for `[AUTH]` and `getAccountsStaff`:

```
[AUTH] uid=... email=... claimsKeys=[...] adminClaimPresent=true staffProfileExists=true staffProfileRole=admin
[StaffInboxScreen] getAccountsStaff response: success=true, accountsCount=...
```

### 3. Call whatsappWhoAmI (optional)

`whatsappWhoAmI` returns **404** until you deploy it:

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/functions
firebase use superparty-frontend
firebase deploy --only functions:whatsappWhoAmI
```

Then, with a **real** ID token (from the app or a small test script):

```bash
curl -s -H "Authorization: Bearer YOUR_REAL_ID_TOKEN" \
  "https://us-central1-superparty-frontend.cloudfunctions.net/whatsappWhoAmI"
```

Expected JSON: `uid`, `email`, `isAdmin`, `isEmployee`, `claimsKeys`, `staffProfileExists`, `staffProfileRole`.

### 4. Functions logs

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
firebase use superparty-frontend
firebase functions:log --project superparty-frontend --only whatsappWhoAmI,whatsappProxyGetAccountsStaff
```

Confirm requests hit auth (e.g. `[whatsappWhoAmI] requestId=...`, `[whatsappProxy/getAccountsStaff]`).

### If this still doesn’t work, next 2 checks are …

1. **403 on getAccountsStaff** → Functions `isEmployee`: allowlist **or** `staffProfiles/{uid}`. Ensure `staffProfiles/<uid>` exists and has `role` (e.g. `admin`). Run `set_admin_claims.mjs --employee` for that user.
2. **No Admin UI (Manage Accounts / Inbox All)** → Flutter `isCurrentUserAdmin()` uses **claim** or **users.role**. Ensure you ran `--admin`, then **re-login** so the new token includes `admin: true` and Firestore `users/{uid}.role == 'admin'`.
