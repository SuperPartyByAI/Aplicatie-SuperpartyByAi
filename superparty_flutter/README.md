# SuperParty Flutter App

Native Android/iOS app built with Flutter.

## ✅ Features Implemented

### Authentication
- ✅ Login with Firebase Auth
- ✅ Auto-login on app start
- ✅ Logout

### Main Screens
- ✅ Home (grid navigation)
- ✅ Evenimente (Firestore integration)
- ✅ Disponibilitate (calendar + save)
- ✅ Salarizare (salary history)
- ✅ Centrala Telefonică (WebSocket)
- ✅ WhatsApp Chat (WebSocket)
- ✅ Team (staff list)
- ✅ Admin Panel (KYC approvals)
- ✅ AI Chat (with secret commands)

### Background Services
- ✅ Foreground service (keeps app alive)
- ✅ Push notifications (FCM)
- ✅ WebSocket persistent connections

### Special Features
- ✅ Secret admin commands in AI Chat ("admin", "gm")
- ✅ Background service starts on login
- ✅ Push notifications saved to Firestore

---

## 🚀 How to Get APK

### GitHub Actions (Automatic Build)

1. Go to: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions
2. Click latest "Build Flutter APK" workflow
3. Scroll down to "Artifacts"
4. Download "superparty-app.zip"
5. Extract and install APK

**Build triggers automatically on every push to main!**

---

## 📱 Installation

1. Download APK from GitHub Actions
2. Transfer to Android phone
3. Enable "Install from unknown sources" in Settings
4. Tap APK file to install
5. Open SuperParty app
6. Login with your Firebase credentials

---

## 🎯 Secret Commands (AI Chat)

Only for `ursache.andrei1995@gmail.com`:

- Type `admin` → Opens Admin Panel
- Type `gm` → Opens GM mode

---

## 🔧 Configuration

All Firebase config is in `lib/services/firebase_service.dart`

### Local Development with Firebase Emulators

**If Firebase init times out or fails:**

1. **Start emulators and setup adb reverse (one command):**
   ```powershell
   # From repo root
   npm run emu:android
   ```

2. **Verify ports are open:**
   ```powershell
   npm run emu:check
   ```

3. **Run Flutter app:**
   ```powershell
   cd superparty_flutter
   flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true
   ```

**Alternative (without adb reverse):**
```powershell
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=false
```
This uses `10.0.2.2` automatically (works without `adb reverse` setup).

**See:** `RUN_LOCAL_ANDROID.md` for detailed setup instructions and validation tests.

### WhatsApp Backend (Railway)

Set the Railway backend URL at build/run time:

```bash
flutter run --dart-define=WHATSAPP_BACKEND_URL=https://whats-upp-production.up.railway.app
```

Or for release builds:

```bash
flutter build apk --dart-define=WHATSAPP_BACKEND_URL=https://whats-upp-production.up.railway.app
```

Default URL (if not specified): `https://whats-upp-production.up.railway.app`

WebSocket URLs (update if needed):
- Centrala: `lib/screens/centrala/centrala_screen.dart`
- WhatsApp: `lib/screens/whatsapp/whatsapp_screen.dart`

---

### Firefox WhatsApp Web Launcher (macOS)

The app can open WhatsApp Web in Firefox Multi-Account Containers for isolated sessions.

#### Setup

1. **Install Firefox Multi-Account Containers extension:**
   - Open Firefox
   - Install: https://addons.mozilla.org/en-US/firefox/addon/multi-account-containers/

2. **Install the firefox-container script:**
   - Place the script at: `scripts/wa_web_launcher/firefox-container` (relative to repo root)
   - Make it executable:
     ```bash
     chmod +x scripts/wa_web_launcher/firefox-container
     ```

3. **Configure script path (optional):**
   - If script is in a different location, set `WA_WEB_LAUNCHER_PATH` environment variable:
     ```bash
     export WA_WEB_LAUNCHER_PATH=/path/to/firefox-container
     ```

4. **Set signing key (optional, recommended):**
   - To avoid Firefox confirmation dialogs, set `OPEN_URL_IN_CONTAINER_SIGNING_KEY`:
     ```bash
     export OPEN_URL_IN_CONTAINER_SIGNING_KEY=your-signing-key
     ```
   - Or configure in VSCode `launch.json` or IDE run configuration

#### Usage

1. Open the WhatsApp Accounts screen
2. For any account, tap **"Open in Firefox"** button
3. Firefox opens WhatsApp Web in a named container
4. Scan the QR code with your WhatsApp app
5. Each account gets its own isolated container (different color/icon)

#### Troubleshooting

- **Script not found:** Ensure script exists at `scripts/wa_web_launcher/firefox-container` or set `WA_WEB_LAUNCHER_PATH`
- **Permission denied:** Run `chmod +x <script-path>` to make script executable
- **Firefox confirmation dialogs:** Set `OPEN_URL_IN_CONTAINER_SIGNING_KEY` environment variable
- **Only works on macOS:** Firefox container integration is macOS-only

---

## 🐛 Known Issues

1. WebSocket URLs are placeholders - update with real server URLs
2. Background service notification always visible (required for Android)
3. iOS not tested (no Mac available)

---

## 📦 Latest Build

Check GitHub Actions for the latest APK: [Actions Page](https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions/workflows/flutter-build.yml)

---

**Built with ❤️ by Ona**
 
 
 
 
 
 
 
 
 




"test ci/cd" 
# Trigger build
