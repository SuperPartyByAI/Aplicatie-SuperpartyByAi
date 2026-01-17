# 🔐 Cum să folosești Railway API Token pentru Setup Automat

## Pasul 1: Obține Token-ul Railway

1. **Deschide Railway Dashboard:**
   - Link: https://railway.app/account/tokens
   - Sau: Railway Dashboard → Settings → Tokens

2. **Creează Token Nou:**
   - Click pe butonul **"New Token"**
   - Numează-l (ex: `cursor-setup` sau `whatsapp-backend-setup`)
   - Click **"Create Token"**

3. **Copiază Token-ul:**
   - ⚠️ **ATENȚIE:** Token-ul apare **O SINGURĂ DATĂ**!
   - Copiază-l într-un loc sigur (nu-l partaja public)
   - Token-ul arată așa: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

## Pasul 2: Rulează Setup Script

### Varianta A: Setează Token în Variabilă de Mediu (Recomandat)

```bash
# Setează token-ul (nu-l partaja în chat!)
export RAILWAY_TOKEN='tokenul_tau_aici'

# Rulează script-ul
cd ~/Aplicatie-SuperpartyByAi
./setup-railway.sh
```

### Varianta B: Folosește Token Direct în Comandă

```bash
# Nu recomandat (apare în history), dar funcționează
RAILWAY_TOKEN='tokenul_tau_aici' ./setup-railway.sh
```

### Varianta C: Manual cu Railway CLI

```bash
# Autentificare
railway login --browserless --token 'tokenul_tau_aici'

# Link la proiect
cd ~/Aplicatie-SuperpartyByAi
railway link --project be379927-9034-4a4d-8e35-4fbdfe258fc0

# Creează volume
railway volume create whatsapp-sessions-volume \
  --mount /data/sessions \
  --size 1GB \
  --service bac72d7a-eeca-4dda-acd9-6b0496a2184f

# Setează variabilă
railway variables set SESSIONS_PATH=/data/sessions
```

---

## ⚠️ SECURITATE

- **NU** partaja token-ul în chat-uri publice sau commit-uri Git
- **NU** pune token-ul în fișiere track-uite de Git
- Token-ul este **VALID PERMANENT** (până îl ștergi manual)
- Dacă ai dubii, **șterge token-ul** și creează unul nou

---

## Verificare După Setup

După ce rulezi script-ul, verifică:

```bash
# Lista volume-uri
railway volume list

# Lista variabile
railway variables

# Verifică health endpoint (după deploy)
curl https://your-url.railway.app/health | jq
```

---

## Probleme Comune

### "Unauthorized" sau "Invalid token"
- Verifică că token-ul este corect copiat (fără spații)
- Verifică că token-ul nu a expirat (rare, dar posibil)
- Creează un token nou și încearcă din nou

### "Volume already exists"
- Este OK! Volume-ul există deja
- Script-ul va continua cu setarea variabilei

### "Service not found"
- Verifică SERVICE_ID în script: `bac72d7a-eeca-4dda-acd9-6b0496a2184f`
- Verifică că ești autentificat cu contul corect

---

**Întrebări?** Verifică `RAILWAY_SETUP_MANUAL_STEPS.md` pentru pași manuali alternativi.
