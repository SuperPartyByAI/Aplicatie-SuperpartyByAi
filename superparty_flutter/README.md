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

WebSocket URLs (update if needed):
- Centrala: `lib/screens/centrala/centrala_screen.dart`
- WhatsApp: `lib/screens/whatsapp/whatsapp_screen.dart`

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
 
 
 
 
 
 
 
 
 
