# Evenimente + Dovezi - Ghid Implementare

## 📋 Overview

Feature complet pentru gestionarea evenimentelor și dovezilor foto, implementat conform cerințelor din issue #17.

### Funcționalități

**Evenimente:**
- Listă evenimente cu filtre avansate (dată, tip, locație, șofer)
- Alocări pe roluri (barman, ospătar, DJ, fotograf, animator, bucătar)
- Logică șofer automată bazată pe tip eveniment + tip locație
- Detalii eveniment cu assign/unassign roluri

**Dovezi:**
- 4 categorii: Mâncare, Băutură, Scenotehnică, Altele
- Upload poze cu ImagePicker
- Cache local (SQLite) pentru offline-first
- Sync automat în background
- Lock categorie (Marchează OK) - blochează add/delete
- Grid thumbnails cu status indicators

## 🏗️ Arhitectură

```
lib/
├── models/
│   ├── event_model.dart          # EventModel + RoleAssignment + DriverAssignment
│   ├── evidence_model.dart       # EvidenceModel + LocalEvidence + CategoryMeta
│   └── event_filters.dart        # EventFilters + DatePreset enums
├── services/
│   ├── event_service.dart        # CRUD evenimente + filtrare + alocări
│   ├── evidence_service.dart     # Upload Storage + lock/unlock categorii
│   ├── local_evidence_cache_service.dart  # SQLite cache offline
│   └── file_storage_service.dart # Management fișiere locale
├── screens/
│   ├── evenimente/
│   │   ├── evenimente_screen.dart      # Listă + filtre
│   │   └── event_details_sheet.dart    # Detalii + alocări
│   └── dovezi/
│       └── dovezi_screen.dart          # 4 categorii + upload + lock
└── utils/
    └── event_utils.dart          # requiresSofer() logic
```

## 🚀 Setup

### 1. Firestore Collections

Creează următoarele colecții în Firestore:

```
evenimente/
  {eventId}/
    - nume, locatie, data, tipEveniment, tipLocatie
    - requiresSofer, alocari, sofer
    - createdAt, updatedAt, createdBy, updatedBy
    
    dovezi/
      {docId}/
        - categorie, downloadUrl, storagePath
        - uploadedBy, uploadedAt
        - fileName, fileSize, mimeType
    
    dovezi_meta/
      {categorie}/  # "Mancare", "Bautura", "Scenotehnica", "Altele"
        - locked, lockedBy, lockedAt
        - photoCount, lastUpdated
```

### 2. Firebase Storage

Structură paths:

```
event_images/
  {eventId}/
    Mancare/
      {timestamp}_{filename}.jpg
    Bautura/
      {timestamp}_{filename}.jpg
    Scenotehnica/
      {timestamp}_{filename}.jpg
    Altele/
      {timestamp}_{filename}.jpg
```

### 3. Firestore Indexes

Creează următoarele indexuri compuse:

```
Collection: evenimente
- data ASC, tipEveniment ASC
- data DESC, tipEveniment ASC

Collection: evenimente/{eventId}/dovezi
- categorie ASC, uploadedAt DESC
```

### 4. Security Rules

Aplică regulile din `EVENIMENTE_DOVEZI_SCHEMA.md`:

**Firestore:**
```javascript
// Evenimente: citire oricine, scriere admin/GM
match /evenimente/{eventId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && 
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'gm'];
}

// Dovezi: citire oricine, creare dacă nu e locked, ștergere dacă nu e locked
match /evenimente/{eventId}/dovezi/{docId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null && !isLocked(eventId, request.resource.data.categorie);
  allow delete: if request.auth != null && !isLocked(eventId, resource.data.categorie);
}

function isLocked(eventId, categorie) {
  return exists(/databases/$(database)/documents/evenimente/$(eventId)/dovezi_meta/$(categorie)) &&
    get(/databases/$(database)/documents/evenimente/$(eventId)/dovezi_meta/$(categorie)).data.locked == true;
}
```

**Storage:**
```javascript
match /event_images/{eventId}/{categorie}/{fileName} {
  allow read: if request.auth != null;
  allow write: if request.auth != null &&
    request.resource.size < 10 * 1024 * 1024 &&  // Max 10MB
    request.resource.contentType.matches('image/.*');
}
```

## 🧪 Testing

### Rulează teste

```bash
cd superparty_flutter

# Toate testele
flutter test

# Teste specifice
flutter test test/utils/event_utils_test.dart
flutter test test/models/event_filters_test.dart

# Cu coverage
flutter test --coverage
```

### Testare manuală

**Evenimente:**
1. Deschide ecranul Evenimente
2. Testează filtrele (Today, This week, Custom range)
3. Testează search
4. Deschide detalii eveniment
5. Testează assign/unassign roluri
6. Verifică logica șofer (apare/dispare conform requiresSofer)

**Dovezi:**
1. Deschide ecranul Dovezi pentru un eveniment
2. Adaugă 2-3 poze în categoria "Mâncare"
3. Verifică că apar imediat (cache local cu status "pending")
4. Așteaptă sync (status devine "synced")
5. Testează delete (doar dacă nu e locked)
6. Marchează categoria "OK" (lock)
7. Verifică că butoanele Add/Delete sunt disabled
8. Testează offline:
   - Dezactivează WiFi/mobile data
   - Adaugă poze (rămân "pending")
   - Reactivează conectivitatea
   - Apasă butonul "Sincronizează"
   - Verifică upload

## 📊 Statistici Implementare

- **Fișiere create:** 14
- **Linii de cod:** ~4,500
- **Modele:** 3
- **Servicii:** 4
- **Ecrane:** 3
- **Teste:** 2 suites
- **Commits:** 5

## 🔧 Comenzi Utile

```bash
# Analiză cod
flutter analyze

# Format cod
flutter format lib/

# Build APK
flutter build apk --release

# Run app
flutter run

# Clean build
flutter clean && flutter pub get
```

## 📝 TODO / Îmbunătățiri Viitoare

- [ ] User selector pentru alocări (acum folosește current user)
- [ ] Batch upload multiple poze
- [ ] Compress imagini înainte de upload
- [ ] Progress indicator per upload
- [ ] Retry automat pentru failed uploads
- [ ] Export dovezi ca PDF/ZIP
- [ ] Notificări push pentru alocări noi
- [ ] Widget tests pentru UI
- [ ] Integration tests end-to-end

## 🐛 Troubleshooting

### Eroare: "Categoria este blocată"
- Verifică în Firestore `dovezi_meta/{categorie}` că `locked = false`
- Sau unlock categoria din UI

### Poze nu se sincronizează
- Verifică conectivitatea
- Apasă butonul "Sincronizează" manual
- Verifică logs pentru erori
- Verifică Security Rules în Firebase Console

### Eroare: "Index required"
- Creează indexurile necesare în Firestore Console
- Link-ul apare în error message

### Imagini nu se încarcă
- Verifică Storage Rules
- Verifică că URL-urile sunt publice
- Verifică dimensiunea fișierelor (max 10MB)

## 📞 Suport

Pentru probleme sau întrebări:
1. Verifică documentația în `EVENIMENTE_DOVEZI_SCHEMA.md`
2. Verifică testele pentru exemple de utilizare
3. Verifică logs-urile în Firebase Console

---

**Implementat de:** Ona AI
**Data:** 2026-01-05
**Issue:** #17
