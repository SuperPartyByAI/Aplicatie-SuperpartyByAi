# ⚠️ CRITICAL: Deploy 401 Reconnect Loop Fix to Hetzner

## Status

**Fix-ul este implementat local, dar NU este deployat pe Hetzner!**

Backend-ul rulează încă codul vechi, de aceea vezi în logs:
- `❌ [account_xxx] Explicit cleanup (401), deleting account` (mesaj vechi)
- Loop infinit: după "Connection lock released" apare imediat "Creating connection..."

---

## Deploy Required

**Următorul pas**: Deploy fix-ul pe Hetzner.

După deploy, logs-urile ar trebui să arate:
- `❌ [account_xxx] Explicit cleanup (401), terminal logout - clearing session` (mesaj nou)
- `🗑️  [account_xxx] Session directory deleted`
- **NU mai apare** "Creating connection..." după "Connection lock released"

---

## Deploy Command

```bash
cd whatsapp-backend

# Commit changes
git add server.js scripts/verify_terminal_logout.js
git commit -m "fix(wa): stop 401 reconnect loop; clear session on logged_out; deterministic regenerate-qr"

# Push to branch
git push origin cursor/baileys-fix
```

**Deploy pe Hetzner:**
1. SSH to server: `ssh root@37.27.34.179`
2. Navigate: `cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend`
3. Pull latest: `git pull origin cursor/baileys-fix`
4. Install: `npm ci`
5. Restart: `sudo systemctl restart whatsapp-backend`

---

## Verification After Deploy

**Așteaptă 2-3 minute după deploy**, apoi verifică logs:

✅ **CORECT (după fix)**:
```
❌ [account_xxx] Explicit cleanup (401), terminal logout - clearing session
🗑️  [account_xxx] Session directory deleted: /app/sessions/account_xxx
🗑️  [account_xxx] Firestore session backup deleted
🔓 [account_xxx] Connection lock released
(No more "Creating connection..." after this)
```

❌ **GREȘIT (cod vechi)**:
```
❌ [account_xxx] Explicit cleanup (401), deleting account
🔓 [account_xxx] Connection lock released
🔒 [account_xxx] Connection lock acquired  ← LOOP!
🔌 [account_xxx] Creating connection...
```

---

## Changes Made

1. ✅ Added `clearAccountSession()` function (clears disk + Firestore)
2. ✅ Added `isTerminalLogout()` helper
3. ✅ Fixed terminal logout cleanup (doesn't schedule `createConnection()`)
4. ✅ Updated regenerate-qr endpoint (clears session deterministically)
5. ✅ Added guard in `createConnection()` (skips `needs_qr`/`logged_out`)
6. ✅ Added guard in `restoreAccountsFromFirestore()` (skips terminal accounts)

---

## What Happens After Deploy

**Immediate effect**:
- Conturile cu 401 vor **opri loop-ul** de reconectare
- Status va fi setat la `needs_qr` (NU se mai recreează automat)
- User trebuie să apese "Regenerate QR" pentru re-pair

**Conversații**: **PRESERVATE** - nu sunt șterse (doar sesiunea e ștearsă)

---

**IMPORTANT**: Deploy acum pentru a opri loop-ul!
