# Test notes: Registration, Admin Inbox, Provisioning

## Copy-paste (rulează din project root)

**Toate comenzile se rulează din rădăcina proiectului.** Admin provisioning: only `ADMIN_EMAIL` (see `scripts/_config.mjs`) unless `--force`.

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi

# 1) Deploy rules
firebase use superparty-frontend
firebase deploy --only firestore:rules

# 2) Provision admin + employee (only ADMIN_EMAIL unless --force)
node scripts/provision_staff_admin.mjs --project superparty-frontend --email ursache.andrei1995@gmail.com

# 3) Flutter
cd superparty_flutter && flutter run
```

Dacă `firebase deploy` dă "Not in a Firebase app directory": ești în `~` sau alt folder. Rulează `cd` la rădăcina proiectului înainte.

---

## A) Registration (self-register vs block)

**Rules:** Users can create **only** their own `users/{uid}` with restricted fields (`uid`, `email`, `phone`, `status`, `createdAt`, `updatedAt`). No `role`, `admin`, etc. Admin can still create any user.

**Flutter:** On Firestore `permission-denied` during register, we show: *"Înregistrarea este permisă doar de administrator. Conturile sunt create de admin."*

### Verification

1. **Self-register allowed (A1):**  
   - Deploy rules: `firebase deploy --only firestore:rules`  
   - In app: Register with new email + phone + password.  
   - **Expected:** Account created, no error.  
   - In Firestore: `users/{uid}` has only `uid`, `email`, `phone`, `status`, `createdAt`, `updatedAt`.

2. **Permission-denied (if you revert to admin-only create):**  
   - Register as new user.  
   - **Expected:** Message *"Înregistrarea este permisă doar de administrator…"* (no generic "eroare neașteptată").  
   - Logs: `[Auth] Firestore error … code=permission-denied`.

---

## B) Inbox gating (employee vs admin)

**App logic (email-only for admin):** See `docs/RBAC_MODEL.md`.
- `isAdmin` = `currentUser.email == adminEmail` (strict; no claims, no users.role)
- `isEmployee` = `staffProfiles/{uid}` exists
- `canSeeAdminInbox` = `isAdmin` only
- `canSeeEmployeeInbox` = `isEmployee` OR `isAdmin`

**Provisioning:** Only `ADMIN_EMAIL` (`scripts/_config.mjs`) can be set as admin unless `--force`. Scripts refuse otherwise (exit 1).

**UI:**
- **Admin:** Manage Accounts + Inbox Admin (0737571397) + Inbox Angajați (+ My Inbox if `myAccountId`).
- **Employee only:** DOAR Inbox Angajați (+ My Inbox if `myAccountId`). No Manage Accounts / Inbox Admin.
- **Non-staff:** None of those tiles. My Inbox only if `myAccountId`.

**Route guards:** `/whatsapp/inbox`, `/whatsapp/accounts` → require `isAdmin` (else redirect `/home`). `/whatsapp/employee-inbox`, `/whatsapp/inbox-staff` → require `canSeeEmployeeInbox` (else `/home`).

### Verification (A / B / C)

| Cont | Așteptat |
|------|----------|
| **A) Admin (ADMIN_EMAIL provisioned)** | Vede Manage Accounts, Inbox (All Accounts), Inbox Angajați; poate deschide Inbox Angajați și vede threads. |
| **B) Employee only (staffProfiles, no admin)** | Vede **doar** Inbox Angajați; NU vede Manage Accounts / Inbox (All Accounts). |
| **C) Non-staff** | Nu vede niciun tile de admin/employee. Navigate direct `/whatsapp/inbox` → redirect `/home`. |

1. **Provision admin:** `node scripts/provision_staff_admin.mjs --project superparty-frontend --email ursache.andrei1995@gmail.com` → deloghează + loghează.
2. **Provision employee-only:** `node scripts/provision_employee_only.mjs --project superparty-frontend --email <EMPLOYEE_EMAIL>`.
3. **Revoke admin:** `node scripts/revoke_admin.mjs --project superparty-frontend --email <EMAIL>` (removes claim, sets `users.role=user`, keeps staffProfile with `role=staff` unless `--deleteStaffProfile`).

---

## C) Provisioning scripts

**Admin (only ADMIN_EMAIL unless --force):**
```bash
node scripts/provision_staff_admin.mjs --project superparty-frontend --email ursache.andrei1995@gmail.com
# Other email: exit 1 unless --force
node scripts/provision_staff_admin.mjs --project superparty-frontend --email other@x.com --force
```

**Employee-only:** `scripts/provision_employee_only.mjs` → `staffProfiles` with `role=staff`; no admin.
```bash
node scripts/provision_employee_only.mjs --project superparty-frontend --email <EMPLOYEE_EMAIL>
```

**Revoke admin:** `scripts/revoke_admin.mjs`
```bash
node scripts/revoke_admin.mjs --project superparty-frontend --email <EMAIL>
node scripts/revoke_admin.mjs --project superparty-frontend --email <EMAIL> --deleteStaffProfile
```

---

## D) Logs to check

| Flow | Log |
|------|-----|
| Register, Firestore permission-denied | `[Auth] Firestore error … code=permission-denied` |
| Staff Inbox open | `[AUTH] uid=… staffProfileExists=… staffProfileRole=…` |
| getAccountsStaff | `[StaffInboxScreen] getAccountsStaff response: success=… accountsCount=…` |
| RoleService gating | `canSeeAdminInbox` / `canSeeEmployeeInbox` from `inboxVisibility()` (debug if added). |

---

## Checklist

- [ ] Self-register works (A1) **or** blocked with explicit message (A2).
- [ ] **A) Admin:** vede Manage Accounts, Inbox (All Accounts), Inbox Angajați; deschide Inbox Angajați, vede threads.
- [ ] **B) Employee only:** vede **doar** Inbox Angajați; NU vede Manage Accounts / Inbox (All Accounts).
- [ ] **C) Non-staff:** nu vede niciun tile admin/employee; `/whatsapp/inbox` → redirect `/home`.
- [ ] `flutter analyze` fără erori; `firebase deploy --only firestore:rules` compilare OK.
