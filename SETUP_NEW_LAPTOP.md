# Setup on New Laptop

Complete guide to set up this project on a fresh Windows machine.

## Prerequisites

### 1. Install Required Software

**Node.js 20+**
```powershell
# Download from https://nodejs.org/ or use winget:
winget install OpenJS.NodeJS.LTS
node --version  # Verify: should show v20.x or higher
```

**Flutter SDK**
```powershell
# Download from https://flutter.dev/docs/get-started/install/windows
# Extract to C:\src\flutter (recommended, NOT in OneDrive)
# Add to PATH:
$env:Path = "C:\src\flutter\bin;$env:Path"
flutter --version  # Verify installation
```

**Firebase CLI**
```powershell
npm install -g firebase-tools
firebase --version  # Verify
```

**Java 17+ (for Firestore emulator)**
```powershell
winget install EclipseAdoptium.Temurin.17.JDK
java -version  # Verify
```

**Android Studio** (for Android development)
- Download from https://developer.android.com/studio
- Install Android SDK (API 33+)
- Create an Android Virtual Device (AVD)

**Git**
```powershell
winget install Git.Git
git --version  # Verify
```

### 2. Clone Repository

**⚠️ IMPORTANT: Avoid OneDrive paths!**

OneDrive can cause file locking issues during builds. Recommended locations:
- `C:\dev\Aplicatie-SuperpartyByAi` (recommended)
- `C:\projects\Aplicatie-SuperpartyByAi`
- **NOT** `C:\Users\<user>\OneDrive\Desktop\...`

```powershell
# Clone from GitHub
cd C:\dev
git clone https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi.git
cd Aplicatie-SuperpartyByAi
```

### 3. Install Dependencies

**Node.js dependencies (root)**
```powershell
npm install
```

**Functions dependencies**
```powershell
cd functions
npm install
cd ..
```

**Flutter dependencies**
```powershell
cd superparty_flutter
flutter pub get
cd ..
```

### 4. Configure Secrets (REQUIRED)

**Firebase Configuration Files**

1. **Android: `google-services.json`**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select project: `superparty-frontend`
   - Project Settings → Your apps → Android app
   - Download `google-services.json`
   - Place it at: `superparty_flutter\android\app\google-services.json`
   - ⚠️ This file is NOT committed (see `.gitignore`)

2. **iOS: `GoogleService-Info.plist`** (if developing for iOS)
   - Download from Firebase Console → iOS app
   - Place at: `superparty_flutter\ios\Runner\GoogleService-Info.plist`
   - ⚠️ This file is NOT committed

3. **Flutter: `firebase_options.dart`** (auto-generated)
   ```powershell
   cd superparty_flutter
   flutter pub global activate flutterfire_cli
   flutterfire configure
   # Select project: superparty-frontend
   # Select platforms: android, ios (if needed), web
   ```
   - This generates `lib/firebase_options.dart`
   - ⚠️ This file is NOT committed (contains API keys)

**Environment Variables**

Create `.env` file in root (NOT committed):
```powershell
# Copy example
Copy-Item RAILWAY-VARIABLES.env.example .env
# Edit .env with your actual values
```

Required variables (see `RAILWAY-VARIABLES.env.example` for full list):
- `OPENAI_API_KEY` (for AI features)
- `TWILIO_ACCOUNT_SID` (for WhatsApp/Voice)
- `TWILIO_AUTH_TOKEN`
- Other service credentials as needed

### 5. Enable Windows Developer Mode (for Flutter symlinks)

```powershell
# Open Windows Settings → Privacy & Security → For developers
# Toggle "Developer Mode" ON
# Or run:
start ms-settings:developers
```

After enabling, restart Cursor/VS Code.

### 6. Verify Setup

**Check Flutter**
```powershell
cd superparty_flutter
flutter doctor
# Should show no critical issues
```

**Check Firebase CLI**
```powershell
firebase login
firebase projects:list
# Should show superparty-frontend
```

**Test Emulators**
```powershell
# From repo root
npm run emu:check
# Should show all ports OPEN (after starting emulators)
```

### 7. Start Development

**Option 1: One-Command Setup (Recommended)**
```powershell
# From repo root
npm run emu:fix
# This will:
# - Free any blocked ports
# - Start Firebase emulators
# - Seed Firestore
# - Verify everything works
```

**Option 2: Manual 3-Terminal Setup**
```powershell
# Terminal 1: Start emulators
npm run emu

# Terminal 2: Seed Firestore (wait for emulators to start)
npm run seed:emu

# Terminal 3: Run Flutter
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=false
```

**Android Emulator Setup**
```powershell
# If using Android emulator, setup adb reverse:
.\scripts\adb_reverse_emulators.ps1

# Then run Flutter with adb reverse:
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true
```

### 8. Troubleshooting

**Port conflicts**
```powershell
# Check what's using ports
$ports = 4401,4001,9098,8082,5002,4500,4501
Get-NetTCPConnection -ErrorAction SilentlyContinue |
  Where-Object { $ports -contains $_.LocalPort } |
  Select-Object LocalPort,OwningProcess

# Kill processes if needed
Stop-Process -Id <PID> -Force
```

**OneDrive file locks**
- Move project out of OneDrive (see step 2)
- Or pause OneDrive sync during builds
- Or exclude build folders from sync

**Flutter build failures**
```powershell
cd superparty_flutter
.\scripts\flutter_reset_windows.ps1
flutter clean
flutter pub get
```

**Firebase init timeout**
- Verify emulators are running: `npm run emu:check`
- Check `adb reverse` if using Android emulator
- See `RUN_LOCAL_ANDROID.md` for detailed troubleshooting

### 9. Project Structure

```
Aplicatie-SuperpartyByAi/
├── functions/              # Firebase Cloud Functions (TypeScript)
├── superparty_flutter/     # Flutter mobile app
├── tools/                  # Utility scripts
├── scripts/                # Development scripts
├── firebase.json           # Firebase emulator config
├── package.json            # Root npm scripts
└── .gitignore             # Git ignore rules
```

### 10. Next Steps

- Read `README.md` for project overview
- Read `LOCAL_DEV_WINDOWS.md` for local development guide
- Read `RUN_LOCAL_ANDROID.md` for Android emulator setup
- Read `WINDOWS_RUNBOOK.md` for Windows-specific workflows

## Secrets Checklist

Before running the app, ensure you have:

- [ ] `google-services.json` in `superparty_flutter/android/app/`
- [ ] `firebase_options.dart` generated (via `flutterfire configure`)
- [ ] `.env` file in root with required API keys
- [ ] Firebase CLI logged in (`firebase login`)
- [ ] Android Studio configured with SDK and AVD

## Support

If you encounter issues:
1. Check `WINDOWS_TROUBLESHOOTING.md` (if exists)
2. Check `ANDROID_TROUBLESHOOTING.md` in `superparty_flutter/`
3. Run `npm run emu:check` to verify emulator setup
4. Check Firebase emulator UI: http://127.0.0.1:4001
