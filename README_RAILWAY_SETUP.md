# 🚂 Railway Setup - Ghid Complet

## Problema Identificată

Service-ul `whats-upp-production.up.railway.app` returnează **HTTP 502** (Application failed to respond).  
Cauze probabile:
- ❌ Volume persistent lipsă (`/data/sessions`)
- ❌ Variabila `SESSIONS_PATH` neconfigurată
- ❌ Service-ul nu pornește (crash la startup)

---

## Soluții Disponibile

### Opțiunea 1: Railway Web UI (RECOMANDAT - Cel mai simplu)

Pași manuali în interfața web:
1. Deschide: https://railway.app/project/be379927-9034-4a4d-8e35-4fbdfe258fc0/service/bac72d7a-eeca-4dda-acd9-6b0496a2184f
2. Tab "Volumes" → New Volume:
   - Name: `whatsapp-sessions-volume`
   - Mount: `/data/sessions`
   - Size: `1GB`
3. Tab "Variables" → New Variable:
   - Key: `SESSIONS_PATH`
   - Value: `/data/sessions`
4. Redeploy automat → Verifică logs

**Ghid complet:** Vezi `RAILWAY_SETUP_MANUAL_STEPS.md`

---

### Opțiunea 2: Railway CLI cu Token

**IMPORTANT:** Railway CLI nu acceptă token prin environment pentru `whoami`, dar poate funcționa pentru comenzile reale.

1. Obține token: https://railway.app/account/tokens
2. Rulează script-ul:

```bash
cd ~/Aplicatie-SuperpartyByAi

# Metoda 1: Token ca parametru
./setup-railway-with-token.sh YOUR_TOKEN_HERE

# Metoda 2: Token ca variabilă de mediu
export RAILWAY_TOKEN='YOUR_TOKEN_HERE'
./setup-railway-with-token.sh
```

**Script:** `setup-railway-with-token.sh`

**Note:**
- Script-ul va încerca comenzile CLI direct (fără verificare `whoami`)
- Dacă CLI-ul nu acceptă token-ul, vezi Opțiunea 1 sau 3

---

### Opțiunea 3: Railway GraphQL API Direct

Dacă CLI-ul nu funcționează cu token-ul, folosește API direct:

```bash
cd ~/Aplicatie-SuperpartyByAi

# Rulează script-ul cu API direct
./setup-railway-api-direct.sh YOUR_TOKEN_HERE
```

**Script:** `setup-railway-api-direct.sh`

**Avantaje:**
- Funcționează garantat cu token API valid
- Nu depinde de Railway CLI
- Folosește Railway GraphQL API direct

---

## Verificare După Setup

### 1. Verificare Status Service

```bash
# Health endpoint
curl https://whats-upp-production.up.railway.app/health | jq

# Status dashboard
curl https://whats-upp-production.up.railway.app/api/status/dashboard | jq
```

**Așteptat:**
- `sessions_dir_writable: true` ✅
- `status: "healthy"` ✅

### 2. Verificare cu Script

```bash
cd ~/Aplicatie-SuperpartyByAi

# Fără token (doar verifică health)
./check-railway-status.sh

# Cu token (verifică configurare Railway)
./check-railway-status.sh YOUR_TOKEN
```

---

## Debugging

### Service returnează 502

**Cauze:**
1. Volume nu este montat corect → Verifică Volume în Railway dashboard
2. `SESSIONS_PATH` nu este setat → Verifică Variables în Railway dashboard
3. App crash la startup → Verifică logs în Railway dashboard

**Soluții:**
- Verifică logs: Railway Dashboard → Service → Logs
- Caută în logs: `CRITICAL`, `SESSIONS_PATH`, `writable`
- Verifică volumul: Railway Dashboard → Service → Volumes

### Railway CLI nu acceptă token

**Soluție:** Folosește Railway Web UI (Opțiunea 1) sau API direct (Opțiunea 3)

### Token invalid sau expirat

**Soluție:**
1. Deschide: https://railway.app/account/tokens
2. Creează token nou
3. Reîncearcă setup-ul

---

## Checklist Final

- [ ] Volume creat: `whatsapp-sessions-volume` la `/data/sessions`
- [ ] Variabilă setată: `SESSIONS_PATH=/data/sessions`
- [ ] Service redeployed (automat după setare variabilă)
- [ ] Health endpoint returnează: `sessions_dir_writable: true`
- [ ] Status dashboard funcționează
- [ ] Logs arată: "Sessions dir writable: true"

---

**Întrebări?** Verifică `docs/WHATSAPP_30_ACCOUNTS_PRODUCTION_VERIFICATION.md`
