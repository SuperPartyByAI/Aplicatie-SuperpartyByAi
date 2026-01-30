# TASK 3 — Verification artifacts

**Model RBAC:** Admin = strict email-only. See `docs/RBAC_MODEL.md`.

## 1) Git diff

### Modified files

- `STANDARDIZE_HETZNER_BACKEND.md`: removed Railway mention; now "Nu mai există referințe la alt provider; backend este Hetzner."
- `superparty_flutter/lib/services/role_service.dart`: isAdmin = **email-only** (adminEmail); isEmployee = staffProfiles; inboxVisibility + debug log.
- `superparty_flutter/lib/services/admin_service.dart`: isCurrentUserAdmin = **email-only**.
- `superparty_flutter/lib/services/admin_bootstrap_service.dart`: _isAlreadyAdmin = **email-only**.
- `superparty_flutter/lib/screens/whatsapp/whatsapp_screen.dart`: gating via RoleService.inboxVisibility; admin / employee / My Inbox tiles; non-staff sees none of admin/employee tiles.
- `docs/TEST_PROVISION_INBOX.md`: updated for claims+role, ADMIN_EMAIL + --force, revoke_admin.

Run from project root:

```bash
git diff -- STANDARDIZE_HETZNER_BACKEND.md superparty_flutter/lib/services/role_service.dart \
  superparty_flutter/lib/services/admin_service.dart superparty_flutter/lib/services/admin_bootstrap_service.dart \
  superparty_flutter/lib/screens/whatsapp/whatsapp_screen.dart
```

### New files

- `scripts/_config.mjs`: `export const ADMIN_EMAIL = 'ursache.andrei1995@gmail.com';`
- `superparty_flutter/lib/config/admin_config.dart`: `const String adminEmail = 'ursache.andrei1995@gmail.com';`
- `scripts/set_admin_claims.mjs`: full implementation (ADMIN_EMAIL, --force, refuse logic, loadServiceAccount, etc.)
- `scripts/provision_staff_admin.mjs`: wrapper that runs set_admin_claims with --admin --employee; forwards --force.
- `scripts/revoke_admin.mjs`: revoke admin (claim false, users.role=user, staffProfile kept as staff or deleted with --deleteStaffProfile).

---

## 2) Copy-paste commands to test

### A) Employee-only user → sees only Inbox Angajați

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
node scripts/provision_employee_only.mjs --project superparty-frontend --email <EMPLOYEE_EMAIL>
# Log out, log in as that user. Open app → WhatsApp.
# Expected: only "Inbox Angajați"; no "Manage Accounts", no "Inbox Admin".
```

### B) Admin (ursache) → sees Admin inbox + Inbox Angajați

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
node scripts/provision_staff_admin.mjs --project superparty-frontend --email ursache.andrei1995@gmail.com
# Log out, log in as that user. Open app → WhatsApp.
# Expected: "Manage Accounts", "Inbox Admin", "Inbox Angajați" (and "My Inbox" if myAccountId).
```

### C) Non-staff user → sees neither

```bash
# Use an account with no staffProfiles and no admin claim/users.role.
# Open app → WhatsApp.
# Expected: no "Manage Accounts", no "Inbox Admin", no "Inbox Angajați". "My Inbox" only if myAccountId.
# Navigate to /whatsapp/inbox → redirect to /home.
```

### Refuse admin for other email (unless --force)

```bash
node scripts/set_admin_claims.mjs --project superparty-frontend --email <OTHER_EMAIL> --admin
# Expected: "Refused: admin can only be set for ursache.andrei1995@gmail.com. Use --employee for other users, or --force to override." and exit 1.

node scripts/set_admin_claims.mjs --project superparty-frontend --email <OTHER_EMAIL> --admin --force
# Expected: proceeds (use only for testing).
```

### Revoke admin

```bash
node scripts/revoke_admin.mjs --project superparty-frontend --email <EMAIL>
# Expected: custom claim admin=false, users.role=user, staffProfiles kept with role=staff. User must re-login.
```

---

## 3) Expected log lines (Flutter) that prove gating

When opening the WhatsApp screen (or when `inboxVisibility()` is used), in **debug** builds you should see:

```
[RoleService] inboxVisibility isAdmin=<true|false> isEmployee=<true|false> canSeeAdminInbox=<true|false> canSeeEmployeeInbox=<true|false>
```

- **Admin:** `isAdmin=true` → `canSeeAdminInbox=true`, `canSeeEmployeeInbox=true`.
- **Employee only:** `isAdmin=false`, `isEmployee=true` → `canSeeAdminInbox=false`, `canSeeEmployeeInbox=true`.
- **Non-staff:** `isAdmin=false`, `isEmployee=false` → `canSeeAdminInbox=false`, `canSeeEmployeeInbox=false`.

Route guards use `RoleService().isAdmin()` for `/whatsapp/inbox` and `/whatsapp/accounts`, and `RoleService().canSeeEmployeeInbox()` for `/whatsapp/employee-inbox` and `/whatsapp/inbox-staff`. Denied users are redirected to `/home`.
