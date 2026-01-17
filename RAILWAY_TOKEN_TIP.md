# ⚠️ Problemă cu Railway Token

## Diagnostic

Token-ul furnizat (`4c61cffc-8cc5-4ce3-8853-8d9c42dd4000`) returnează **"Not Authorized"** pentru query-uri care necesită permisiuni de nivel Personal/Team.

**Cauză probabilă:** Token-ul este un **Project Token** (limitat la un singur proiect), nu un **Personal/Team Token** (permisiuni complete).

## Tipuri de Token-uri Railway

### 1. Project Token (Limitare)
- **Creat:** Railway Dashboard → Project → Settings → Tokens
- **Scope:** Doar proiectul respectiv
- **Permisiuni:** 
  - ✅ Poate citi date despre proiect
  - ❌ NU poate crea volume
  - ❌ NU poate seta variabile de mediu
  - ❌ NU poate face mutații

### 2. Personal/Team Token (Recomandat)
- **Creat:** Railway Dashboard → Account Settings → Tokens (sau Team Settings → Tokens)
- **Scope:** Toate proiectele din cont/team
- **Permisiuni:**
  - ✅ Poate crea volume
  - ✅ Poate seta variabile de mediu
  - ✅ Poate face mutații (deployments, config, etc.)

## Soluții

### Opțiunea 1: Creează Personal/Team Token (Recomandat)

1. **Deschide:** https://railway.app/account/tokens
2. **Sau:** Railway Dashboard → Settings → Tokens
3. **Selectează:** "Personal" sau "Team" (nu Project!)
4. **Click:** "New Token"
5. **Numează-l:** ex. `cursor-whatsapp-setup`
6. **Copiază token-ul** (apare o singură dată!)
7. **Rulează script-ul** cu noul token:
   ```bash
   ./setup-railway-api-direct.sh NEW_PERSONAL_TOKEN
   ```

### Opțiunea 2: Configurează Manual (Cel mai simplu)

Dacă nu vrei să creezi un token nou, configurează manual în Railway Web UI:

1. **Deschide:** https://railway.app/project/be379927-9034-4a4d-8e35-4fbdfe258fc0/service/bac72d7a-eeca-4dda-acd9-6b0496a2184f

2. **Volume:**
   - Tab "Volumes" → New Volume
   - Name: `whatsapp-sessions-volume`
   - Mount Path: `/data/sessions`
   - Size: `1GB`

3. **Variables:**
   - Tab "Variables" → New Variable
   - Key: `SESSIONS_PATH`
   - Value: `/data/sessions`

4. **Redeploy automat** → Verifică logs

**Ghid complet:** Vezi `RAILWAY_SETUP_MANUAL_STEPS.md`

---

## Verificare Tip Token

**Project Token:**
- Încearcă query `{ me { id email } }` → "Not Authorized"
- Poate accesa doar proiectul asociat

**Personal/Team Token:**
- Query `{ me { id email } }` → Returnează email-ul tău
- Poate accesa toate proiectele

---

**Recomandare:** Folosește **Opțiunea 2 (Manual Setup)** dacă nu ești sigur de tipul token-ului. Este mai simplu și mai rapid!
