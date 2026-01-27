# Firestore Indexes Required

## Index pentru Recent-Sync (THREADS)

Recent-sync folosește un query compus care necesită un index Firestore:

### Query-ul care necesită index:

```javascript
db
  .collection('threads')
  .where('accountId', '==', accountId)
  .where('isLid', '==', false)
  .orderBy('lastMessageAt', 'desc')
  .limit(overfetchLimit)
  .get();
```

### Index compus necesar:

**Collection**: `threads`

**Fields**:
1. `accountId` - Ascending
2. `isLid` - Ascending  
3. `lastMessageAt` - Descending

### Cum să creezi indexul:

#### Opțiunea 1: Folosind link-ul din log (cel mai simplu)

Când vezi eroarea în logs:
```
FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/...
```

1. Copiază link-ul complet din log
2. Deschide link-ul în browser
3. Click pe "Create Index"
4. Așteaptă ca indexul să fie creat (poate dura câteva minute)

#### Opțiunea 2: Manual în Firebase Console

1. Deschide [Firebase Console](https://console.firebase.google.com/)
2. Selectează proiectul `superparty-frontend`
3. Mergi la **Firestore Database** → **Indexes**
4. Click pe **Create Index**
5. Completează:
   - **Collection ID**: `threads`
   - **Fields**:
     - `accountId` - Ascending
     - `isLid` - Ascending
     - `lastMessageAt` - Descending
6. Click **Create**

#### Opțiunea 3: Folosind firestore.indexes.json

Creează sau actualizează `firestore.indexes.json` în root-ul proiectului:

```json
{
  "indexes": [
    {
      "collectionGroup": "threads",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "accountId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "isLid",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "lastMessageAt",
          "order": "DESCENDING"
        }
      ]
    }
  ]
}
```

Apoi deploy:
```bash
firebase deploy --only firestore:indexes
```

### Verificare

După crearea indexului, verifică în logs că nu mai apare eroarea:
```bash
ssh root@37.27.34.179 "journalctl -u whatsapp-backend -n 100 --no-pager | grep -i 'FAILED_PRECONDITION.*index' | tail -5"
```

Ar trebui să nu mai vezi erori de index pentru query-ul de threads.

### Notă

Recent-sync are deja fallback logic care:
1. Încearcă query-ul cu `isLid` filter (dacă indexul există)
2. Dacă indexul nu există, folosește overfetch + filter în cod
3. Dacă `orderBy` eșuează, query-ul fără `orderBy`

Crearea indexului este recomandată pentru:
- **Performanță mai bună** - query-uri mai rapide
- **Costuri mai mici** - mai puține documente citite
- **Predictibilitate** - nu depinde de fallback logic
