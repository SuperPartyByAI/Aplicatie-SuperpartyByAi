# AI Event System (AI-first + AI-only writes + admin-only sessions)

## Goal
- **Employees (staff)** can **create / update / assign / archive** events **only via AI chat**.
- **Client never writes** operational fields in `/evenimente`.
- **Super-admin only** (`ursache.andrei1995@gmail.com`) can see:
  - AI config (prompt/policies) and edit it without redeploy
  - full transcripts + steps + decided ops for each AI session

## Single source of truth (Functions)
There are **two callables** with strict responsibilities:

### `chatEventOpsV2` (AI interpreter, NO writes)
Input:

```json
{ "text": "...", "sessionId": "s1", "eventId": "optional" }
```

Output (high level):
- `message`: assistant text
- `ui`: primitives (`buttons[]`, `cards[]`)
- `draft`: preview (before confirm)
- `ops[]`: proposed operations (only after confirm)
- `autoExecute`: `true|false` (client should call `aiEventGateway` if true)

### `aiEventGateway` (operational writer)
Input:

```json
{ "sessionId": "s1", "requestId": "idempotency-key", "op": "createEvent", "payload": { ... } }
```

This is the **only** place where `/evenimente` is written (Admin SDK).

## Data model (Firestore)

### Operational events (employees can read, client cannot write)
`/evenimente/{eventId}`
- V3 canonical fields (examples): `schemaVersion`, `eventShortId`, `date`, `dateKey`, `address`, `phoneE164`, `phoneRaw`, `rolesBySlot`, `payment`, `isArchived`
- minimal audit: `createdAt`, `createdByEmail`, `updatedAt`, `updatedByEmail`

**Never** store transcripts/logs in the event doc.

### AI sessions (super-admin only)
`/ai_sessions/{sessionId}`
- `actorUid`, `actorEmail`, `actionType`, `startedAt`, `endedAt`
- `eventId` (null until create is executed)
- `configMeta` (versions + hash + validation errors)
- `extractedDraft`, `decidedOps`, `validationErrors`

`/ai_sessions/{sessionId}/messages/{msgId}`
- `role`: `user|assistant`, `text`, `createdAt`

`/ai_sessions/{sessionId}/steps/{stepId}`
- `kind`, `op`, `requestId`, `status`, `createdAt`, plus debug fields

### Config (super-admin only)
All AI config is **private to super-admin**. Clients (including employees) **never read** config documents.

- `/ai_config/global`
- `/ai_config_private/global`
- `/ai_config_overrides/{eventId}`
- `/ai_config_overrides_private/{eventId}`

Cloud Functions read config via Admin SDK and return only derived `ui`/`draft` to employees.

## Seed config
From `functions/`:

```bash
node seed_ai_config_global.js
```

This seeds:
- `/ai_config/global`
- `/ai_config_private/global`

## Manual acceptance test
- **Non-employee** calls `aiEventGateway` → `permission-denied`
- **Employee** notes an event through AI chat → `chatEventOpsV2` returns CONFIRM → confirm → `aiEventGateway` writes `/evenimente`
- **Direct client write** to `/evenimente/*` → denied by rules
- **Employee** cannot read `/ai_sessions/*` → denied by rules
- **Super-admin** can:
  - view `/ai_sessions/*` transcript + steps + ops
  - edit global config + per-event override JSON screens (takes effect next session)

## Admin security model (hard block)
- **Single source of truth**: `SUPER_ADMIN_EMAIL = "ursache.andrei1995@gmail.com"`
  - Firestore rules: `isSuperAdminEmail()` checks this email
  - Cloud Functions: `functions/authGuards.js` exports `SUPER_ADMIN_EMAIL`
  - Flutter: `lib/core/auth/is_super_admin.dart` exports `superAdminEmail` + `isSuperAdmin(User?)`

- **Firestore rules (non-negotiable)**:
  - All admin collections are **read/write only** for super-admin:
    - `/ai_config/*`, `/ai_config_private/*`
    - `/ai_config_overrides/*`, `/ai_config_overrides_private/*`
    - `/ai_sessions/*` (+ `messages/*`, `steps/*`)
    - `/migrations/*`, `/admin_settings/*` (if used)
    - `/evenimente/{id}/ai_sessions/**` (if any legacy data exists)
  - Any non-admin read attempt results in **PERMISSION_DENIED** even if UI leaks a route.

- **Flutter route guard (anti deep link)**:
  - Any route starting with `/admin` is redirected to `/evenimente` for non-superadmin.
  - Admin menu items/buttons are hidden unless `isSuperAdmin(currentUser)` is true.

