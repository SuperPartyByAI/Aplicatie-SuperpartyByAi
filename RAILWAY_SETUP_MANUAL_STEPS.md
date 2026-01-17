# Railway Setup - Pași Manuali (Pas cu Pas)

**Proiect:** WhatsApp 30 Accounts Backend  
**Link Railway:** https://railway.app/project/be379927-9034-4a4d-8e35-4fbdfe258fc0/service/bac72d7a-eeca-4dda-acd9-6b0496a2184f

---

## Pasul 1: Autentifică-te în Railway

1. Deschide: https://railway.app
2. Login cu contul tău
3. Navighează la proiect: **Aplicatie-SuperpartyByAi** (sau link-ul de mai sus)

---

## Pasul 2: Creează Volume (Persistent Storage)

1. În Railway dashboard, deschide service-ul **whatsapp-backend**
2. Click pe tab-ul **Volumes** (în stânga)
3. Click pe butonul **New Volume**
4. Completează:
   - **Name:** `whatsapp-sessions-volume`
   - **Size:** `1GB` (suficient pentru 30 sesiuni)
   - **Mount Path:** `/data/sessions` (**EXACT** - trebuie să fie exact acest path)
5. Click **Create**
6. Așteaptă 1-2 minute pentru provisioning (status: "Active")

**Verificare:** Volume-ul apare în listă cu status "Active"

---

## Pasul 3: Setează Variabila de Mediu

1. În același service (**whatsapp-backend**)
2. Click pe tab-ul **Variables** (în stânga)
3. Click pe butonul **+ New Variable**
4. Completează:
   - **Key:** `SESSIONS_PATH`
   - **Value:** `/data/sessions` (trebuie să fie exact același path ca mount path-ul de la Step 2)
5. Click **Save**

**Railway va redeploy automat după ce adaugi variabila.**

---

## Pasul 4: Verifică Deployment

1. Click pe tab-ul **Deployments**
2. Așteaptă ca ultimul deployment să se finalizeze (checkmark verde)
3. Click pe ultimul deployment → **View Logs**
4. Caută în logs:
   ```
   📁 SESSIONS_PATH: /data/sessions
   📁 Auth directory: /data/sessions
   📁 Sessions dir exists: true
   📁 Sessions dir writable: true
   ```

**✅ Dacă vezi "writable: true"** → Volume-ul este montat corect!  
**❌ Dacă vezi "CRITICAL: Auth directory is not writable!"** → Verifică Step 2 și Step 3

---

## Pasul 5: Verifică Health Endpoint

1. În Railway dashboard, găsește **Public URL** pentru service (sau creează un domain)
2. Testează health endpoint:
   ```bash
   curl https://your-railway-url.railway.app/health
   ```

3. **Răspuns așteptat:**
   ```json
   {
     "ok": true,
     "accounts_total": 0,
     "connected": 0,
     "needs_qr": 0,
     "sessions_dir_writable": true,
     "status": "healthy"
   }
   ```

**✅ Dacă `sessions_dir_writable: true`** → Totul este configurat corect!  
**❌ Dacă `sessions_dir_writable: false`** → Verifică Step 2-3

---

## Pasul 6: Verifică Status Dashboard

1. Testează dashboard endpoint:
   ```bash
   curl https://your-railway-url.railway.app/api/status/dashboard
   ```

2. **Răspuns așteptat:**
   ```json
   {
     "timestamp": "2025-01-27T...",
     "service": { "status": "healthy", ... },
     "storage": {
       "path": "/data/sessions",
       "writable": true,
       "totalAccounts": 0
     },
     "accounts": [],
     "summary": { "total": 0, ... }
   }
   ```

**✅ Dacă `storage.writable: true`** → Volume-ul funcționează corect!

---

## Checklist Final

- [ ] Volume creat: `whatsapp-sessions-volume` la `/data/sessions`
- [ ] Variabilă de mediu setată: `SESSIONS_PATH=/data/sessions`
- [ ] Deployment complet (verde checkmark)
- [ ] Logs arată: "Sessions dir writable: true"
- [ ] `/health` endpoint returnează: `sessions_dir_writable: true`
- [ ] `/api/status/dashboard` returnează: `storage.writable: true`

---

**După ce completezi pașii de mai sus, service-ul va fi gata pentru 30 de conturi WhatsApp!**

---

## Ce Urmează (După Setup)

1. **Adaugă conturi:** `POST /api/whatsapp/add-account` (repetă de 30 ori)
2. **Scanează QR:** Pentru fiecare cont, folosește `/api/whatsapp/qr/:accountId` sau dashboard
3. **Verifică status:** `/api/status/dashboard` ar trebui să arate 30 conturi "connected"
4. **Test persistency:** Restart service → toate conturile se reconectează automat

---

**Întrebări?** Verifică documentația: `docs/WHATSAPP_30_ACCOUNTS_PRODUCTION_VERIFICATION.md`
