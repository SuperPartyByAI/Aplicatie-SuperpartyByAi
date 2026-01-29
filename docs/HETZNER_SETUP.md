# Hetzner Backend Setup Guide

This guide explains how to configure the WhatsApp backend running on Hetzner.

## Flutter App Configuration

### Development (flutter run)

```bash
cd superparty_flutter
flutter run --dart-define=WHATSAPP_BACKEND_URL=http://37.27.34.179:8080
```

**Note:** Default is already Hetzner (`http://37.27.34.179:8080`), so `--dart-define` is optional unless overriding.

### Production Build

```bash
# iOS
flutter build ios --dart-define=WHATSAPP_BACKEND_URL=http://37.27.34.179:8080

# Android
flutter build apk --dart-define=WHATSAPP_BACKEND_URL=http://37.27.34.179:8080
```

### Default Value

The Flutter app has a default backend URL set to Hetzner:
- Default: `http://37.27.34.179:8080` (Hetzner production)
- This is defined in `lib/core/config/env.dart`

If you don't pass `--dart-define=WHATSAPP_BACKEND_URL`, the app will use the default Hetzner URL.

### Debug Indicator

In debug mode, the WhatsApp Inbox screen shows the effective backend URL in the app bar title. This helps verify which backend the app is using.

## Firebase Functions Configuration

Firebase Functions proxy needs to know where the backend is located.

### Set Environment Variable

### Using Firebase Secrets (Recommended for Production)

```bash
# Set secret (more secure than config)
firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL
# Paste: http://37.27.34.179:8080
```

### Using Firebase Config (Fallback for Emulator/Local)

```bash
# Set config (for emulator/local development)
firebase functions:config:set whatsapp.backend_base_url="http://37.27.34.179:8080"
```

### Verify Configuration

After setting the environment variable, redeploy functions:

```bash
firebase deploy --only functions
```

## Verification Checklist

1. **Flutter App:**
   - [ ] Run app with `--dart-define=WHATSAPP_BACKEND_URL=http://37.27.34.179:8080`
   - [ ] In debug mode, check app bar title shows backend URL
   - [ ] Open WhatsApp Inbox → verify threads appear
   - [ ] Send message on phone → verify it appears in app within 10 seconds

2. **Firebase Functions:**
   - [ ] Set `WHATSAPP_BACKEND_BASE_URL` secret or config
   - [ ] Redeploy functions
   - [ ] Test QR code generation (should connect to Hetzner backend)

3. **Backend (Hetzner):**
   - [ ] Verify backend is running on `http://37.27.34.179:8080`
   - [ ] Check logs show message saving to Firestore
   - [ ] Verify `FIREBASE_SERVICE_ACCOUNT_JSON` is set correctly

## Troubleshooting

### Messages appear on phone but not in app

1. **Check backend URL in Flutter:**
   - In debug mode, look at app bar title in WhatsApp Inbox
   - Should show `http://37.27.34.179:8080` (or your Hetzner URL)

2. **Check Hetzner backend logs:**
   ```bash
   ssh root@37.27.34.179
   sudo journalctl -u whatsapp-backend -f
   ```
   - Look for "Message saved" or "message saved to Firestore" logs
   - If no logs appear, the backend might not be receiving messages

3. **Check Firestore:**
   - Open Firebase Console → Firestore
   - Check `threads` collection for new messages
   - Verify `lastMessageAt` and `lastMessageText` are updated

### App shows wrong backend URL

- If app shows wrong backend URL instead of Hetzner:
  1. Rebuild app with `--dart-define=WHATSAPP_BACKEND_URL=http://37.27.34.179:8080`
  2. Clear build cache: `flutter clean && flutter pub get`
  3. Rebuild: `flutter run --dart-define=WHATSAPP_BACKEND_URL=http://37.27.34.179:8080`

### Functions proxy errors

- If Firebase Functions can't reach Hetzner backend:
  1. Verify `WHATSAPP_BACKEND_BASE_URL` secret is set correctly
  2. Check Hetzner firewall allows connections from Firebase Functions
  3. Verify backend is accessible: `curl http://37.27.34.179:8080/health`

## Notes

- The default backend URL in Flutter is already set to Hetzner (`http://37.27.34.179:8080`)
- You only need to pass `--dart-define` if you want to override the default
- For production builds, always specify the backend URL explicitly
- The backend URL indicator in debug mode helps verify configuration
