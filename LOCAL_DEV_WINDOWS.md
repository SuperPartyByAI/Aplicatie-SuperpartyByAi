# Local Development on Windows

Quick reference for running the app locally on Windows PowerShell.

## Prerequisites

- Node.js 20+ (or use `.nvmrc` with `nvm use`)
- Firebase CLI: `npm i -g firebase-tools`
- Java 17+ (for Firestore emulator): `winget install EclipseAdoptium.Temurin.17.JDK`
- Flutter (optional, for Flutter app): Install from [flutter.dev](https://flutter.dev)

## Quick Commands (3-5 max)

### 1. Start Emulators + Seed

```powershell
# Terminal 1: Start emulators
npm run emu

# Terminal 2: Seed Firestore (wait for emulators to start)
npm run seed:emu
```

**URL-uri:**
- Firestore: http://127.0.0.1:8082
- Functions: http://127.0.0.1:5002
- Auth: http://127.0.0.1:9098 (consistent with firebase.json)
- UI: http://127.0.0.1:4001

### 2. Build Functions (if changed TypeScript)

```powershell
npm run functions:build
```

### 3. Run Flutter (with emulators)

```powershell
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true
```

**Seed creates:**
- `teams/team_a`, `team_b`, `team_c`
- `teamCodePools/team_a`, `team_b`, `team_c` with free codes

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

### ExecutionPolicy blocks .ps1

**Fix:** Folosește `.cmd` sau `npm` scripts:
```powershell
npm run emu  # nu .ps1 direct
```

### Java not found (Firestore emulator)

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
java -version
```

### Firebase CLI not found

```powershell
npm i -g firebase-tools
# Scripts folosesc deja firebase.cmd
```

### Port already in use

Verifică porturile în `firebase.json`:
- Firestore: 8082
- Functions: 5002
- Auth: 9098

Stop procesul care folosește portul sau schimbă portul în `firebase.json`.

### USE_EMULATORS not working

Verifică că rulezi cu `--dart-define`:
```powershell
flutter run --dart-define=USE_EMULATORS=true
```

Nu edita manual `firebase_service.dart` - este automat prin dart-define.

### Functions build fails

```powershell
cd functions
npm.cmd ci
npm.cmd run build
# Verifică: functions/dist/index.js există
```

## Notes

- All scripts use `.cmd` extensions for Windows compatibility
- Emulator data is stored in `.firebase/` (gitignored)
- Use `demo-test` project for local development (no real Firebase project needed)
