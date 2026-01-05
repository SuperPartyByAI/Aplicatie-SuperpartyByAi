# Deploy Evenimente - Instrucțiuni

## 1. Deploy Indexuri Firestore

```bash
firebase deploy --only firestore:indexes
```

Sau manual în Firebase Console:

1. Deschide [Firebase Console](https://console.firebase.google.com)
2. Selectează proiectul
3. Firestore Database → Indexes
4. Adaugă indexurile din `firestore.indexes.json`

## 2. Seed Date Evenimente

```bash
cd /workspaces/Aplicatie-SuperpartyByAi
node scripts/seed_evenimente.js
```

Acest script va adăuga 7 evenimente demo în Firestore.

## 3. Verificare

După deploy, verifică în Firebase Console:

- Firestore → `evenimente` collection → ar trebui să vezi 7 documente
- Indexes → ar trebui să vezi indexurile pentru `data` (ASC/DESC)

## 4. Test în Aplicație

1. Deschide aplicația Flutter
2. Navighează la "Evenimente"
3. Testează:
   - ✅ Lista se încarcă din Firestore (nu demo data)
   - ✅ Filtrele funcționează
   - ✅ Sortarea funcționează
   - ✅ "Evenimentele mele" e disabled dacă nu ești logat

## Probleme Comune

### Eroare: "Missing index"

- Rulează `firebase deploy --only firestore:indexes`
- Sau creează indexul manual din link-ul din eroare

### Evenimente nu apar

- Verifică că seed script-ul a rulat cu succes
- Verifică în Firebase Console că există documente în `evenimente`

### "Evenimentele mele" nu funcționează

- Asigură-te că ești autentificat în aplicație
- Verifică că evenimentele au `alocari` cu `userId` setat
