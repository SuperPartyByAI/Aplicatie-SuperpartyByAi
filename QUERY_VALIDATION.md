# Validare Query-uri Firestore - Evenimente

## 🎯 Obiectiv

Verificare că toate query-urile funcționează cu indexurile definite în `firestore.indexes.json`.

---

## 📋 Query-uri Implementate

### 1. Evenimente Active (fără dateRange)

**Cod:**

```dart
Query query = _firestore.collection('evenimente');
query = query.where('isArchived', isEqualTo: false);
query = query.orderBy('nume', descending: false);
```

**Index necesar:**

```json
{
  "fields": [
    { "fieldPath": "isArchived", "order": "ASCENDING" },
    { "fieldPath": "nume", "order": "ASCENDING" }
  ]
}
```

**Status:** ✅ Index nu e necesar (orderBy simplu după where equality)

---

### 2. Evenimente Active cu dateRange

**Cod:**

```dart
Query query = _firestore.collection('evenimente');
query = query.where('isArchived', isEqualTo: false);
query = query.where('data', isGreaterThanOrEqualTo: startDate);
query = query.where('data', isLessThanOrEqualTo: endDate);
query = query.orderBy('data', descending: false);
```

**Index necesar:**

```json
{
  "fields": [
    { "fieldPath": "isArchived", "order": "ASCENDING" },
    { "fieldPath": "data", "order": "ASCENDING" }
  ]
}
```

**Status:** ✅ Index definit în `firestore.indexes.json`

---

### 3. Evenimente Active cu dateRange + sortare client-side

**Cod:**

```dart
// Server-side
Query query = _firestore.collection('evenimente');
query = query.where('isArchived', isEqualTo: false);
query = query.where('data', isGreaterThanOrEqualTo: startDate);
query = query.where('data', isLessThanOrEqualTo: endDate);
query = query.orderBy('data', descending: false);

// Client-side
events.sort((a, b) => a.nume.compareTo(b.nume));
```

**Index necesar:**

```json
{
  "fields": [
    { "fieldPath": "isArchived", "order": "ASCENDING" },
    { "fieldPath": "data", "order": "ASCENDING" }
  ]
}
```

**Status:** ✅ Index definit, sortare nume/locatie client-side

---

### 4. Evenimente Arhivate

**Cod:**

```dart
Query query = _firestore.collection('evenimente');
query = query.where('isArchived', isEqualTo: true);
query = query.orderBy('archivedAt', descending: true);
```

**Index necesar:**

```json
{
  "fields": [
    { "fieldPath": "isArchived", "order": "ASCENDING" },
    { "fieldPath": "archivedAt", "order": "DESCENDING" }
  ]
}
```

**Status:** ✅ Index definit în `firestore.indexes.json`

---

### 5. Dovezi Active (subcollection)

**Cod:**

```dart
Query query = _firestore
    .collection('evenimente')
    .doc(eventId)
    .collection('dovezi');
query = query.where('isArchived', isEqualTo: false);
query = query.orderBy('uploadedAt', descending: true);
```

**Index necesar:**

```json
{
  "collectionGroup": "dovezi",
  "fields": [
    { "fieldPath": "isArchived", "order": "ASCENDING" },
    { "fieldPath": "uploadedAt", "order": "DESCENDING" }
  ]
}
```

**Status:** ✅ Index definit în `firestore.indexes.json`

---

### 6. Dovezi Active cu Categorie

**Cod:**

```dart
Query query = _firestore
    .collection('evenimente')
    .doc(eventId)
    .collection('dovezi');
query = query.where('isArchived', isEqualTo: false);
query = query.where('categorie', isEqualTo: 'setup');
query = query.orderBy('uploadedAt', descending: true);
```

**Index necesar:**

```json
{
  "collectionGroup": "dovezi",
  "fields": [
    { "fieldPath": "isArchived", "order": "ASCENDING" },
    { "fieldPath": "categorie", "order": "ASCENDING" },
    { "fieldPath": "uploadedAt", "order": "DESCENDING" }
  ]
}
```

**Status:** ✅ Index definit în `firestore.indexes.json`

---

### 7. Dovezi Arhivate

**Cod:**

```dart
Query query = _firestore
    .collection('evenimente')
    .doc(eventId)
    .collection('dovezi');
query = query.where('isArchived', isEqualTo: true);
query = query.orderBy('archivedAt', descending: true);
```

**Index necesar:**

```json
{
  "collectionGroup": "dovezi",
  "fields": [
    { "fieldPath": "isArchived", "order": "ASCENDING" },
    { "fieldPath": "archivedAt", "order": "DESCENDING" }
  ]
}
```

**Status:** ✅ Index definit în `firestore.indexes.json`

---

### 8. Dovezi Arhivate cu Categorie

**Cod:**

```dart
Query query = _firestore
    .collection('evenimente')
    .doc(eventId)
    .collection('dovezi');
query = query.where('isArchived', isEqualTo: true);
query = query.where('categorie', isEqualTo: 'setup');
query = query.orderBy('archivedAt', descending: true);
```

**Index necesar:**

```json
{
  "collectionGroup": "dovezi",
  "fields": [
    { "fieldPath": "isArchived", "order": "ASCENDING" },
    { "fieldPath": "categorie", "order": "ASCENDING" },
    { "fieldPath": "archivedAt", "order": "DESCENDING" }
  ]
}
```

**Status:** ✅ Index definit în `firestore.indexes.json`

---

## 📊 Rezumat Indexuri

| Colecție                    | Indexuri Definite | Status      |
| --------------------------- | ----------------- | ----------- |
| `evenimente`                | 7                 | ✅ Complete |
| `dovezi` (collection group) | 4                 | ✅ Complete |

### Evenimente (7 indexuri)

1. `isArchived + data ASC`
2. `isArchived + data DESC`
3. `isArchived + data ASC + nume ASC` (opțional, nu e folosit)
4. `isArchived + data ASC + locatie ASC` (opțional, nu e folosit)
5. `isArchived + data DESC + nume DESC` (opțional, nu e folosit)
6. `isArchived + data DESC + locatie DESC` (opțional, nu e folosit)
7. `isArchived + archivedAt DESC`

### Dovezi (4 indexuri)

1. `isArchived + uploadedAt DESC`
2. `isArchived + categorie + uploadedAt DESC`
3. `isArchived + archivedAt DESC`
4. `isArchived + categorie + archivedAt DESC`

---

## ✅ Validare

### Checklist

- [x] Toate query-urile au indexuri definite
- [x] Indexuri includ `isArchived` pentru filtrare
- [x] Sortare pe nume/locatie cu dateRange se face client-side
- [x] `orderBy('data')` mereu când există range pe data
- [x] Collection group indexuri pentru dovezi

### Reguli Firestore Respectate

1. ✅ **Equality before range**: `where('isArchived', ==)` înainte de `where('data', >=)`
2. ✅ **OrderBy pe range field**: când există range pe `data`, `orderBy('data')` e primul
3. ✅ **Client-side sorting**: sortare pe `nume`/`locatie` când există dateRange

---

## 🚀 Deploy

```bash
# Deploy indexuri
firebase deploy --only firestore:indexes

# Verificare în Firebase Console
# Firestore → Indexes → Composite
# Trebuie să apară toate indexurile definite
```

---

## 🧪 Testare

### Test 1: Evenimente Active fără Range

```dart
final filters = EventFilters(
  sortBy: SortBy.nume,
  sortDirection: SortDirection.asc,
);
final stream = eventService.getEventsStream(filters);
```

**Rezultat așteptat:** ✅ Funcționează fără index compus

---

### Test 2: Evenimente Active cu Range

```dart
final filters = EventFilters(
  dateRange: (DateTime(2026, 1, 1), DateTime(2026, 12, 31)),
  sortBy: SortBy.data,
  sortDirection: SortDirection.asc,
);
final stream = eventService.getEventsStream(filters);
```

**Rezultat așteptat:** ✅ Folosește index `isArchived + data ASC`

---

### Test 3: Evenimente Active cu Range + Sortare Nume

```dart
final filters = EventFilters(
  dateRange: (DateTime(2026, 1, 1), DateTime(2026, 12, 31)),
  sortBy: SortBy.nume,
  sortDirection: SortDirection.asc,
);
final stream = eventService.getEventsStream(filters);
```

**Rezultat așteptat:** ✅ Folosește index `isArchived + data ASC`, sortare client-side pe nume

---

### Test 4: Dovezi Active cu Categorie

```dart
final stream = evidenceService.getEvidenceStream(
  eventId: 'event123',
  categorie: EvidenceCategory.setup,
);
```

**Rezultat așteptat:** ✅ Folosește index `isArchived + categorie + uploadedAt DESC`

---

## ⚠️ Note

### Indexuri Opționale Nefolosite

Indexurile 3-6 pentru evenimente (`isArchived + data + nume/locatie`) **nu sunt folosite** în cod, deoarece sortarea pe nume/locatie cu dateRange se face client-side.

Puteți să le păstrați pentru viitor sau să le ștergeți pentru a reduce numărul de indexuri.

### Performanță Client-Side Sorting

Sortarea client-side pe nume/locatie este acceptabilă pentru:

- Liste mici-medii (< 1000 evenimente)
- Filtre cu dateRange (reduc numărul de documente)

Pentru liste foarte mari, considerați:

- Paginare server-side
- Limitare rezultate (`.limit(100)`)

---

**Data:** 2026-01-05  
**Status:** ✅ Toate query-urile validate
