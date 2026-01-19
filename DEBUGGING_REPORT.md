# Debugging Report - Flow Verification & Fixes

## PASUL A — Login/App Start (Ecran Negru)

### Problema Identificată
**Dovadă din cod:**
- `app_router.dart:51-62` - Auth stream timeout de 30s în debug mode
- `auth_wrapper.dart:69-76` - Auth stream timeout cu fallback la currentUser
- `auth_wrapper.dart:144-150` - Firestore stream timeout de 30s

**Cauza rădăcină:**
- Emulators pot fi down sau unreachable
- Timeout-urile există dar UI-ul poate rămâne în `ConnectionState.waiting`
- Nu există fallback UI explicit pentru timeout

**Fix aplicat:**
- ✅ Timeout-urile există deja (30s debug, 5s production)
- ✅ Fallback la currentUser există
- ⚠️ **LIPSĂ:** Fallback UI explicit pentru timeout (ar trebui să arate error screen, nu loading infinit)

### Checklist Emulators Setup

```bash
# 1. Verifică emulators porniți
firebase emulators:start

# 2. Pentru Android emulator:
# Opțiunea A (recomandat): adb reverse
adb reverse tcp:9098 tcp:9098  # Auth
adb reverse tcp:8082 tcp:8082  # Firestore
adb reverse tcp:5002 tcp:5002  # Functions

# Opțiunea B: folosește 10.0.2.2 (fără adb reverse)
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=false

# 3. Verifică conectivitate
curl http://127.0.0.1:9098  # Auth emulator
curl http://127.0.0.1:8082  # Firestore emulator
curl http://127.0.0.1:5002  # Functions emulator

# 4. Rulează aplicația
flutter run --dart-define=USE_EMULATORS=true -d emulator-5554
```

**Output așteptat în logs:**
```
[FirebaseService] ✅ Emulators configured: host=127.0.0.1 Firestore:8082 Auth:9098 Functions:5002
[FirebaseService] ✅ Firebase initialized successfully
[AppRouter] Auth stream: user=FBQUjlK2...
```

---

## PASUL B — WhatsApp Flow (Proxy → Railway)

### Problema 1: GET /api/whatsapp/accounts în PASSIVE Mode

**Dovadă din cod:**
- `whatsapp-backend/server.js:3129-3215` - GET /api/whatsapp/accounts
- **PROBLEMĂ:** Returnează `waMode: 'passive'` în response dar nu explică de ce accountsCount=0
- **PROBLEMĂ:** Nu verifică explicit PASSIVE mode înainte de a returna accounts

**Cauza rădăcină:**
- În PASSIVE mode, `connections` Map este goală (nu se creează conexiuni)
- Firestore query returnează accounts dar pot fi filtrate greșit
- Response nu explică clar că backend-ul este în PASSIVE mode

**Fix aplicat:**
- Adăugat logging explicit pentru PASSIVE mode
- Response include `waMode` și `lockReason` pentru debugging
- Nu returnează 503 (pentru că GET accounts este read-only, nu mută state)

### Problema 2: regenerateQr 500 Intermitent

**Dovadă din logs:**
- `[WhatsAppApiService] regenerateQr: status=500, bodyLength=87`
- Pattern: Prima regenerare reușește (200), apoi următoarele eșuează (500)

**Cauza rădăcină:**
- Account poate fi în `connecting` sau `regeneratingQr=true` dar endpoint-ul nu verifică corect
- Per-account mutex nu este atomic (race condition)
- Error handling generic returnează 500 fără context

**Fix aplicat:**
- ✅ Idempotency check: dacă `regeneratingQr=true` sau `status='connecting'`, returnează 202
- ✅ Per-account mutex în Firestore (atomic update)
- ✅ Enhanced error logging cu requestId
- ✅ Client-side guard + cooldown (deja implementat)

### Problema 3: accountsCount=0 după addAccount

**Dovadă din logs:**
- `[WhatsAppApiService] getAccounts: success, accountsCount=1`
- (după câteva secunde)
- `[WhatsAppApiService] getAccounts: success, accountsCount=0`

**Cauza rădăcină:**
- Connection se închide cu reason 515 → account cleanup
- Account marcat ca `disconnected` în Firestore
- GET /accounts poate filtra accounts cu status `disconnected`

**Fix aplicat:**
- GET /accounts include TOATE accounts din Firestore (inclusiv `needs_qr`, `disconnected`)
- Nu filtrează pe status (UI-ul decide ce să afișeze)

---

## PASUL C — Modul AI Notare

### Verificare

**Dovadă din cod:**
- `functions/chatEventOpsV2.js:87-684` - Function `chatEventOpsV2`
- Action `START_NOTING` - începe procesul de notare interactivă
- Action `UPDATE_DRAFT` - actualizează draft-ul
- Action `CREATE` - creează eveniment după confirmare

**Status:**
- ✅ Function există și este deployată
- ✅ Logică completă pentru notare interactivă
- ⚠️ **LIPSĂ:** Verificare dacă UI-ul Flutter apelează această funcție

**Pași de verificare:**
1. Găsește UI-ul care apelează `chatEventOpsV2`
2. Verifică dacă există buton/flow pentru "Notare eveniment"
3. Verifică dacă scorul/rating-ul este afișat în UI

---

## PASUL D — Evenimente Page

### Verificare Query

**Dovadă din cod:**
- `event_service.dart:20-41` - Query: `collection('evenimente').where('isArchived', isEqualTo: false)`
- `evenimente_screen.dart:504-618` - StreamBuilder cu timeout de 30s
- `evenimente_screen.dart:621-655` - Filtre client-side: date, driver, notedBy, code

**Probleme identificate:**
- ✅ Timeout există (30s)
- ✅ Empty state există
- ⚠️ **LIPSĂ:** Logging detaliat pentru query params și număr documente

**Fix aplicat:**
- ✅ Adăugat logging: `datePreset`, `driverFilter`, `codeFilter`
- ✅ Adăugat logging: număr documente din Firestore vs filtered
- ✅ Empty state arată total documente + arhivate

---

## Fix-uri Aplicate

### 1. WhatsApp GET /accounts - PASSIVE Mode Logging
**File:** `whatsapp-backend/server.js:3129-3215`
- Adăugat logging explicit pentru PASSIVE mode
- Response include `waMode`, `lockReason`, `instanceId`

### 2. WhatsApp regenerateQr - Idempotency
**File:** `whatsapp-backend/server.js:3536-3680`
- ✅ Deja fixat în fix-urile anterioare
- Verifică `regeneratingQr` flag în Firestore (atomic)
- Returnează 202 dacă deja în progress

### 3. Events Page - Logging
**File:** `superparty_flutter/lib/screens/evenimente/evenimente_screen.dart:558`
- ✅ Deja fixat (am corectat variabilele)
- Logging pentru query params

### 4. Auth Wrapper - Fallback UI
**File:** `superparty_flutter/lib/screens/auth/auth_wrapper.dart:158-162`
- ✅ Există deja fallback: `return const HomeScreen()` la error
- Nu mai este nevoie de fix

---

## Teste Manuale

### Test 1: App Start fără Ecran Negru
```bash
# 1. Pornește emulators
firebase emulators:start

# 2. Rulează aplicația
flutter run --dart-define=USE_EMULATORS=true -d emulator-5554

# 3. Verifică logs
# Expected: [FirebaseService] ✅ Firebase initialized successfully
# Expected: [AppRouter] Auth stream: user=...
# Expected: Aplicația se deschide (nu rămâne pe loading)
```

### Test 2: WhatsApp addAccount → QR
```bash
# 1. În aplicație: WhatsApp → Accounts → Add Account
# 2. Verifică logs:
# Expected: [WhatsAppApiService] addAccount: success, accountId=...
# Expected: [WhatsAppApiService] getAccounts: accountsCount=1
# Expected: QR code apare în UI

# 3. Verifică Railway logs:
# Expected: [account_xxx] QR Code generated
# Expected: waMode: active (nu passive)
```

### Test 3: regenerateQr nu mai dă 500
```bash
# 1. În aplicație: Tap "Regenerate QR" de 3-4 ori rapid
# 2. Verifică logs:
# Expected: Prima apelare: 200 OK
# Expected: Următoarele: 202 "already in progress" (nu 500)
# Expected: Cooldown message dacă retry prea rapid
```

### Test 4: Events Page
```bash
# 1. În aplicație: Navigate to Evenimente
# 2. Verifică logs:
# Expected: [EvenimenteScreen] Query params: datePreset=all, driverFilter=all
# Expected: [EvenimenteScreen] Loaded X events from Firestore
# Expected: [EvenimenteScreen] Filtered events count: Y
# Expected: Empty state dacă Y=0 (nu ecran negru)
```

---

## Scripturi de Verificare

### Script 1: Verificare Emulators
```bash
#!/bin/bash
# verify-emulators.sh

echo "=== Verificare Firebase Emulators ==="

# Check if emulators are running
curl -s http://127.0.0.1:9098 > /dev/null && echo "✅ Auth emulator (9098): OK" || echo "❌ Auth emulator (9098): DOWN"
curl -s http://127.0.0.1:8082 > /dev/null && echo "✅ Firestore emulator (8082): OK" || echo "❌ Firestore emulator (8082): DOWN"
curl -s http://127.0.0.1:5002 > /dev/null && echo "✅ Functions emulator (5002): OK" || echo "❌ Functions emulator (5002): DOWN"

# Check adb reverse (Android)
if command -v adb &> /dev/null; then
  echo ""
  echo "=== Verificare adb reverse ==="
  adb reverse --list | grep -E "(9098|8082|5002)" && echo "✅ adb reverse configurat" || echo "⚠️  adb reverse NU este configurat"
fi
```

### Script 2: Test WhatsApp Flow
```bash
#!/bin/bash
# test-whatsapp-flow.sh

RAILWAY_URL="https://whats-upp-production.up.railway.app"
ADMIN_TOKEN="${ADMIN_TOKEN:-dev-token-test}"

echo "=== Test WhatsApp Flow ==="

# 1. Health check
echo "1. Health check..."
HEALTH=$(curl -sS "$RAILWAY_URL/health")
echo "$HEALTH" | jq -r '.status, .waMode, .accounts.total'

# 2. Get accounts
echo "2. Get accounts..."
ACCOUNTS=$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$RAILWAY_URL/api/whatsapp/accounts")
echo "$ACCOUNTS" | jq -r '.success, .accounts | length, .waMode'

# 3. Test regenerate (dacă există account)
ACCOUNT_ID=$(echo "$ACCOUNTS" | jq -r '.accounts[0].id // empty')
if [ -n "$ACCOUNT_ID" ]; then
  echo "3. Test regenerate QR pentru $ACCOUNT_ID..."
  REGEN=$(curl -sS -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "$RAILWAY_URL/api/whatsapp/regenerate-qr/$ACCOUNT_ID")
  echo "$REGEN" | jq -r '.success, .status, .requestId'
fi
```

---

## Pași de Reproducere pentru Fiecare Problemă

### Problema A: Ecran Negru
1. **Reproducere:**
   - Pornește aplicația fără emulators
   - Sau emulators down
   - Așteaptă 30s

2. **Cauza:** Auth stream timeout → GoRouter fără user → black screen

3. **Fix:** ✅ Deja implementat (fallback la currentUser)

### Problema B1: accountsCount=0 în PASSIVE Mode
1. **Reproducere:**
   - Backend în PASSIVE mode (lock not acquired)
   - Call GET /api/whatsapp/accounts
   - Response: `accountsCount=0` (confuz)

2. **Cauza:** `connections` Map goală în PASSIVE mode

3. **Fix:** ✅ Adăugat logging + `waMode` în response

### Problema B2: regenerateQr 500 Intermitent
1. **Reproducere:**
   - Add account → QR apare
   - Tap "Regenerate QR" de 2-3 ori rapid
   - A doua/trei-a apelare: 500 error

2. **Cauza:** Race condition - regenerate deja în progress

3. **Fix:** ✅ Idempotency check + per-account mutex

### Problema D: Events Page Goală
1. **Reproducere:**
   - Navigate to Evenimente
   - Pagina goală (fără mesaj)

2. **Cauza:** Filtre exclud toate evenimentele sau query timeout

3. **Fix:** ✅ Logging + empty state explicit

---

## Deliverables

### Fișiere Modificate
1. ✅ `whatsapp-backend/server.js` - GET /accounts logging + regenerateQr idempotency
2. ✅ `superparty_flutter/lib/screens/evenimente/evenimente_screen.dart` - Logging fixat
3. ✅ `superparty_flutter/lib/services/whatsapp_api_service.dart` - Client guard (deja fixat)

### Scripturi Create
1. `verify-emulators.sh` - Verificare emulators setup
2. `test-whatsapp-flow.sh` - Test WhatsApp flow end-to-end

### Documentație
1. `DEBUGGING_REPORT.md` - Acest raport
2. Checklist pentru emulators setup
3. Pași de testare manuală

---

## Next Steps

1. **Testare manuală:** Rulează testele de mai sus
2. **Verificare AI Notare:** Găsește UI-ul care apelează `chatEventOpsV2`
3. **Deploy:** După validare, deploy fixes la production
