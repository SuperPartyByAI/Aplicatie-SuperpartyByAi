# RBAC model – admin și inbox-uri

## Model ales: **email-only** pentru admin

**Admin** = strict utilizatorul cu email `ursache.andrei1995@gmail.com`.  
**Employee** = există `staffProfiles/{uid}` (Firestore).  
Nu se folosesc **claims** sau **users.role** pentru a defini admin în app / rules / functions.

---

## Unde e aplicat

| Locus | Ce se verifică |
|-------|-----------------|
| **Flutter** | `RoleService.isAdmin()` = `currentUser.email == adminEmail` (din `admin_config.dart`). `AdminService`, `AdminBootstrapService`, `ai_chat_screen` la fel. |
| **Firestore rules** | `isAdminUser()` = `request.auth.token.email == 'ursache.andrei1995@gmail.com'`. |
| **Functions** | `SUPER_ADMIN_EMAIL` în whatsappProxy; bootstrap allowlist `['ursache.andrei1995@gmail.com']`. |
| **Scripturi** | `ADMIN_EMAIL` în `scripts/_config.mjs`; `set_admin_claims` / `provision_staff_admin` permit `--admin` doar pentru acest email (sau `--force`). |

---

## Gating UI (WhatsApp)

- **Admin** → Manage Accounts, Inbox Admin (0737571397), Inbox Angajați.
- **Employee (nu admin)** → doar Inbox Angajați.
- **Non-staff** → nu vede Inbox Angajați; poate vedea My Inbox dacă există `myAccountId`.

---

## Route guards

- `/whatsapp/inbox`, `/whatsapp/accounts` → `RoleService.isAdmin()`; altfel redirect `/home`.
- `/whatsapp/employee-inbox`, `/whatsapp/inbox-staff` → `RoleService.canSeeEmployeeInbox()` (isEmployee \|\| isAdmin); altfel redirect `/home`.

---

## Verificare A / B / C

| Scenario | Login | Așteptat |
|----------|-------|----------|
| **A** | `ursache.andrei1995@gmail.com` | Manage Accounts + Inbox Admin + Inbox Angajați; poate deschide Inbox Angajați și vede threads. |
| **B** | Alt email cu `staffProfiles/{uid}` | Doar Inbox Angajați; nu vede Manage Accounts / Inbox Admin. |
| **C** | Alt email fără staffProfiles | Nu vede Inbox Angajați; nu vede Manage Accounts / Inbox Admin. Poate vedea My Inbox dacă are `myAccountId`. |

---

## Aliniere end-to-end

- **Flutter**: un singur criteriu pentru admin = email (config). Fără claims / users.role.
- **Rules**: `isAdminUser()` doar email. Fără allowlist / `getUserAllowedAccounts` pentru admin.
- **Functions**: allowlist bootstrap = acel email; proxy folosește `SUPER_ADMIN_EMAIL` + staffProfiles pentru employee.
- **Scripturi**: `--admin` permis doar pentru `ADMIN_EMAIL` (sau `--force`).

Dacă se schimbă modelul (de ex. revine claims/users.role), trebuie actualizate toate aceste locuri.
