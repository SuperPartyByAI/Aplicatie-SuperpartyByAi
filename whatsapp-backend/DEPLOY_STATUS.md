# 🚀 401 Fix - Deployment Status

## ✅ Code Pushed to GitHub

**Branch**: `audit-whatsapp-30`  
**Commit**: `f1a0cd3d`  
**Message**: `fix(wa): stop 401 reconnect loop; clear session on logged_out; deterministic regenerate-qr`

**Files Changed**:
- `whatsapp-backend/server.js` (fix-uri pentru 401 loop)
- `whatsapp-backend/scripts/verify_terminal_logout.js` (script de verificare, nou)

---

## ⚠️ Hetzner Deployment Required

**Status**: Codul e pe GitHub, dar **trebuie deployat pe Hetzner** pentru a opri loop-ul.

### **Deploy pe Hetzner (SSH)**

1. **Conectează-te la server**:
   ```bash
   ssh root@37.27.34.179
   ```

2. **Navighează la directorul backend**:
   ```bash
   cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend
   ```

3. **Pull latest code**:
   ```bash
   git pull origin cursor/baileys-fix
   ```

4. **Install dependencies**:
   ```bash
   npm ci
   ```

5. **Restart service**:
   ```bash
   sudo systemctl restart whatsapp-backend
   ```

6. **Așteaptă deploy**:
   - Build time: ~1-2 minute (npm ci)
   - Restart time: ~10-30 secunde
   - Total: ~2-3 minute

---

## ✅ Verification After Deploy

**După deploy, verifică logs în legacy hosting** (așteaptă 2-3 minute):

### **✅ CORECT (după fix)**:
```
❌ [account_xxx] Explicit cleanup (401), terminal logout - clearing session
🗑️  [account_xxx] Session directory deleted: /app/sessions/account_xxx
🗑️  [account_xxx] Firestore session backup deleted
🔓 [account_xxx] Connection lock released
(NO MORE "Creating connection..." after this)
```

### **❌ GREȘIT (cod vechi - dacă încă vezi asta după deploy)**:
```
❌ [account_xxx] Explicit cleanup (401), deleting account
🔓 [account_xxx] Connection lock released
🔒 [account_xxx] Connection lock acquired  ← LOOP CONTINUĂ!
🔌 [account_xxx] Creating connection...
```

---

## 📋 What the Fix Does

1. **Oprește Loop-ul**: Nu mai programează `createConnection()` pentru 401/logged_out
2. **Șterge Sesiu nă**: Curăță atât disk (`/app/sessions/{accountId}`) cât și Firestore (`wa_sessions/{accountId}`)
3. **Set Status `needs_qr`**: Contul rămâne cu status `needs_qr` și `requiresQR: true`
4. **Așteaptă User Action**: Utilizatorul trebuie să apese **"Regenerate QR"** pentru re-pair

---

## 🎯 Expected Behavior After Deploy

**Când backend-ul primește 401**:
- ✅ Oprește imediat reconnect attempts
- ✅ Șterge sesiunea coruptă (disk + Firestore)
- ✅ Setează status `needs_qr` (NU mai recreează automat)
- ✅ Așteaptă explicit "Regenerate QR" din Flutter app

**Conversații**: **PRESERVATE** - nu sunt șterse (doar sesiunea)

---

**Status**: ⏳ **AWAITING HETZNER DEPLOYMENT**

**Next Step**: Deploy pe Hetzner (SSH) → Verifică logs după 2-3 minute
