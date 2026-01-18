# Problema: Sesiunea Baileys nu rămâne stabilă

## Probleme Identificate

### 1. **Sesiunea se pierde la redeploy (NU se restaurează din Firestore)**

**Problema:**
- Sesiunea se salvează pe disk (`useMultiFileAuthState`) și backup în Firestore
- **DAR:** când sesiunea de pe disk se pierde (redeploy, crash, restart), NU se restaurează automat din Firestore
- Codul doar salvează backup în Firestore, dar nu îl folosește pentru restore

**Cauză:**
```javascript
// server.js:1050-1130
// Folosește doar useMultiFileAuthState pentru disk
// Backup în Firestore există, dar NU se restaura automat
const { state, saveCreds } = useMultiFileAuthState(sessionPath);
```

**Soluție:**
- La startup, verifica dacă sesiunea de pe disk există
- Dacă NU există, restaurează din Firestore (`useFirestoreAuthState`)
- Dacă există ambele, preferă disk (mai recent)

### 2. **SESSIONS_PATH nu e persistent (Railway Volume lipsește)**

**Problema:**
- Dacă `SESSIONS_PATH` nu e configurat sau nu e persistent, sesiunea se pierde la redeploy
- Backup-ul în Firestore există, dar nu se folosește

**Soluție:**
- **Configură Railway Volume persistent:**
  ```bash
  # Railway Dashboard -> Volumes -> Create Volume
  # Mount path: /data/sessions
  # Set SESSIONS_PATH=/data/sessions
  ```

- **SAU** implementează restore automat din Firestore dacă disk session lipsește

### 3. **Logout/BadSession șterge sesiunea complet (nu permite recovery)**

**Problema:**
```javascript
// server.js:1781
if (reason === DisconnectReason.loggedOut || 
    reason === DisconnectReason.badSession || 
    reason === DisconnectReason.unauthorized) {
  await clearAccountSession(accountId); // Șterge disk + Firestore
  account.status = 'needs_qr'; // Trebuie re-pairing complet
}
```

**Cauză:**
- Când apare `loggedOut` sau `badSession`, sesiunea se șterge complet
- Uneori, sesiunea poate fi invalidă temporar (network issue, WhatsApp server restart)
- Dar codul o șterge permanent, forțând re-pairing complet

**Soluție:**
- **Verifică dacă logout e real sau temporar:**
  - Dacă e prima dată (nu s-a întâmplat recent) → poate fi temporar, păstrează backup
  - Dacă se repetă (de 2-3 ori) → logout real, șterge sesiunea
- **Implementează retry cu backup restore:**
  - La reconnect după logout temporar, încearcă să restaureze din Firestore
  - Dacă restore-ul funcționează → sesiunea e validă
  - Dacă restore-ul eșuează → logout real, șterge sesiunea

### 4. **Passive Mode blochează conexiunile (nu pornește Baileys)**

**Problema:**
```javascript
// lib/wa-bootstrap.js
if (!waBootstrap.canStartBaileys()) {
  // PASSIVE mode - nu pornește conexiuni
  // Conexiunile rămân în "connecting" infinit
}
```

**Cauză:**
- Când backend intră în PASSIVE mode (lock ținut de altă instanță), conexiunile nu se porneau
- Account-urile rămân în "connecting" și nu se conectează niciodată
- Când lock-ul e liberat, account-urile NU se conectează automat

**Soluție:**
- **Verifică lock status la startup:**
  - Dacă lock e liberat, pornește conexiunile automat
- **Implementează retry loop pentru passive mode:**
  - Când lock e liberat, reconectează automat account-urile în "connecting"
- **SAU** nu permite crearea de conexiuni în passive mode (returnează eroare clară)

### 5. **Nu există restore automat din Firestore la startup**

**Problema:**
- La startup, dacă sesiunea de pe disk lipsește, se generează QR nou (re-pairing)
- Backup-ul din Firestore există, dar nu se folosește

**Soluție:**
- **Implementează restore logic:**
  ```javascript
  async function restoreSessionFromFirestore(accountId) {
    // Verifică dacă disk session există
    const diskSessionExists = fs.existsSync(path.join(authDir, accountId));
    
    if (!diskSessionExists) {
      // Restaurează din Firestore
      const { state, saveCreds } = await useFirestoreAuthState(accountId, db);
      
      if (state.creds) {
        // Copiază sesiunea restaurată pe disk
        await saveSessionToDisk(accountId, state);
        return state;
      }
    }
    
    // Folosește disk session (mai rapid)
    return useMultiFileAuthState(path.join(authDir, accountId));
  }
  ```

### 6. **Reconnect-ul poate să eșueze dacă sesiunea lipsește**

**Problema:**
- Când apare disconnect (515, 428), se încearcă reconnect
- Dacă sesiunea de pe disk s-a pierdut între timp, reconnect-ul eșuează
- Nu există fallback la Firestore restore în timpul reconnect-ului

**Soluție:**
- **La reconnect, verifică dacă sesiunea există:**
  - Dacă NU există pe disk, restaurează din Firestore
  - Apoi continuă cu reconnect normal

### 7. **Nu există verificare periodică a stabilității sesiunii**

**Problema:**
- Nu există verificare periodică dacă sesiunea e validă
- Dacă sesiunea devine invalidă (fără să apară disconnect explicit), nu se detectează

**Soluție:**
- **Implementează health check periodic:**
  - Verifică dacă socket e încă conectat
  - Dacă nu e, încearcă reconnect cu restore din Firestore dacă e nevoie

## Soluții Prioritizate

### 🔴 Prioritate ALTA (fix imediat)

1. **Restore automat din Firestore la startup** dacă disk session lipsește
2. **Verifică SESSIONS_PATH e persistent** (Railway Volume configurat)

### 🟡 Prioritate MEDIE (fix în curând)

3. **Implementează retry cu restore** pentru logout temporar
4. **Auto-reconnect când lock e liberat** în passive mode

### 🟢 Prioritate JOASĂ (nice to have)

5. **Health check periodic** pentru sesiune
6. **Verificare la reconnect** dacă sesiunea lipsește

## Implementare

### Pas 1: Restore automat din Firestore

Modifică `createConnection()` în `server.js`:

```javascript
async function createConnection(accountId, name, phone) {
  // Verifică dacă disk session există
  const sessionPath = path.join(authDir, accountId);
  const diskSessionExists = fs.existsSync(sessionPath) && 
                            fs.existsSync(path.join(sessionPath, 'creds.json'));
  
  let state, saveCreds;
  
  if (!diskSessionExists && firestoreAvailable) {
    // Restaurează din Firestore
    console.log(`🔄 [${accountId}] Disk session missing, restoring from Firestore...`);
    try {
      const firestoreAuth = await useFirestoreAuthState(accountId, db);
      state = firestoreAuth.state;
      saveCreds = firestoreAuth.saveCreds;
      
      // Copiază sesiunea restaurată pe disk
      if (state.creds) {
        await fs.promises.mkdir(sessionPath, { recursive: true });
        await fs.promises.writeFile(
          path.join(sessionPath, 'creds.json'),
          JSON.stringify(state.creds, null, 2)
        );
        console.log(`✅ [${accountId}] Session restored from Firestore to disk`);
      }
    } catch (error) {
      console.error(`❌ [${accountId}] Firestore restore failed:`, error.message);
      // Fallback: generează QR nou
    }
  }
  
  // Dacă restore-ul eșuează sau nu există backup, folosește disk normal
  if (!state) {
    const diskAuth = useMultiFileAuthState(sessionPath);
    state = diskAuth.state;
    saveCreds = diskAuth.saveCreds;
  }
  
  // Continuă cu socket creation...
}
```

### Pas 2: Verifică Railway Volume

```bash
# Railway Dashboard -> Volumes -> Create Volume
# Name: whatsapp-sessions
# Mount path: /data/sessions

# Set environment variable:
SESSIONS_PATH=/data/sessions
```

### Pas 3: Retry cu restore pentru logout temporar

Modifică handler-ul de disconnect pentru a nu șterge imediat sesiunea:

```javascript
// La disconnect cu loggedOut:
// 1. Salvează backup în Firestore (dacă nu există deja)
// 2. Marchează ca "needs_restore" în loc de "needs_qr"
// 3. La reconnect, încearcă restore din Firestore
// 4. Dacă restore-ul funcționează → sesiunea e validă
// 5. Dacă restore-ul eșuează → logout real, șterge sesiunea
```

## Testare

1. **Test restore la startup:**
   - Șterge sesiunea de pe disk
   - Restart backend
   - Verifică că se restaurează din Firestore

2. **Test Railway Volume:**
   - Configurează volume persistent
   - Redeploy backend
   - Verifică că sesiunea persistă

3. **Test logout temporar:**
   - Simulează logout temporar (network issue)
   - Verifică că se încearcă restore înainte de ștergere completă

## Referințe

- [Baileys Auth State](https://github.com/WhiskeySockets/Baileys/blob/master/src/Utils/auth-state.ts)
- [Railway Volumes](https://docs.railway.app/develop/volumes)
- [Firestore Backup/Restore](whatsapp-backend/lib/persistence/firestore-auth.js)
