# Teste pentru Stabilitatea Sesiunii Baileys

## Setup Pre-test

1. **Verifică Railway Volume (recomandat):**
   ```bash
   # Railway Dashboard -> Volumes
   # Verifică că există volume cu mount path: /data/sessions
   # Verifică că SESSIONS_PATH=/data/sessions este setat
   ```

2. **Verifică Firestore backup e activ:**
   ```bash
   # Verifică în loguri la startup:
   # "💾 Session backed up to Firestore"
   ```

3. **Verifică backend e ACTIVE mode:**
   ```bash
   curl -i https://whats-upp-production.up.railway.app/ready | jq
   # Trebuie să returneze: { "ready": true, "mode": "active" }
   ```

---

## Test 1: Auto-restore din Firestore (Redeploy Simulation)

### Scenariu: Sesiunea se pierde la redeploy, dar se restaurează automat

**Pas 1:** Verifică sesiunea există pe disk:
```bash
# Local sau via Railway CLI
railway run --service whatsapp-backend -- sh -c "ls -la /data/sessions/account_*"
```

**Pas 2:** Simulează pierderea sesiunii (șterge manual pentru test):
```bash
# NU face asta în production! Doar pentru test.
railway run --service whatsapp-backend -- sh -c "rm -rf /data/sessions/account_*"
```

**Pas 3:** Redeploy backend sau restart:
```bash
railway restart
# SAU
railway up
```

**Pas 4:** Verifică logurile pentru restore:
```bash
railway logs --service whatsapp-backend | grep -i "restore\|Firestore"
# Trebuie să vezi:
# "🔄 [account_xxx] Disk session missing, attempting Firestore restore..."
# "✅ [account_xxx] Session restored from Firestore (X files)"
```

**Pas 5:** Verifică account e conectat (nu necesita QR nou):
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts | jq
# Status trebuie să fie "connected" (NU "qr_ready")
```

**✅ Test PASSED dacă:**
- Restore-ul apare în loguri
- Account-ul e "connected" fără să fie nevoie de QR nou
- Mesajele funcționează normal

---

## Test 2: Retry Logic pentru Logout Temporar

### Scenariu: Logout temporar (network issue) - nu șterge sesiunea imediat

**Pas 1:** Monitorează logurile pentru logout:
```bash
railway logs --service whatsapp-backend --follow | grep -i "logout\|loggedOut\|401"
```

**Pas 2:** Simulează logout temporar:
- Opțional: Blochează temporar conexiunea (firewall rule)
- SAU: Așteaptă un logout natural (WhatsApp server restart)

**Pas 3:** Verifică retry logic:
```bash
railway logs --service whatsapp-backend | grep -i "retry.*logout\|retry.*401"
# Trebuie să vezi:
# "⚠️  [account_xxx] Terminal logout (401), retry 1/2 with restore..."
# "🔄 [account_xxx] Retrying connection in 5000ms with session restore..."
```

**Pas 4:** Verifică sesiunea NU e ștearsă după primul logout:
```bash
railway run --service whatsapp-backend -- sh -c "ls -la /data/sessions/account_*"
# Session trebuie să existe (nu e ștearsă imediat)
```

**Pas 5:** Verifică reconnect reușit:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts | jq
# După retry, status trebuie să fie "connected" (NU "needs_qr")
```

**✅ Test PASSED dacă:**
- Retry logic apare în loguri
- Sesiunea NU e ștearsă după primul logout
- Reconnect reușește fără QR nou

---

## Test 3: Session Health Check Periodic

### Scenariu: Sesiunea devine coruptă - health check o restaurează

**Pas 1:** Monitorează health check:
```bash
railway logs --service whatsapp-backend --follow | grep -i "health\|stale\|restore"
```

**Pas 2:** Simulează corupție sesiune (testare manuală):
```bash
# NU face asta în production! Doar pentru test.
railway run --service whatsapp-backend -- sh -c "rm /data/sessions/account_*/creds.json"
```

**Pas 3:** Așteaptă health check (runează la fiecare 60s):
```bash
# Așteaptă 60-120 secunde
railway logs --service whatsapp-backend | grep -i "Session health check\|restore.*Firestore"
# Trebuie să vezi:
# "⚠️  [account_xxx] Session health check: socket disconnected but status is connected"
# "🔄 [account_xxx] Session health check: restoring missing disk session from Firestore..."
# "✅ [account_xxx] Session restored from Firestore (X files)"
```

**Pas 4:** Verifică account e încă conectat:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts | jq
# Status trebuie să rămână "connected"
```

**✅ Test PASSED dacă:**
- Health check detectează corupția
- Auto-restore apare în loguri
- Account-ul rămâne "connected"

---

## Test 4: Auto-reconnect când lock-ul e liberat (Passive Mode)

### Scenariu: Backend intră în PASSIVE mode, apoi lock-ul e liberat

**Pas 1:** Verifică backend mode:
```bash
curl -i https://whats-upp-production.up.railway.app/ready | jq
# Verifică: { "mode": "active" | "passive" }
```

**Pas 2:** Monitorează lock status:
```bash
railway logs --service whatsapp-backend --follow | grep -i "passive\|active\|lock"
```

**Pas 3:** Simulează PASSIVE mode (opțional):
- Rulează o altă instanță care ia lock-ul
- SAU: Așteaptă un PASSIVE mode natural

**Pas 4:** Verifică accounts blocate:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts | jq
# Account-urile în "connecting" sunt blocate în passive mode
```

**Pas 5:** Când lock-ul e liberat (backend devine ACTIVE):
```bash
railway logs --service whatsapp-backend | grep -i "ACTIVE MODE\|Auto-Reconnect\|wa-bootstrap:active"
# Trebuie să vezi:
# "[WABootstrap] ✅ ACTIVE MODE - lock acquired after retry"
# "🔄 [Auto-Reconnect] ACTIVE mode detected, checking for stuck connections..."
# "🔄 [account_xxx] Auto-reconnecting after ACTIVE mode transition"
```

**Pas 6:** Verifică accounts se reconectează:
```bash
# După 10-30 secunde
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts | jq
# Status trebuie să se schimbe din "connecting" în "connected"
```

**✅ Test PASSED dacă:**
- Auto-reconnect apare în loguri când lock-ul e liberat
- Account-urile blocate se reconectează automat
- Nu mai rămân blocate în "connecting"

---

## Test 5: Stabilitate Generală (Long-run)

### Scenariu: Backend rulează 24/7 - sesiunea rămâne stabilă

**Pas 1:** Monitorează backend 24 ore:
```bash
# Setup monitoring (exemplu cu watch):
watch -n 60 'curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts | \
  jq ".accounts[] | {id, status, lastDisconnectedAt}"'
```

**Pas 2:** Verifică loguri pentru probleme:
```bash
railway logs --service whatsapp-backend --since 24h | \
  grep -i "error\|failed\|disconnected\|needs_qr" | \
  grep -v "health check" | tail -20
```

**Pas 3:** Verifică sesiune stability metrics:
```bash
railway logs --service whatsapp-backend --since 24h | \
  grep -i "restore.*Firestore\|Session health\|stability" | tail -10
```

**Pas 4:** Testează mesaje funcționează continuu:
```bash
# Trimite mesaj test
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "account_xxx",
    "to": "+40712345678",
    "message": "Test stability"
  }' \
  https://whats-upp-production.up.railway.app/api/whatsapp/send-message
```

**✅ Test PASSED dacă:**
- Backend rulează stabil 24 ore fără disconectări frecvente
- Nu apare "needs_qr" des (doar la logout real)
- Mesajele funcționează continuu
- Restore count e mic (< 5 restoruri/zi = normal)

---

## Test 6: Verificare Rapidă (Quick Check)

### Verificare rapidă a stabilității curente

```bash
#!/bin/bash
# quick_stability_check.sh

echo "🔍 Quick Stability Check"
echo "========================"
echo ""

# 1. Check backend mode
echo "1. Backend Mode:"
curl -s https://whats-upp-production.up.railway.app/ready | \
  jq -r '"Mode: \(.mode), Ready: \(.ready), Instance: \(.instanceId)"'
echo ""

# 2. Check accounts status
echo "2. Accounts Status:"
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts | \
  jq -r '.accounts[] | "  - \(.name): \(.status) (QR: \(if .qrCode then "yes" else "no" end))"'
echo ""

# 3. Check recent restores (last hour)
echo "3. Recent Session Restores (last hour):"
railway logs --service whatsapp-backend --since 1h 2>/dev/null | \
  grep -c "Session restored from Firestore" || echo "  None (good - session stable)"
echo ""

# 4. Check for errors
echo "4. Recent Errors (last hour):"
railway logs --service whatsapp-backend --since 1h 2>/dev/null | \
  grep -i "error.*session\|failed.*restore" | tail -5 || echo "  None (good)"
echo ""

echo "✅ Quick check complete!"
```

**Rulează:**
```bash
chmod +x quick_stability_check.sh
./quick_stability_check.sh
```

---

## Indicatori de Succes

### ✅ Stabilitate BUNA:
- Status "connected" pentru toate account-urile active
- Restore count < 5/zi (normal pentru network issues minore)
- NU apare "needs_qr" des (doar la logout real)
- Health check detectează și repară probleme automat
- Auto-reconnect funcționează când lock-ul e liberat

### ❌ Probleme (necesită investigare):
- Status "needs_qr" frecvent (sesiunea se pierde des)
- Restore count > 20/zi (sesiunea se corupe des)
- Account-uri blocate în "connecting" > 5 min (lock issue)
- Logout repetat (401) fără retry logic

---

## Debugging

### Dacă restore-ul nu funcționează:

1. **Verifică Firestore backup există:**
   ```bash
   # În Firebase Console -> Firestore -> wa_sessions collection
   # Verifică că există document pentru account-ul tău
   ```

2. **Verifică logurile pentru erori:**
   ```bash
   railway logs --service whatsapp-backend | \
     grep -i "Firestore restore failed\|restore.*error" | tail -10
   ```

3. **Verifică SESSIONS_PATH e writable:**
   ```bash
   railway run --service whatsapp-backend -- sh -c \
     "test -w /data/sessions && echo 'writable' || echo 'NOT writable'"
   ```

### Dacă retry logic nu funcționează:

1. **Verifică MAX_LOGOUT_RETRIES e setat:**
   ```bash
   railway variables --service whatsapp-backend | grep MAX_LOGOUT
   # Trebuie: MAX_LOGOUT_RETRIES=2 (default)
   ```

2. **Verifică logout count în account:**
   ```bash
   # În loguri, caută:
   # "logoutCount" - ar trebui să incrementeze la fiecare logout
   ```

---

## Rezumat

**Teste rapide (5 min):**
- Test 6: Quick Check

**Teste complete (30 min):**
- Test 1: Auto-restore
- Test 3: Health check

**Teste long-run (24h):**
- Test 5: Stabilitate generală

**Teste avansate (când apar probleme):**
- Test 2: Retry logic
- Test 4: Auto-reconnect passive mode
