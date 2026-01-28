# 📞 Runbook: Test Manual Centrala Telefonică

## 📋 Prerequisite

### Verifică Config VITE_VOICE_BACKEND_URL

**Locație:** `kyc-app/kyc-app/.env.example`

**Valoare:**

```bash
VITE_VOICE_BACKEND_URL=https://whats-app-ompro.ro
```

### Setare pentru Development

**Creează fișier `.env` în `kyc-app/kyc-app/`:**

```bash
cd kyc-app/kyc-app
cp .env.example .env
```

**Editează `.env`:**

```bash
# Backend URL for Voice/Centrala
VITE_VOICE_BACKEND_URL=https://whats-app-ompro.ro
```

**Verificare:**

```bash
cat kyc-app/kyc-app/.env
```

---

## 1️⃣ Pornește Aplicația

```bash
cd kyc-app/kyc-app
npm run dev
```

**Output așteptat:**

```
VITE v7.3.0  ready in 163 ms

➜  Local:   http://localhost:5173/
➜  Network: http://100.64.99.30:5173/
```

---

## 2️⃣ Deschide Centrala în Browser

### A) Navighează la Centrala

1. **Deschide browser:** http://localhost:5173
2. **Login ca admin:** `ursache.andrei1995@gmail.com`
3. **Click pe Dock → Calls (📞)** sau navighează direct la: http://localhost:5173/centrala-telefonica

### B) Deschide Network Tab

1. **Deschide DevTools:** F12 (sau Cmd+Option+I pe Mac)
2. **Selectează tab "Network"**
3. **Filtrează:** XHR sau Fetch
4. **Refresh pagina:** Ctrl+R (sau Cmd+R pe Mac)

---

## 3️⃣ Verificări Obligatorii (Network Tab)

### ✅ Test 1: GET /api/voice/token

**Request:**

```
GET https://whats-app-ompro.ro/api/voice/token
```

**Headers așteptate:**

```
Authorization: Bearer [Firebase ID Token]
```

**Response așteptat (200 OK):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "identity": "user_xxxxx"
}
```

**❌ FAIL dacă:**

- Status: 404 Not Found
- Response: HTML (nu JSON)
- Error: "Unexpected token < in JSON"

---

### ✅ Test 2: GET /api/voice/calls/stats

**Request:**

```
GET https://whats-app-ompro.ro/api/voice/calls/stats
```

**Response așteptat (200 OK):**

```json
{
  "totalCalls": 42,
  "answeredCalls": 38,
  "missedCalls": 4,
  "averageDuration": 180
}
```

**❌ FAIL dacă:**

- Status: 404 Not Found
- Response: HTML (nu JSON)
- Error în console: "SyntaxError: Unexpected token < in JSON"

---

### ✅ Test 3: GET /api/voice/calls/recent?limit=20

**Request:**

```
GET https://whats-app-ompro.ro/api/voice/calls/recent?limit=20
```

**Response așteptat (200 OK):**

```json
[
  {
    "callId": "CA1234567890abcdef",
    "from": "+40737571397",
    "to": "+40722123456",
    "status": "completed",
    "duration": 120,
    "timestamp": "2026-01-01T12:00:00Z"
  },
  ...
]
```

**❌ FAIL dacă:**

- Status: 404 Not Found
- Response: HTML (nu JSON)
- Array gol: `[]` (OK dacă nu sunt apeluri)

---

### ✅ Test 4: Twilio Device Init

**Verifică Console (tab "Console" în DevTools):**

**✅ PASS dacă vezi:**

```
Twilio Device initialized
Device ready
```

**❌ FAIL dacă vezi:**

```
Error initializing Twilio Device: Invalid token
TwilioError: 31205 - Connection error
```

---

## 4️⃣ Troubleshooting

### Eroare: 404 Not Found pe /api/voice/\*

**Cauze posibile:**

1. **Backend URL greșit**
   - Verifică: `echo $VITE_VOICE_BACKEND_URL` sau `.env`
   - Corect: `https://whats-app-ompro.ro`
   - Greșit: `https://whats-app-ompro.ro/` (trailing slash)

2. **Backend nu rulează**
   - Verifică legacy hosting dashboard: https://legacy hosting.app/
   - Service: `web-production-f0714`
   - Status: Running?

3. **Endpoint path greșit**
   - Verifică în cod: `CentralaTelefonicaScreen.jsx`
   - Path corect: `/api/voice/token` (nu `/voice/token`)

**Fix:**

```javascript
// CentralaTelefonicaScreen.jsx
const BACKEND_URL =
  import.meta.env.VITE_VOICE_BACKEND_URL || 'https://whats-app-ompro.ro';
// Verifică că nu are trailing slash
```

---

### Eroare: "Unexpected token < in JSON"

**Cauză:** Backend răspunde HTML în loc de JSON (probabil 404 page)

**Debug:**

1. **Click pe request în Network tab**
2. **Tab "Response"** - vezi HTML?
3. **Verifică URL-ul exact** din request

**Fix:**

- Corectează BASE_URL în `.env`
- Verifică că backend-ul are endpoint-ul respectiv
- Verifică proxy/CORS settings

---

### Eroare: Twilio Device "Invalid token"

**Cauză:** Token-ul de la `/api/voice/token` este invalid sau expirat

**Debug:**

1. **Verifică response de la `/api/voice/token`** în Network tab
2. **Token-ul e valid JWT?** (3 părți separate prin `.`)
3. **Backend-ul generează token-ul corect?**

**Fix:**

- Verifică Twilio credentials în backend
- Verifică că token-ul nu e expirat (TTL)

---

### Eroare: CORS

**Cauză:** Backend nu permite requests de la `localhost:5173`

**Verifică în Console:**

```
Access to fetch at 'https://...' from origin 'http://localhost:5173' has been blocked by CORS policy
```

**Fix:** Backend trebuie să permită CORS pentru development:

```javascript
// Backend (Express)
app.use(
  cors({
    origin: ['http://localhost:5173', 'https://your-production-domain.com'],
  })
);
```

---

## 5️⃣ UI Verification

### A) Stats Card

**Verifică în UI:**

- Total Calls: [număr]
- Answered: [număr]
- Missed: [număr]
- Avg Duration: [număr]s

**❌ FAIL dacă:**

- Stats card arată "Loading..." permanent
- Stats card arată "Error loading stats"
- Stats sunt toate 0 (OK dacă nu sunt apeluri)

### B) Recent Calls List

**Verifică în UI:**

- Listă cu apeluri recente
- Fiecare apel arată: număr, durată, status, timestamp

**❌ FAIL dacă:**

- Listă goală cu eroare
- "No recent calls" (OK dacă nu sunt apeluri)

### C) Twilio Device Status

**Verifică în UI:**

- Status indicator: "Ready" sau "Connected"
- Buton "Make Call" enabled

**❌ FAIL dacă:**

- Status: "Error" sau "Disconnected"
- Buton "Make Call" disabled permanent

---

## ✅ Criteriu de Success

**Test este PASS dacă:**

1. ✅ `/api/voice/token` → 200 + JSON valid
2. ✅ `/api/voice/calls/stats` → 200 + JSON valid
3. ✅ `/api/voice/calls/recent` → 200 + JSON valid (sau array gol)
4. ✅ Twilio Device init fără erori în console
5. ✅ Stats card arată date (sau 0 dacă nu sunt apeluri)
6. ✅ Recent calls list arată apeluri (sau "No recent calls")
7. ✅ Zero erori "404" sau "Unexpected token <" în console

---

## 📝 Notes

- **Config modificat în PR #9:**
  - `VITE_VOICE_BACKEND_URL` în `.env.example`
  - Fallback la hardcoded URL dacă env var nu e setat
- **Fișier:** `src/screens/CentralaTelefonicaScreen.jsx` (commit `81497da8`)

- **Backend:** legacy hosting service `web-production-f0714`

---

## 🚨 Dacă Toate Testele FAIL

**Posibile cauze:**

1. Backend nu rulează pe legacy hosting
2. Backend URL greșit în `.env`
3. Endpoints nu există în backend
4. CORS blocat

**Next steps:**

1. Verifică legacy hosting dashboard
2. Verifică logs backend
3. Contactează backend team
4. Consideră fallback UI (error handling graceful)

---

**Dacă toate verificările sunt PASS → Centrala funcționează corect!** ✅
