# Staff/Admin Callables – Local Emulator Quick Test

## Prerequisites

- Install Firebase CLI (`firebase --version`)
- Install dependencies:

```bash
cd functions
npm install
```

## Build TypeScript

```bash
cd functions
npm run build
```

## Run emulators (Functions + Firestore)

From repo root:

```bash
firebase emulators:start --only functions,firestore
```

## Seed minimal data (Firestore Emulator UI)

Create these docs:

- `teams/teamA`:
  - `label`: `"Echipa A"`
  - `active`: `true`
- `teamCodePools/teamA`:
  - `prefix`: `"A"`
  - `freeCodes`: `[101, 102, 103]`

## Call functions using `firebase functions:shell`

In a second terminal:

```bash
cd functions
firebase functions:shell
```

Examples (the shell prompts you to authenticate; use emulator Auth if needed):

```js
// Allocate first time
allocateStaffCode({ teamId: "teamA" })

// Finalize setup after allocation
finalizeStaffSetup({ phone: "+40722123456", teamId: "teamA", assignedCode: "A103" })
```

## Admin callables

Admin-only callables require either:

- Custom claim `admin: true` on the caller, OR
- `users/{uid}.role == "admin"`

Examples:

```js
changeUserTeam({ uid: "<targetUid>", newTeamId: "teamA", forceReallocate: true })
setUserStatus({ uid: "<targetUid>", status: "blocked" })
```

