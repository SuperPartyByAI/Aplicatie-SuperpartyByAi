# Local Development on Windows

Quick reference for running the app locally on Windows PowerShell.

## Prerequisites

- Node.js 20+ (or use `.nvmrc` with `nvm use`)
- Firebase CLI: `npm i -g firebase-tools`
- Java 17+ (for Firestore emulator): `winget install EclipseAdoptium.Temurin.17.JDK`
- Flutter (optional, for Flutter app): Install from [flutter.dev](https://flutter.dev)

## Quick Commands

### Start Firebase Emulators

```powershell
# From repo root
npm run emu
# or
npm run emulators
```

This starts:
- Firestore: http://127.0.0.1:8080
- Functions: http://127.0.0.1:5002
- Auth: http://127.0.0.1:9098
- UI: http://127.0.0.1:4001

### Seed Firestore (after emulators start)

```powershell
npm run seed:emu
```

Creates:
- `teams/team_a`, `team_b`, `team_c`
- `teamCodePools/team_a`, `team_b`, `team_c` with free codes

### Build Functions (TypeScript)

```powershell
npm run functions:build
```

Compiles `functions/src/*.ts` → `functions/dist/*.js`

### Deploy Functions

```powershell
npm run functions:deploy
```

Builds and deploys to Firebase (requires `firebase login` and project access).

### Deploy Firestore Rules

```powershell
npm run rules:deploy
```

## Manual Commands (if scripts don't work)

### Emulators

```powershell
firebase.cmd emulators:start --only firestore,functions,auth --project demo-test
```

### Seed

```powershell
node tools/seed_firestore.js --emulator --project demo-test
```

### Functions Build

```powershell
cd functions
npm.cmd ci
npm.cmd run build
cd ..
```

### Set Admin Claim (for emulator)

```powershell
# After creating user in Auth emulator UI
node tools/set_admin_claim.js --project demo-test --email admin@local.dev
# OR manually in Firestore emulator UI: users/{uid} with {role: "admin"}
```

## Flutter App (with Emulators)

```powershell
cd superparty_flutter
flutter pub get
flutter run --dart-define=USE_EMULATORS=true
```

The app will automatically connect to emulators if `USE_EMULATORS=true` and `kDebugMode`.

## Troubleshooting

### Java not found

```powershell
# Install Java 17
winget install EclipseAdoptium.Temurin.17.JDK

# Verify
java -version
```

### Firebase CLI not found

```powershell
npm i -g firebase-tools
# Or use npx
npx.cmd -y firebase-tools emulators:start ...
```

### Port already in use

Edit `firebase.json` to change emulator ports, or stop the process using the port.

### Functions build fails

```powershell
cd functions
npm.cmd ci
npm.cmd run build
# Check functions/dist/index.js exists
```

## Notes

- All scripts use `.cmd` extensions for Windows compatibility
- Emulator data is stored in `.firebase/` (gitignored)
- Use `demo-test` project for local development (no real Firebase project needed)
