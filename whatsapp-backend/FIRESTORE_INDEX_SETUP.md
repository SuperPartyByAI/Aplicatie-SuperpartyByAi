# Firestore Index Setup pentru Recent-Sync

## Problema

Recent-sync folosește un query Firestore care necesită un index compus:

```javascript
db
  .collection('threads')
  .where('accountId', '==', accountId)
  .where('isLid', '==', false)
  .orderBy('lastMessageAt', 'desc')
  .limit(overfetchLimit)
  .get();
```

Fără acest index, vei vedea eroarea:
```
FAILED_PRECONDITION: The query requires an index
```

## Soluția: Creează Indexul Compus

### Opțiunea 1: Folosind link-ul din log (Recomandat)

Când vezi eroarea în logs, Firestore oferă un link direct pentru crearea indexului:

```
FAILED_PRECONDITION: The query requires an index. You can create it here: 
https://console.firebase.google.com/v1/r/project/superparty-frontend/firestore/indexes?create_composite=...
```

**Pași:**
1. Copiază link-ul complet din log
2. Deschide link-ul în browser
3. Click "Create Index"
4. Așteaptă ~1-5 minute pentru index să fie creat

### Opțiunea 2: Creare manuală în Firebase Console

1. Deschide [Firebase Console](https://console.firebase.google.com/)
2. Selectează proiectul `superparty-frontend`
3. Mergi la **Firestore Database** → **Indexes**
4. Click **Create Index**
5. Configurează:
   - **Collection ID**: `threads`
   - **Fields to index**:
     - `accountId` - Ascending
     - `isLid` - Ascending  
     - `lastMessageAt` - Descending
   - **Query scope**: Collection
6. Click **Create**

### Opțiunea 3: Folosind Firebase CLI

Creează fișierul `firestore.indexes.json`:

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

## Verificare

După crearea indexului, verifică în logs că nu mai apare eroarea:

```bash
ssh root@37.27.34.179 "journalctl -u whatsapp-backend -n 100 --no-pager | grep -i 'FAILED_PRECONDITION.*index'"
```

Ar trebui să nu mai vezi erori de index.

## Impact

Fără index:
- Recent-sync folosește fallback (overfetch + filter în cod)
- Mai lent și mai costisitor (citește mai multe documente)
- Log-uri cu warning-uri constante

Cu index:
- Query-ul este optimizat
- Mai rapid și mai eficient
- Fără warning-uri în logs

## Note

- Indexul poate dura 1-5 minute să fie creat
- După creare, query-urile vor folosi automat indexul
- Nu este necesar restart al backend-ului
