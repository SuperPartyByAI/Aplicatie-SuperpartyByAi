# Structura Firestore pentru Evenimente

## Colecție: `evenimente`

### Schema v2 (Curentă)

```javascript
{
  // Metadata
  "schemaVersion": 2,
  
  // Date principale (OBLIGATORII)
  "date": "DD-MM-YYYY",           // ex: "15-01-2026"
  "address": "string",             // ex: "Strada Florilor 10, București"
  
  // Informații sărbătorit
  "sarbatoritNume": "string",      // ex: "Maria"
  "sarbatoritVarsta": number,      // ex: 5
  "sarbatoritDob": "DD-MM-YYYY",   // optional, ex: "15-01-2021"
  
  // Încasare
  "incasare": {
    "status": "INCASAT|NEINCASAT|ANULAT",
    "metoda": "CASH|CARD|TRANSFER",  // optional
    "suma": number                    // optional
  },
  
  // Roluri/Servicii (array de obiecte)
  "roles": [
    {
      "slot": "A",                   // A-K (max 11 sloturi)
      "label": "Animator",
      "time": "14:00",
      "durationMin": 120,
      "assignedCode": "staff-123",   // optional, cod staff alocat
      "pendingCode": "staff-456"     // optional, cod staff pending
    },
    // ... alte roluri
  ],
  
  // Staff assignment (pentru compatibilitate)
  "requireEmployee": ["animator", "vata"],  // array de string-uri
  "staffProfiles": {
    "animator": "staff-user-id",    // null dacă nealocat
    "vata": null
  },
  
  // Arhivare (NEVER DELETE)
  "isArchived": false,
  "archivedAt": Timestamp,         // optional, când a fost arhivat
  "archivedBy": "uid",             // optional, cine a arhivat
  "archiveReason": "string",       // optional, motiv arhivare
  
  // Audit trail
  "createdAt": Timestamp,
  "createdBy": "uid",
  "updatedAt": Timestamp,
  "updatedBy": "uid",
  
  // Idempotency
  "clientRequestId": "hash-string"  // optional, pentru prevenirea duplicatelor
}
```

## Exemple de Documente

### Exemplu 1: Eveniment Complet
```json
{
  "schemaVersion": 2,
  "date": "15-02-2026",
  "address": "Strada Florilor 10, București",
  "sarbatoritNume": "Maria",
  "sarbatoritVarsta": 5,
  "sarbatoritDob": "15-02-2021",
  "incasare": {
    "status": "NEINCASAT"
  },
  "roles": [
    {
      "slot": "A",
      "label": "Animator",
      "time": "14:00",
      "durationMin": 120,
      "assignedCode": null,
      "pendingCode": null
    },
    {
      "slot": "C",
      "label": "Vată de zahăr",
      "time": "14:00",
      "durationMin": 120,
      "assignedCode": null,
      "pendingCode": null
    }
  ],
  "requireEmployee": ["animator", "vata"],
  "staffProfiles": {
    "animator": null,
    "vata": null
  },
  "isArchived": false,
  "createdAt": "2026-01-08T18:00:00Z",
  "createdBy": "user-123",
  "updatedAt": "2026-01-08T18:00:00Z",
  "updatedBy": "user-123",
  "clientRequestId": "abc123def456"
}
```

### Exemplu 2: Eveniment Minimal
```json
{
  "schemaVersion": 2,
  "date": "20-03-2026",
  "address": "Bulevardul Unirii 25",
  "sarbatoritNume": "Ion",
  "sarbatoritVarsta": 7,
  "incasare": {
    "status": "NEINCASAT"
  },
  "roles": [
    {
      "slot": "A",
      "label": "Animator",
      "time": "14:00",
      "durationMin": 120
    }
  ],
  "requireEmployee": ["animator"],
  "staffProfiles": {
    "animator": null
  },
  "isArchived": false,
  "createdAt": "2026-01-08T18:00:00Z",
  "createdBy": "user-123",
  "updatedAt": "2026-01-08T18:00:00Z",
  "updatedBy": "user-123"
}
```

### Exemplu 3: Eveniment Arhivat
```json
{
  "schemaVersion": 2,
  "date": "10-01-2026",
  "address": "Strada Mihai 5",
  "sarbatoritNume": "Ana",
  "sarbatoritVarsta": 3,
  "incasare": {
    "status": "ANULAT"
  },
  "roles": [],
  "requireEmployee": [],
  "staffProfiles": {},
  "isArchived": true,
  "archivedAt": "2026-01-08T18:00:00Z",
  "archivedBy": "admin-123",
  "archiveReason": "Client a anulat evenimentul",
  "createdAt": "2026-01-05T10:00:00Z",
  "createdBy": "user-123",
  "updatedAt": "2026-01-08T18:00:00Z",
  "updatedBy": "admin-123"
}
```

## Roluri Disponibile

### Mapping Slot → Label

| Slot | Label | Descriere |
|------|-------|-----------|
| A | Animator | Animație petreceri |
| B | Ursitoare | Pentru botezuri |
| C | Vată de zahăr | Mașină vată de zahăr |
| D | Popcorn | Mașină popcorn |
| E | Vată + Popcorn | Combo vată + popcorn |
| F | Decorațiuni | Decorațiuni evenimente |
| G | Baloane | Baloane simple |
| H | Baloane cu heliu | Baloane cu heliu |
| I | Aranjamente de masă | Aranjamente florale |
| J | Moș Crăciun | Pentru Crăciun |
| K | Gheață carbonică | Efecte speciale |

### Mapping requireEmployee → staffProfiles

```javascript
// Input (din AI)
requireEmployee: ["animator", "vata", "popcorn"]

// Output (în Firestore)
staffProfiles: {
  "animator": null,      // nealocat
  "vata": null,          // nealocat
  "popcorn": null        // nealocat
}

// După alocare staff
staffProfiles: {
  "animator": "staff-user-id-1",  // alocat
  "vata": "staff-user-id-2",      // alocat
  "popcorn": null                 // încă nealocat
}
```

## Validări

### Backend (functions/chatEventOps.js)

1. **Date obligatorii:**
   - `date` - format DD-MM-YYYY
   - `address` - non-empty string

2. **Format date:**
   - Regex: `/^\d{2}-\d{2}-\d{4}$/`
   - Exemple valide: `15-01-2026`, `31-12-2026`
   - Exemple invalide: `2026-01-15`, `15/01/2026`, `mâine`

3. **Idempotency:**
   - Verifică `clientRequestId` înainte de creare
   - Returnează eveniment existent dacă găsește duplicate

### Frontend (Flutter)

1. **Date picker:**
   - Format: `dd-MM-yyyy`
   - Conversie automată la DD-MM-YYYY

2. **Display:**
   - Afișează date în format DD-MM-YYYY
   - Conversie v1 (Timestamp) → DD-MM-YYYY pentru backward compatibility

## Queries Firestore

### Găsește evenimente nearhivate
```javascript
db.collection('evenimente')
  .where('isArchived', '==', false)
  .orderBy('date', 'asc')
  .get()
```

### Găsește evenimente pentru o dată
```javascript
db.collection('evenimente')
  .where('date', '==', '15-02-2026')
  .where('isArchived', '==', false)
  .get()
```

### Găsește evenimente cu clientRequestId
```javascript
db.collection('evenimente')
  .where('clientRequestId', '==', 'abc123def456')
  .limit(1)
  .get()
```

### Găsește evenimente pentru staff
```javascript
db.collection('evenimente')
  .where('staffProfiles.animator', '==', 'staff-user-id')
  .where('isArchived', '==', false)
  .get()
```

## Migrare v1 → v2

### Schema v1 (Deprecated)
```javascript
{
  "data": Timestamp,           // v1: Timestamp
  "locatie": "string",         // v1: locatie
  "adresa": "string",          // v1: adresa
  "alocari": {                 // v1: map de alocări
    "A": { "label": "Animator", "code": "staff-123" }
  }
}
```

### Conversie v1 → v2 (în Flutter)
```dart
// Date field
if (data.containsKey('date') && data['date'] is String) {
  dateStr = data['date'] as String;  // v2
} else if (data.containsKey('data') && data['data'] is Timestamp) {
  // v1: convert Timestamp to DD-MM-YYYY
  final timestamp = (data['data'] as Timestamp).toDate();
  dateStr = '${timestamp.day.toString().padLeft(2, '0')}-${timestamp.month.toString().padLeft(2, '0')}-${timestamp.year}';
}

// Address field
addressStr = data['address'] ?? data['adresa'] ?? data['locatie'] ?? '';

// Roles field
if (data.containsKey('roles') && data['roles'] is List) {
  // v2: array
  roles = parseRolesV2(data['roles']);
} else if (data.containsKey('alocari') && data['alocari'] is Map) {
  // v1: map
  roles = parseRolesV1(data['alocari']);
}
```

## Indexuri Firestore

### Indexuri necesare (firestore.indexes.json)
```json
{
  "indexes": [
    {
      "collectionGroup": "evenimente",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "isArchived", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "evenimente",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "clientRequestId", "order": "ASCENDING" }
      ]
    }
  ]
}
```

## Best Practices

### 1. NEVER DELETE
- Folosește `isArchived: true` în loc de delete
- Păstrează `archivedAt`, `archivedBy`, `archiveReason`

### 2. Audit Trail
- Setează `createdAt`, `createdBy` la creare
- Actualizează `updatedAt`, `updatedBy` la fiecare modificare

### 3. Idempotency
- Folosește `clientRequestId` pentru prevenirea duplicatelor
- Verifică existența înainte de creare

### 4. Date Format
- Folosește întotdeauna DD-MM-YYYY pentru date
- Validează formatul în backend și frontend

### 5. Staff Assignment
- Folosește `staffProfiles` pentru alocări
- Păstrează `requireEmployee` pentru compatibilitate

---

**Versiune:** 2.0  
**Data:** 2026-01-08  
**Autor:** Ona AI Agent
