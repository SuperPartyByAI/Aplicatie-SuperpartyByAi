# ROLLOUT_FINAL_STEPS.md

**Scope:** GitHub → Firebase (rules/indexes/functions + secrets) → legacy hosting (volume+env+redeploy) → Flutter (cap-coadă) → Acceptance → Onboarding 30 conturi  
**Obiectiv:** Pair QR din app → sync conversații în Firestore → chat send/receive din app → CRM (extract event, save event, profil client, ask AI)

---

## 1) GitHub merge

### 1.1 PR merge (audit-whatsapp-30 → main)
1. Deschide PR:
   - https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/compare/main...audit-whatsapp-30
2. Verifică în PR:
   - backend WhatsApp (legacy hosting) + functions proxy + rules/indexes
   - Flutter: Inbox/Chat/Client Profile + CRM panel
3. Merge în `main`.
4. Confirmă că legacy hosting e setat să deployeze din `main` (nu din branch).

### 1.2 Fix: „Could not compare to origin/main”
Dacă în terminal ai mesajul că nu există `origin/main`, fă:
```bash
git remote -v
git fetch origin --prune
git branch -r
git ls-remote --heads origin
```

Dacă remote nu are `main`, găsești branch-ul corect (ex: `master`) și schimbi base-ul în PR (sau redenumești branch-ul default în GitHub settings).

Dacă remote are `main` dar local nu: `git fetch origin main:refs/remotes/origin/main`

### 1.3 legacy hosting branch tracking (verificare)
În legacy hosting → Service → Settings / Deploy:
- Repo conectat: `SuperPartyByAI/Aplicatie-SuperpartyByAi`
- Branch: `main`
- Auto deploy: `ON`

---

## 2) Firebase deploy (secrets + rules/indexes/functions)

Proxy-ul către backend folosește un secret cu URL-ul backend, ex. `WHATSAPP_BACKEND_BASE_URL` (recomandat) sau `WHATSAPP_BACKEND_URL` (legacy).
Pentru AI extraction/ask se menționează cheie `GROQ_API_KEY` (`DEPLOY_MANUAL`).

### 2.1 Select proiect
```bash
firebase projects:list
firebase use <PROJECT_ID>
```
**Notă:** Înlocuiește `<PROJECT_ID>` cu ID-ul real al proiectului Firebase.

### 2.2 Set secrets (minim)
Setează URL-ul backend (valoare: `https://<backend-host>`):
```bash
firebase functions:secrets:set LEGACY_WHATSAPP_URL
# sau/și:
firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL
```
**Notă:** Înlocuiește `<backend-host>` cu domeniul backend real.

AI provider key (dacă folosești Groq):
```bash
firebase functions:secrets:set GROQ_API_KEY
```

### 2.3 Deploy complet (recomandat)
```bash
firebase deploy --only firestore:rules,firestore:indexes,functions
```

### 2.4 Verificări în Firebase Console
- [ ] **Firestore → Indexes:** Status = **Ready**
- [ ] **Functions:** toate = **Deployed**
- [ ] **Firestore → Rules:** active și fără erori de compilare

---

## 3) legacy hosting config (WhatsApp backend)

### 3.1 Persistent volume
legacy hosting → Service (whatsapp-backend) → Volumes → Add Volume:
- `mountPath` = `/app/sessions` (conform `legacy hosting.toml`)
- Redeploy după attach.

### 3.2 Env vars (minim)
legacy hosting → Variables:
- `SESSIONS_PATH=/app/sessions` (trebuie să bată cu mount path)
- `FIREBASE_SERVICE_ACCOUNT_JSON=<json complet>`
- (dacă e folosit) `ADMIN_TOKEN=<random-lung>`

**Opțional (pentru sync best-effort):**
- `WHATSAPP_SYNC_FULL_HISTORY=true`
- `WHATSAPP_BACKFILL_COUNT=100`
- `WHATSAPP_BACKFILL_THREADS=50`

### 3.3 Verificări în logs (după redeploy)
Caută:
- ✅ `"sessions dir ... writable"` / `"write-test"` (startup fail-fast indică să verifici `SESSIONS_PATH` și volume)
- ✅ `"Session restored from disk"` / `"Session restored from Firestore"` (după redeploy)
- ✅ `"messaging-history.set"` (history sync)
- ❌ `"needs_qr"` (dacă apare după scanare = problemă)
- ✅ `/health 200` + `sessions_dir_writable=true`

### 3.4 Constrângere producție
**1 singură instanță legacy hosting** (fără scale-out) până când ownership/lease e implementat complet.

---

## 4) Smoke test commands (rapid, înainte de testele din app)

Endpoints legacy hosting directe includ `health`/`accounts`/`qr`/`dashboard` etc (documentate).

Setează:
```bash
BASE="https://<legacy hosting-domain>"
```
**Notă:** Înlocuiește `<legacy hosting-domain>` cu domeniul legacy hosting real.

### 4.1 Health
```bash
curl -sS "$BASE/health"
```
Expected: `sessions_dir_writable=true` și status 200. Dacă e `false`, /health va răspunde 503.

### 4.2 List accounts
```bash
curl -sS "$BASE/api/whatsapp/accounts"
```

### 4.3 Add account (WA-01)
```bash
curl -sS -X POST "$BASE/api/whatsapp/add-account" \
  -H "Content-Type: application/json" \
  -d '{"name":"WA-01","phone":"+40712345678"}'
```

### 4.4 Get QR
```bash
curl -sS "$BASE/api/whatsapp/qr/<accountId>"
```

### 4.5 Dashboard
```bash
curl -sS "$BASE/api/status/dashboard"
```

### 4.6 Regenerate QR (repair)
```bash
curl -sS -X POST "$BASE/api/whatsapp/regenerate-qr/<accountId>"
```

### 4.7 Backfill (manual)
```bash
curl -sS -X POST "$BASE/api/whatsapp/backfill/<accountId>"
```

### 4.8 Verificări Firestore (după pairing)
Colecții așteptate (exemple): `accounts`, `threads`, `threads/{threadId}/messages`, `outbox` (server-side), `clients`, `evenimente`.

Exemplu: `outbox` doc shape este descris (`accountId`, `threadId`, `to`, `body`, `status`, `timestamps` etc.).

---

## 5) Acceptance tests (6 teste) — „cap-coadă”

### Test 1: Pair Account (WA-01)

**Pași în app:**
1. WhatsApp → Accounts
2. Add Account (WA-01)
3. Afișezi QR
4. Pe telefon (WA-01): WhatsApp → Linked devices → Link → scan QR
5. Confirmi status `connected`

**Log patterns:**
- ✅ **success:** `connected` / `session saved` / (opțional) `messaging-history.set`
- ❌ **error:** `needs_qr` imediat după scan / loop reconnect

**Firestore checks:**
- `accounts/<accountId>` există, `status=connected`
- `threads/*` încep să apară (best-effort)

---

### Test 2: Receive Message (client → WA-01)

**Pași:**
1. De pe telefonul clientului: trimite mesaj către numărul WA-01
2. App → Inbox → select WA-01 → intră pe thread
3. Mesajul apare (realtime)

**Firestore:**
- `threads/<threadId>`
- `threads/<threadId>/messages/<messageId>`

---

### Test 3: Send Message (WA-01 → client)

**Pași:**
1. În Chat: scrii mesaj → Send (trimite prin proxy / backend)
2. Clientul primește mesajul pe WhatsApp
3. În UI: status outbound evoluează (`queued`/`sent`/`delivered`/`read` dacă receipts active)

**Firestore:**
- mesaj outbound persistat în `threads/.../messages/...`
- status actualizat

---

### Test 4: CRM Extract Event (AI)

**Pași:**
1. În Chat: deschizi CRM panel
2. „Extract Event” (callable)
3. Primești un draft: data/ora/adresă/personaje/sumă etc.

**Verificări:**
- nu trebuie să scrie automat direct în `evenimente` (draft first)
- opțional: audit în `threads/<threadId>/extractions/...` (dacă implementat)

---

### Test 5: CRM Save Event (create eveniment nou, fără overwrite)

**Pași:**
1. În draft: confirmi/editezi câmpuri
2. „Save Event” → creează document nou în `evenimente`
3. Repeți o a doua comandă → trebuie să creeze al doilea eveniment

**Firestore:**
- `evenimente/<eventId>` nou (de fiecare dată)
- trigger agregare actualizează `clients/<phoneE164>` (`eventsCount`, `lifetimeSpend` etc.)

---

### Test 6: CRM Ask AI (profil client)

**Pași:**
1. În Client Profile: vezi KPI + listă evenimente
2. Întrebi: „Câți bani a cheltuit clientul +40…?”
3. Primești răspuns bazat pe `clients` + `evenimente`

**Firestore:**
- `clients/<phoneE164>` există și nu se șterge
- `evenimente` listate corect desc (index)

---

## 6) Log patterns (monitorizare)

### Success (✅)
- `"connected"`
- `"Session restored from disk"` / sesiune restaurată după redeploy
- `"messaging-history.set"`
- `"backfill ... done"`
- `"outbox ... sent"` / status transitions

### Error (❌)
- `"needs_qr"` după scan (pairing failed)
- `"Auth directory is not writable"` (volume/env greșit)
- `"missing index"`
- `429` / rate limit / retry storm

---

## 7) Onboarding 30 accounts (procedură)

Începi cu **2 conturi** (WA-01, WA-02) + 1 client real.

Dacă e OK: continui până la 30.

**Procedură:**
1. Pentru fiecare: Add account → QR → scan → connected
2. **Checkpoint după fiecare 5 conturi:**
   - verifici logs (nu ai reconnect loops)
   - verifici Firestore (threads/messages se populează)
3. **După 10/20/30:**
   - redeploy legacy hosting (1–2 ori) → confirmi că NU cere re-pair (sessions persist pe volume)

---

## 8) „Never lose data” checks (critice)

### Firestore:
Confirmi că NU ai TTL/cleanup pe `threads`/`messages`/`clients`/`evenimente` (Console → TTL).

### Rules:
Clientul nu trebuie să poată șterge conversații / clienți / evenimente.

### Backend:
Evită job-uri de cleanup pentru `threads`/`messages`.

### UI:
Nu implementa delete pentru `threads`/`messages`/`client profile`.

---

## 9) Troubleshooting (rapid)

### Problemă: după deploy, toate conturile cer QR
- verifică volume mount `/app/sessions`
- verifică `SESSIONS_PATH=/app/sessions`
- verifică logs pentru `"not writable"`

### Problemă: „missing index”
- rulează: `firebase deploy --only firestore:indexes`
- așteaptă „Ready” în Console → Indexes

### Problemă: proxy nu ajunge la backend
- verifică secret URL (`WHATSAPP_BACKEND_BASE_URL` / `WHATSAPP_BACKEND_URL`)
- verifică că backend host e corect și public

### Problemă: AI extraction/ask eșuează
- verifică `GROQ_API_KEY` setat (`DEPLOY_MANUAL`)
- verifică logs în Functions

---

## Quick reference (smoke test ultra-rapid)

```bash
BASE="https://<legacy hosting-domain>"
curl -sS "$BASE/health"
curl -sS "$BASE/api/whatsapp/accounts"
# după pairing:
# verifică în Firestore: threads/<threadId>/messages/*
```

---

**END OF ROLLOUT GUIDE**
