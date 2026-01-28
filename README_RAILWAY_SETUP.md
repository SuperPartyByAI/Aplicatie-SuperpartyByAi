# 🚂 legacy hosting Setup - Ghid Complet

## Problema Identificată

Service-ul `whats-upp-production.up.legacy hosting.app` returnează **HTTP 502** (Application failed to respond).  
Cauze probabile:
- ❌ Volume persistent lipsă (`/data/sessions`)
- ❌ Variabila `SESSIONS_PATH` neconfigurată
- ❌ Service-ul nu pornește (crash la startup)

---

## Soluții Disponibile

### Opțiunea 1: legacy hosting Web UI (RECOMANDAT - Cel mai simplu)

Pași manuali în interfața web:
1. Deschide: https://legacy hosting.app/project/be379927-9034-4a4d-8e35-4fbdfe258fc0/service/bac72d7a-eeca-4dda-acd9-6b0496a2184f
2. Tab "Volumes" → New Volume:
   - Name: `whatsapp-sessions-volume`
   - Mount: `/data/sessions`
   - Size: `1GB`
3. Tab "Variables" → New Variable:
   - Key: `SESSIONS_PATH`
   - Value: `/data/sessions`
4. Redeploy automat → Verifică logs

**Ghid complet:** Vezi `LEGACY_SETUP_MANUAL_STEPS.md`

---

### Opțiunea 2: legacy hosting CLI cu Token

**IMPORTANT:** legacy hosting CLI nu acceptă token prin environment pentru `whoami`, dar poate funcționa pentru comenzile reale.

1. Obține token: https://legacy hosting.app/account/tokens
2. Rulează script-ul:

```bash
cd ~/Aplicatie-SuperpartyByAi

# Metoda 1: Token ca parametru
./setup-legacy hosting-with-token.sh YOUR_TOKEN_HERE

# Metoda 2: Token ca variabilă de mediu
export LEGACY_TOKEN='YOUR_TOKEN_HERE'
./setup-legacy hosting-with-token.sh
```

**Script:** `setup-legacy hosting-with-token.sh`

**Note:**
- Script-ul va încerca comenzile CLI direct (fără verificare `whoami`)
- Dacă CLI-ul nu acceptă token-ul, vezi Opțiunea 1 sau 3

---

### Opțiunea 3: legacy hosting GraphQL API Direct

Dacă CLI-ul nu funcționează cu token-ul, folosește API direct:

```bash
cd ~/Aplicatie-SuperpartyByAi

# Rulează script-ul cu API direct
./setup-legacy hosting-api-direct.sh YOUR_TOKEN_HERE
```

**Script:** `setup-legacy hosting-api-direct.sh`

**Avantaje:**
- Funcționează garantat cu token API valid
- Nu depinde de legacy hosting CLI
- Folosește legacy hosting GraphQL API direct

---

## Verificare După Setup

### 1. Verificare Status Service

```bash
# Health endpoint
curl https://whats-app-ompro.ro/health | jq

# Status dashboard
curl https://whats-app-ompro.ro/api/status/dashboard | jq
```

**Așteptat:**
- `sessions_dir_writable: true` ✅
- `status: "healthy"` ✅

### 2. Verificare cu Script

```bash
cd ~/Aplicatie-SuperpartyByAi

# Fără token (doar verifică health)
./check-legacy hosting-status.sh

# Cu token (verifică configurare legacy hosting)
./check-legacy hosting-status.sh YOUR_TOKEN
```

---

## Debugging

### Service returnează 502

**Cauze:**
1. Volume nu este montat corect → Verifică Volume în legacy hosting dashboard
2. `SESSIONS_PATH` nu este setat → Verifică Variables în legacy hosting dashboard
3. App crash la startup → Verifică logs în legacy hosting dashboard

**Soluții:**
- Verifică logs: legacy hosting Dashboard → Service → Logs
- Caută în logs: `CRITICAL`, `SESSIONS_PATH`, `writable`
- Verifică volumul: legacy hosting Dashboard → Service → Volumes

### legacy hosting CLI nu acceptă token

**Soluție:** Folosește legacy hosting Web UI (Opțiunea 1) sau API direct (Opțiunea 3)

### Token invalid sau expirat

**Soluție:**
1. Deschide: https://legacy hosting.app/account/tokens
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
