# Cum Verificăm Stabilitatea Sesiunii Baileys

## Verificare Rapidă (2 minute)

### 1. Verifică backend health:

```bash
curl -s https://whats-upp-production.up.railway.app/health | jq
```

**Rezultat OK:**
- `"status": "healthy"`
- `"ok": true`
- Uptime > 0

### 2. Verifică accounts status:

```bash
export ADMIN_TOKEN=your-token
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts | jq
```

**Rezultat OK:**
- Status: `"connected"` (nu `"qr_ready"` constant)
- NU apare `"needs_qr"` frecvent
- QR code: doar pentru account-uri noi (nu regenerate constant)

### 3. Verifică logurile pentru restores:

**Opțiunea 1: Railway Dashboard (recomandat)**
- Deschide: https://railway.app/project
- Selectează proiectul "Whats Upp"
- Click pe service → Logs
- Caută: `restore.*Firestore` sau `Session restored`

**Opțiunea 2: Railway CLI (dacă e linkat)**
```bash
# Link proiectul mai întâi:
cd whatsapp-backend
railway link

# Apoi verifică logurile:
railway logs | grep -i "restore.*Firestore\|Session restored" | tail -20
```

**Rezultat OK:**
- Apare `"Session restored from Firestore"` doar la redeploy/crash
- NU apare frecvent (dacă apare constant = problemă)

---

## Verificare Stabilitate (30 minute)

### Test 1: Simulează redeploy

**Pas 1:** Monitorează logurile (Railway Dashboard):
- Deschide: https://railway.app/project
- Selectează "Whats Upp" → Service → Logs
- SAU: `railway logs` (dacă e linkat)

**Pas 2:** Redeploy backend (Railway Dashboard):
- Click pe service → Deployments → Redeploy
- SAU: `railway up` (dacă e linkat din whatsapp-backend/)

**Pas 3:** Verifică restore în loguri:
- În Railway Dashboard → Logs
- SAU: `railway logs | grep -i "restore.*Firestore" | tail -10`

**✅ SUCCESS dacă:**
- Apare `"🔄 [account_xxx] Disk session missing, attempting Firestore restore..."`
- Apare `"✅ [account_xxx] Session restored from Firestore (X files)"`
- Accounts rămân `"connected"` (NU trebuie QR nou)

---

## Indicatori de Stabilitate

### ✅ BUN (ca WhatsApp normal):
- Status `"connected"` pentru account-uri active
- Restore count < 5/zi (normal pentru network issues minore)
- NU apare `"needs_qr"` des (doar la logout real)
- Health `"healthy"` constant

### ❌ PROBLEMĂ (necesită investigare):
- Status `"needs_qr"` frecvent → sesiunea se pierde des
- Restore count > 20/zi → sesiunea se corupe des
- Health `"unhealthy"` → backend-ul e instabil

---

## Comandă Simplă pentru Verificare

```bash
# 1. Health
echo "Health:" && curl -s https://whats-upp-production.up.railway.app/health | jq -r '.status'

# 2. Accounts (dacă ai token)
export ADMIN_TOKEN=your-token
echo "Accounts:" && curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts | \
  jq -r '.accounts[] | "\(.name // .id): \(.status)"'

# 3. Recent restores (ultima oră)
# Opțiunea 1: Railway Dashboard → Logs → Search "restore"
# Opțiunea 2: Railway CLI (dacă e linkat)
echo "Recent restores:" && railway logs | \
  grep -c "restore.*Firestore" || echo "None (good - session stable)"
```

