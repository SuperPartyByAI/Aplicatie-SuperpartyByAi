# Local Run Checklist

## Prerequisites

```bash
# 1. Flutter setup
flutter doctor
cd superparty_flutter && flutter pub get

# 2. Firebase setup
firebase login
firebase use superparty-frontend

# 3. Environment variables
export WHATSAPP_BACKEND_URL='http://37.27.34.179:8080'
# OR use functions/.runtimeconfig.json (already configured)
```

## Step 1: Start Firebase Emulators

**Terminal 1:**
```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
export WHATSAPP_BACKEND_URL='http://37.27.34.179:8080'
firebase emulators:start --only firestore,functions,auth
```

**Wait for:**
```
✔  All emulators ready!
```

## Step 2: Start Flutter App

**Terminal 2:**
```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/superparty_flutter
flutter run -d emulator-5554 --dart-define=USE_EMULATORS=true
```

**OR if emulator not running:**
```bash
flutter devices
flutter emulators --launch Medium_Phone_API_36.1
# Wait for emulator to boot, then:
flutter run -d emulator-5554 --dart-define=USE_EMULATORS=true
```

## Step 3: Test Flows

### A) WhatsApp Accounts Flow

1. **Login** to app (Firebase Auth)
2. **Navigate** to WhatsApp Accounts screen
3. **List accounts:**
   - Should show accounts (not 500 error)
   - Check logs: `[WhatsAppApiService] getAccounts: status=200`
4. **Add account:**
   - Name: "Test Account"
   - Phone: "+40712345678"
   - Should create + show QR code
5. **Regenerate QR:**
   - Click regenerate on an account
   - Should update QR code

**Debug logs:**
```bash
adb -s emulator-5554 logcat | grep -iE "WhatsApp|whatsapp|500|error"
```

### B) AI "Notare" / Event Creation

1. **Navigate** to AI Chat screen
2. **Test interactive flow:**
   - Type: "Notează o petrecere pe 15 martie"
   - Follow prompts: name, age, date, address
   - Confirm: "da"
   - Should create event
3. **Test direct command:**
   - Type: "/event petrecere pe 20 martie pentru Maria, 5 ani, la Grand Hotel"
   - Preview should show
   - Confirm creation
   - Should create event

**Debug logs:**
```bash
adb -s emulator-5554 logcat | grep -iE "AIChat|chatEventOps|error"
firebase functions:log | grep -iE "chatEventOps|chatWithAI"
```

**Check Firestore:**
- Collection: `evenimente`
- Fields: `date`, `isArchived: false`, `childName`, `address`, `roles`, etc.

### C) Events Page Display

1. **Navigate** to Events screen ("Evenimente")
2. **Verify:**
   - Events created in step B should appear
   - Real-time updates (add event → should appear immediately)
3. **Test filters:**
   - Date preset: today, yesterday, last7, next7, next30
   - Driver filter: all, yes, open, no
   - Code filter: NEREZOLVATE, REZOLVATE, or specific code
   - Noted by: staff code

**Debug logs:**
```bash
adb -s emulator-5554 logcat | grep -iE "Evenimente|evenimente|error"
```

## Step 4: Monitor Logs

### Flutter Logs
```bash
# Real-time WhatsApp logs
./scripts/watch-whatsapp-logs.sh

# OR manual
adb -s emulator-5554 logcat | grep -iE "WhatsApp|AIChat|Evenimente|error|500"
```

### Firebase Functions Logs
```bash
firebase functions:log | grep -iE "chatEventOps|chatWithAI|whatsapp|error"
```

### Firestore Emulator UI
```
http://localhost:4001
```

## Troubleshooting

### Issue: 500 error on WhatsApp calls
**Fix:**
```bash
# Check secret
firebase functions:secrets:access WHATSAPP_BACKEND_URL

# OR set env var for emulator
export WHATSAPP_BACKEND_URL='http://37.27.34.179:8080'
firebase emulators:start --only functions
```

### Issue: Events not appearing
**Fix:**
1. Check Firestore rules (allow read for authenticated users)
2. Verify event has `isArchived: false`
3. Check date format: `DD-MM-YYYY`
4. Verify collection name: `evenimente` (not `evenimente` with typo)

### Issue: AI chat not responding
**Fix:**
1. Check GROQ_API_KEY secret:
   ```bash
   firebase functions:secrets:access GROQ_API_KEY
   ```
2. Check logs for errors:
   ```bash
   firebase functions:log | grep chatWithAI
   ```

### Issue: Emulator not connecting
**Fix:**
```bash
adb devices
flutter devices
# If no devices, restart emulator:
flutter emulators --launch Medium_Phone_API_36.1
```

## Production Deployment

After testing locally:

```bash
# 1. Deploy Functions
cd functions
firebase deploy --only functions:chatEventOps,functions:chatWithAI,functions:whatsappProxyGetAccounts,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr

# 2. Verify secrets
firebase functions:secrets:list

# 3. Test in production
# - Use production Firebase project
# - Test all three flows
# - Monitor logs: firebase functions:log
```

## Quick Reference

**Key URLs:**
- Emulator UI: http://localhost:4001
- Functions emulator: http://127.0.0.1:5002
- Firestore emulator: http://127.0.0.1:8082

**Key Collections:**
- `evenimente` - Events
- `conversationStates` - AI chat state
- `accounts` - WhatsApp accounts (Hetzner backend)

**Key Functions:**
- `chatEventOps` - Event creation/update/archive
- `chatWithAI` - AI chat with interactive event flow
- `whatsappProxyGetAccounts` - List WhatsApp accounts
- `whatsappProxyAddAccount` - Add WhatsApp account
- `whatsappProxyRegenerateQr` - Regenerate QR code
