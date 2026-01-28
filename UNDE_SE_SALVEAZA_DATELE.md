# 💾 Unde se salvează datele

## Storage Hybrid: Local Disk + Firestore Cloud

Aplicația folosește un sistem **hybrid** de storage pentru durabilitate maximă:

---

## 📁 1. Sesiuni WhatsApp (Local Disk - Volume Persistent)

### Unde:
- **Locație:** Volume persistent montat la `/app/sessions`
- **Path complet:** `/app/sessions/account_XXX/` (pentru fiecare cont)
- **Tip:** Fișiere locale (Baileys auth state)

### Ce conține:
- `creds.json` - Credențiale WhatsApp (encrypted)
- `pre-key-XXX.json` - Pre-keys pentru criptare
- `session-XXX.json` - Date sesiune
- Alte fișiere necesare pentru autentificare Baileys

### Backup:
- **Firestore Collection:** `wa_sessions/{accountId}`
- **Ce:** Backup automat al tuturor fișierelor de sesiune
- **Când:** La fiecare `saveCreds()` (automatic după autentificare/modificări)

### Persistență:
- ✅ **Persistă la restart/redeploy** (volume persistent)
- ✅ **Backup în cloud** (Firestore)
- ✅ **Restore automat** din Firestore dacă local lipsește

---

## ☁️ 2. Metadata & Mesaje (Firestore - Cloud)

### Unde:
- **Platformă:** Google Cloud Firestore
- **Configurație:** Variabilă `FIREBASE_SERVICE_ACCOUNT_JSON`

### Collections Firestore:

#### 📋 `accounts` - Metadata Conturi
- **Ce:** Informații despre fiecare cont WhatsApp
- **Conține:**
  - `accountId` - ID cont
  - `phone` - Număr telefon
  - `status` - Status (connected, needs_qr, etc.)
  - `lastEventAt` - Ultimul eveniment
  - `lastMessageAt` - Ultimul mesaj
  - `leaseData` - Lease/lock pentru multi-worker (viitor)

#### 💬 `threads` - Conversații
- **Ce:** Metadata pentru fiecare conversație
- **Structură:** `threads/{threadId}`

#### 📨 `threads/{threadId}/messages` - Mesaje
- **Ce:** Mesajele din fiecare conversație
- **Structură:** `threads/{threadId}/messages/{messageId}`

#### 📤 `outbox` / `wa_outbox` - Mesaje în Coadă
- **Ce:** Mesaje care așteaptă să fie trimise
- **Folosit pentru:** Retry logic, queue management

#### 💾 `wa_sessions` - Backup Sesiuni
- **Ce:** Backup-uri criptate ale sesiunilor WhatsApp
- **Structură:** `wa_sessions/{accountId}`
- **Conține:** Toate fișierele din `/app/sessions/account_XXX/`

---

## 🔄 3. Cache (Redis - Opțional)

### Unde:
- **Platformă:** Redis (via `REDIS_URL` env var)
- **Folosit pentru:**
  - Cache metadata conturi
  - Cache responses API
  - Rate limiting

### Conținut:
- `whatsapp:accounts` - Cache lista conturi
- Rate limiting keys
- Temporary cache pentru performanță

### Note:
- ❌ **NU** conține date persistente
- ✅ **NU** afectează datele dacă Redis cade
- ✅ **Doar cache** pentru performanță

---

## 📊 Rezumat Storage

| Tip Date | Locație Primară | Backup | Persistență |
|----------|----------------|--------|-------------|
| **Sesiuni WhatsApp** | `/app/sessions` (Volume) | Firestore `wa_sessions` | ✅ Persistent |
| **Metadata Conturi** | Firestore `accounts` | N/A (cloud) | ✅ Cloud |
| **Mesaje** | Firestore `threads/messages` | N/A (cloud) | ✅ Cloud |
| **Queue Mesaje** | Firestore `outbox` | N/A (cloud) | ✅ Cloud |
| **Cache** | Redis | N/A | ❌ Temporary |

---

## 🔒 Securitate

### Sesiuni WhatsApp:
- ✅ Stocate **local** în volume persistent (encrypted de Baileys)
- ✅ Backup în **Firestore** (encrypted)
- ✅ **NU** sunt în Git (ignorate)

### Metadata/Mesaje:
- ✅ Stocate în **Firestore** (encrypted in-transit)
- ✅ Access control prin Firebase Admin SDK
- ✅ Backup automat de către Google Cloud

---

## 🔍 Verificare Storage

### Volume Persistent (Local):
```bash
# În legacy hosting, verifică:
- Tab "Volumes" → whats-upp-volume
- Mount Path: /app/sessions
- Status: Active
```

### Firestore:
```bash
# Verifică health endpoint:
curl https://whats-app-ompro.ro/health | jq .firestore

# Așteptat:
{
  "status": "connected",
  "policy": { ... }
}
```

### Verificare Variabile:
- `SESSIONS_PATH=/app/sessions` ✅
- `FIREBASE_SERVICE_ACCOUNT_JSON=***` ✅
- `REDIS_URL=***` (opțional)

---

## ⚠️ Important

### Dacă Volume-ul se pierde:
1. ✅ Aplicația va încerca să restaureze din Firestore `wa_sessions`
2. ✅ Backup-urile sunt automat în Firestore
3. ⚠️ Dar ar trebui să eviți ștergerea volume-ului!

### Dacă Firestore cade:
1. ✅ Sesiunile locale funcționează (volume persistent)
2. ⚠️ Backup-ul nu se face până se revine
3. ✅ Mesajele noi nu se salvează până se revine

### Dacă Redis cade:
1. ✅ Aplicația funcționează normal
2. ⚠️ Doar cache-ul se pierde (temporar)
3. ✅ Nu afectează datele persistente

---

**Concluzie:** Datele sunt salvate în **2 locuri** pentru durabilitate maximă:
- **Local** (Volume Persistent) - rapid, persistent
- **Cloud** (Firestore) - backup, scalabil
