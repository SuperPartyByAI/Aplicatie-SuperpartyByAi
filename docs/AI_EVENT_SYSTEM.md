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

### Config (public + private split)
Public (employees can read):
- `/ai_config/global` (schema, rolesCatalog, uiTemplates)
- `/ai_config_overrides/{eventId}` (override patch)

Private (super-admin only):
- `/ai_config_private/global` (prompt/policies)
- `/ai_config_overrides_private/{eventId}` (override patch)

Functions merge them into an effective config.

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

