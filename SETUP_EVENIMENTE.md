# Setup Evenimente - Pași Reproductibili

## Prerequisite

- Node.js instalat
- Firebase CLI instalat: `npm install -g firebase-tools`
- Firebase Admin SDK key: `firebase-adminsdk.json` în root

## Pași Setup

### 1. Instalare Dependențe

```bash
cd /workspaces/Aplicatie-SuperpartyByAi
npm install firebase-admin
```

### 2. Deploy Indexuri Firestore

```bash
firebase deploy --only firestore:indexes
```

**Output așteptat:**
```
✔  Deploy complete!
```

**Verificare:**
- Deschide [Firebase Console](https://console.firebase.google.com)
- Firestore Database → Indexes
- Verifică că există indexuri pentru `evenimente` collection

### 3. Seed Evenimente în Firestore

```bash
node scripts/seed_evenimente.js
```

**Output așteptat:**
```
🌱 Începem seed-ul pentru evenimente...

✅ Pregătit eveniment: Petrecere Maria - 5 ani
✅ Pregătit eveniment: Petrecere Andrei - 6 ani
✅ Pregătit eveniment: Petrecere Sofia - 4 ani
✅ Pregătit eveniment: Petrecere Daria - 7 ani
✅ Pregătit eveniment: Petrecere Rareș - 5 ani
✅ Pregătit eveniment: Petrecere Elena - 6 ani
✅ Pregătit eveniment: Petrecere Matei - 8 ani

🎉 Seed complet! 7 evenimente adăugate în Firestore.

📊 Statistici:
   - Evenimente cu șofer necesar: 4
   - Evenimente fără șofer: 3
   - Total roluri nealocate: 11
```

**Verificare:**
- Firebase Console → Firestore Database → `evenimente` collection
- Ar trebui să vezi 7 documente

### 4. Seed Useri (Opțional - pentru selector useri)

Dacă nu ai useri în Firestore, creează-i manual sau cu script:

```bash
# TODO: Creează script seed_users.js
node scripts/seed_users.js
```

Sau manual în Firebase Console:
- Firestore → `users` collection → Add document
- Câmpuri necesare:
  - `displayName`: "Andrei Ursache"
  - `staffCode`: "A1"
  - `role`: "admin" | "animator" | "sofer"
  - `email`: "user@example.com"

### 5. Verificare Finală

```bash
# Verifică că totul e OK
firebase firestore:indexes
```

## Comenzi Utile

### Șterge Toate Evenimentele (Reset)

```bash
# ATENȚIE: Șterge toate evenimentele!
firebase firestore:delete evenimente --recursive --yes
```

### Re-seed Evenimente

```bash
# Șterge și re-creează
firebase firestore:delete evenimente --recursive --yes && node scripts/seed_evenimente.js
```

### Verifică Indexuri

```bash
firebase firestore:indexes
```

### Deploy Doar Rules

```bash
firebase deploy --only firestore:rules
```

## Troubleshooting

### Eroare: "Cannot find module 'firebase-admin'"

```bash
npm install firebase-admin
```

### Eroare: "firebase-adminsdk.json not found"

1. Firebase Console → Project Settings → Service Accounts
2. Generate New Private Key
3. Salvează ca `firebase-adminsdk.json` în root

### Eroare: "Missing index"

```bash
firebase deploy --only firestore:indexes
```

Sau click pe link-ul din eroare pentru a crea indexul automat.

### Evenimente nu apar în aplicație

1. Verifică că seed script-ul a rulat cu succes
2. Verifică în Firebase Console că există documente
3. Verifică Firestore Rules că permit citire:
   ```javascript
   match /evenimente/{eventId} {
     allow read: if isAuthenticated();
   }
   ```

## Structură Date

### Eveniment

```json
{
  "nume": "Petrecere Maria - 5 ani",
  "locatie": "București, Sector 3, Str. Florilor nr. 10",
  "data": "2026-01-15T14:00:00Z",
  "tipEveniment": "petrecere_copii",
  "tipLocatie": "acasa",
  "requiresSofer": false,
  "alocari": {
    "animator_principal": {
      "userId": null,
      "status": "unassigned"
    }
  },
  "sofer": {
    "required": false,
    "userId": null,
    "status": "not_required"
  },
  "createdAt": "2026-01-05T12:00:00Z",
  "createdBy": "seed_script",
  "updatedAt": "2026-01-05T12:00:00Z",
  "updatedBy": "seed_script"
}
```

### User (pentru selector)

```json
{
  "displayName": "Andrei Ursache",
  "staffCode": "A1",
  "role": "admin",
  "email": "andrei@example.com",
  "createdAt": "2026-01-01T00:00:00Z"
}
```

## Next Steps

După setup, testează aplicația:
1. Deschide Flutter app
2. Navighează la "Evenimente"
3. Verifică că se încarcă cele 7 evenimente
4. Testează filtrele și sortarea
5. Testează alocarea rolurilor (necesită useri în Firestore)

Pentru testare completă, vezi: `TEST_EVENIMENTE_E2E.md`
