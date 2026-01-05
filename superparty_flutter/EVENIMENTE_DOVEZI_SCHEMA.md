# Evenimente + Dovezi - Schema de Date

## Firestore Collections

### 1. `evenimente/{eventId}`

Colecție principală pentru evenimente.

**Câmpuri:**
```typescript
{
  nume: string,                    // Numele evenimentului
  locatie: string,                 // Locația evenimentului
  data: Timestamp,                 // Data și ora evenimentului
  tipEveniment: string,            // Tip: "Nunta", "Botez", "Petrecere privata", etc.
  tipLocatie: string,              // Tip: "Sala", "Exterior", "Casa", etc.
  requiresSofer: boolean,          // Calculat: dacă evenimentul necesită șofer
  
  // Alocări pe roluri
  alocari: {
    barman: {
      userId: string | null,
      status: "unassigned" | "assigned"
    },
    ospatar: {
      userId: string | null,
      status: "unassigned" | "assigned"
    },
    dj: {
      userId: string | null,
      status: "unassigned" | "assigned"
    },
    // ... alte roluri
  },
  
  // Șofer
  sofer: {
    required: boolean,
    userId: string | null,
    status: "not_required" | "unassigned" | "assigned"
  },
  
  // Metadata
  createdAt: Timestamp,
  createdBy: string,              // UID
  updatedAt: Timestamp,
  updatedBy: string               // UID
}
```

**Indexuri necesare:**
- `data ASC`
- `data DESC`
- Compus: `data ASC, tipEveniment ASC` (dacă filtrezi simultan)

---

### 2. `evenimente/{eventId}/dovezi/{docId}`

Sub-colecție pentru pozele de dovezi per eveniment.

**Câmpuri:**
```typescript
{
  categorie: "Mancare" | "Bautura" | "Scenotehnica" | "Altele",
  downloadUrl: string,            // URL public din Storage
  storagePath: string,            // Path în Storage pentru ștergere
  uploadedBy: string,             // UID
  uploadedAt: Timestamp,
  
  // Metadata opțională
  fileName: string,
  fileSize: number,               // bytes
  mimeType: string
}
```

**Indexuri necesare:**
- `categorie ASC, uploadedAt DESC`

---

### 3. `evenimente/{eventId}/dovezi_meta/{categorie}`

Metadata per categorie pentru lock status.

**docId = categorie** (ex: "Mancare", "Bautura", "Scenotehnica", "Altele")

**Câmpuri:**
```typescript
{
  locked: boolean,
  lockedBy: string | null,        // UID
  lockedAt: Timestamp | null,
  
  // Statistici opționale
  photoCount: number,
  lastUpdated: Timestamp
}
```

---

## Firebase Storage

### Path Structure

```
event_images/
  {eventId}/
    Mancare/
      {uuid}.jpg
      {uuid}.jpg
    Bautura/
      {uuid}.jpg
    Scenotehnica/
      {uuid}.jpg
    Altele/
      {uuid}.jpg
```

**Naming convention:**
- `{uuid}` = UUID v4 generat client-side
- Extensie: `.jpg`, `.png`, `.jpeg`

---

## SQLite (Local Cache)

### Tabel: `event_evidence_cache`

Pentru cache local al dovezilor înainte de upload.

```sql
CREATE TABLE event_evidence_cache (
  id TEXT PRIMARY KEY,              -- UUID
  eventId TEXT NOT NULL,
  categorie TEXT NOT NULL,          -- "Mancare" | "Bautura" | "Scenotehnica" | "Altele"
  localPath TEXT NOT NULL,          -- Path local pe device
  createdAt INTEGER NOT NULL,       -- Unix timestamp (ms)
  syncStatus TEXT NOT NULL,         -- "pending" | "synced" | "failed"
  remoteUrl TEXT,                   -- NULL până la sync
  remoteDocId TEXT,                 -- NULL până la sync
  errorMessage TEXT,                -- NULL sau mesaj eroare
  retryCount INTEGER DEFAULT 0
);

CREATE INDEX idx_event_category ON event_evidence_cache(eventId, categorie);
CREATE INDEX idx_sync_status ON event_evidence_cache(syncStatus);
```

---

## Logica `requiresSofer`

Funcție pură care determină dacă un eveniment necesită șofer:

```dart
bool requiresSofer({
  required String tipEveniment,
  required String tipLocatie,
}) {
  // Regula: Evenimente în locații exterioare necesită șofer
  final locatiiCuSofer = {'Exterior', 'Casa', 'Vila', 'Gradina'};
  
  // Excepții: Anumite tipuri de evenimente nu necesită șofer indiferent de locație
  final evenimenteFaraSofer = {'Online', 'Virtual'};
  
  if (evenimenteFaraSofer.contains(tipEveniment)) {
    return false;
  }
  
  return locatiiCuSofer.contains(tipLocatie);
}
```

---

## Reguli de Securitate Firestore

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Evenimente
    match /evenimente/{eventId} {
      // Citire: oricine autentificat
      allow read: if request.auth != null;
      
      // Scriere: doar admin sau GM
      allow write: if request.auth != null && 
        (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'gm']);
    }
    
    // Dovezi
    match /evenimente/{eventId}/dovezi/{docId} {
      // Citire: oricine autentificat
      allow read: if request.auth != null;
      
      // Creare: oricine autentificat, dacă categoria nu e locked
      allow create: if request.auth != null &&
        !exists(/databases/$(database)/documents/evenimente/$(eventId)/dovezi_meta/$(request.resource.data.categorie)) ||
        !get(/databases/$(database)/documents/evenimente/$(eventId)/dovezi_meta/$(request.resource.data.categorie)).data.locked;
      
      // Ștergere: doar dacă categoria nu e locked
      allow delete: if request.auth != null &&
        !get(/databases/$(database)/documents/evenimente/$(eventId)/dovezi_meta/$(resource.data.categorie)).data.locked;
    }
    
    // Dovezi metadata
    match /evenimente/{eventId}/dovezi_meta/{categorie} {
      // Citire: oricine autentificat
      allow read: if request.auth != null;
      
      // Scriere: doar admin, GM sau user care a uploadat dovezi în categoria respectivă
      allow write: if request.auth != null &&
        (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'gm']);
    }
  }
}
```

---

## Reguli de Securitate Storage

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /event_images/{eventId}/{categorie}/{fileName} {
      // Citire: oricine autentificat
      allow read: if request.auth != null;
      
      // Scriere: oricine autentificat (lock se verifică în Firestore)
      allow write: if request.auth != null &&
        request.resource.size < 10 * 1024 * 1024 && // Max 10MB
        request.resource.contentType.matches('image/.*');
    }
  }
}
```

---

## Flow de Upload Dovezi

1. **User selectează imagine** (ImagePicker)
2. **Salvare locală:**
   - Copiază fișierul în app documents directory
   - Insert în SQLite cu `syncStatus = "pending"`
   - UI afișează imediat thumbnail-ul local
3. **Upload în background:**
   - Verifică conectivitate
   - Upload în Storage la path-ul corect
   - Obține `downloadUrl`
   - Creează doc în Firestore `dovezi/{docId}`
   - Update SQLite: `syncStatus = "synced"`, `remoteUrl`, `remoteDocId`
4. **Retry logic:**
   - Dacă upload eșuează: `syncStatus = "failed"`, `errorMessage`
   - Buton "Sincronizează" în UI pentru retry manual
   - Sau retry automat la deschiderea ecranului

---

## Flow de Lock Categorie

1. **User apasă "Marchează OK"** pe o categorie
2. **Verificare:**
   - Categoria are cel puțin 1 poză?
   - Toate pozele sunt synced? (nu există pending în SQLite)
3. **Lock:**
   - Write în `dovezi_meta/{categorie}`: `locked = true`, `lockedBy = uid`, `lockedAt = now()`
4. **UI update:**
   - Disable butoane "Adaugă" și "Șterge"
   - Afișează badge "Blocat ✓"
   - Culoare diferită pentru categoria locked

---

## Testare Manuală

### Setup inițial:
1. Creează 2-3 evenimente în Firestore cu date diferite
2. Setează `tipEveniment` și `tipLocatie` variate pentru a testa `requiresSofer`

### Test Evenimente:
1. Deschide ecranul Evenimente
2. Verifică filtrele: Today, This week, This month, Custom range
3. Testează search
4. Testează sortare
5. Deschide detalii eveniment
6. Testează assign/unassign pe roluri
7. Verifică logica șofer (apare/dispare conform `requiresSofer`)

### Test Dovezi:
1. Deschide ecranul Dovezi pentru un eveniment
2. Adaugă 2-3 poze în categoria "Mâncare"
3. Verifică că apar imediat (cache local)
4. Verifică sync în background (icon/badge "synced")
5. Testează delete (doar dacă nu e locked)
6. Marchează categoria "OK" (lock)
7. Verifică că butoanele Add/Delete sunt disabled
8. Testează offline: dezactivează WiFi/mobile data, adaugă poze, verifică că rămân "pending"
9. Reactivează conectivitatea, apasă "Sincronizează", verifică upload

---

## Note Implementare

- **Null-safety:** Toate modelele trebuie să fie null-safe
- **Error handling:** Catch și afișează erori user-friendly
- **Loading states:** Afișează progress indicators la upload
- **Optimistic UI:** Afișează pozele imediat după selecție, înainte de upload
- **Cleanup:** Șterge fișierele locale după sync success (opțional, sau păstrează pentru cache)
