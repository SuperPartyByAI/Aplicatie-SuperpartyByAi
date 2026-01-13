# AI Event System (AI-only Operations + Admin-only Debug/Control)

## Goal
- **Employees (staff)** can **create / update / assign / archive** events **only via AI chat**.
- **No client writes** to `/evenimente` (or operational substructures).
- **Super-admin only** (`ursache.andrei1995@gmail.com`) can:
  - read full **AI transcripts + steps** (`/evenimente/{eventId}/ai_sessions/...`)
  - edit **global AI config** (`/ai_config/global`) and **per-event overrides** (`/evenimente/{eventId}/ai_overrides/current`) **without redeploy**

## Data model

### Public (employees can read)
`/evenimente/{eventId}` contains **only operational fields**, for example:
- `schemaVersion`
- `shortCode` / `eventShortId`
- `date` / `dateStart`
- `address`
- `clientPhone` / `clientName`
- `roles` (and assignment fields like `assignedCode` / `pendingCode`)
- minimal audit: `createdAt`, `createdByEmail`, `updatedAt`, `updatedByEmail`

**Important**: event docs must NOT contain transcripts or AI logs.

### Admin-only (super-admin can read)
`/evenimente/{eventId}/ai_sessions/{sessionId}`
- `actorUid`, `actorEmail`
- `actionType`
- `startedAt`, `endedAt`
- `effectiveConfig` (global/override versions + hash)
- optional `summary`

`/evenimente/{eventId}/ai_sessions/{sessionId}/messages/{msgId}`
- `role` = `user|assistant`, `text`, `ts`

`/evenimente/{eventId}/ai_sessions/{sessionId}/steps/{stepId}`
- `ts`, `action`, `draftSnapshot`, `missingFields`, `changes`, `modelOutput`

### Super-admin only config
`/ai_config/global`
- `version` (int)
- `eventSchema` (required fields + fields metadata)
- `rolesCatalog` (10 canonical roles)
- `policies` (`requireConfirm`, `askOneQuestion`)
- optional `systemPrompt`, `systemPromptAppend`, `uiTemplates`

`/evenimente/{eventId}/ai_overrides/current`
- `version` (int)
- `overrides` (patch merged over global config)

## Firestore rules (client)
- `/evenimente/{eventId}`: `allow read: if isEmployee(); allow write: if false;`
- `/evenimente/{eventId}/ai_sessions/**`: `allow read: if isSuperAdminEmail(); allow write: if false;`
- `/ai_config/**`: `allow read, write: if isSuperAdminEmail();`
- `/evenimente/{eventId}/ai_overrides/**`: `allow read, write: if isSuperAdminEmail();`

Backend uses Admin SDK (rules do not apply to it).

## Single gateway
Client calls **only**:
- `aiEventGateway` (callable) for event operations.

Implementation notes:
- The gateway delegates to the server-side event ops logic and returns a **strict client contract**:
  - `action`, `message`, `eventId?`, `shortCode?`, `ui.buttons[]`
  - super-admin also receives `debug` (draft/missing/diff + aiSessionPath).

## Seed: /ai_config/global

### Option A: run the seed script
From `functions/`:

```bash
node seed_ai_config_global.js
```

Requirements:
- set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON
- set `FIREBASE_PROJECT_ID` (or ensure ADC resolves project)
- (optional) set `FIRESTORE_EMULATOR_HOST` for local emulator

### Option B: paste JSON in Firestore Console
Create `/ai_config/global` using the JSON template printed by the seed script.

## Manual acceptance test
- **Non-employee** calls `aiEventGateway` → `permission-denied`
- **Employee** notes an event in AI chat → a doc is created/updated in `/evenimente` and appears in Events page
- **Client write** to `/evenimente` (direct) → denied by rules
- **Employee** cannot read `/ai_config`, `/ai_overrides`, `/ai_sessions` → denied by rules
- **Super-admin** can:
  - view `/evenimente/{eventId}/ai_sessions/*` (messages + steps)
  - edit `/ai_config/global` and per-event override
  - see Debug Panel in chat responses (server-controlled)

