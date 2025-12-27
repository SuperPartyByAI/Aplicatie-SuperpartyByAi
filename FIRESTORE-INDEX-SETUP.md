# 🔥 Firestore Index Setup

## Problema
```
Error: The query requires an index
```

Firestore necesită index composite pentru query-uri care filtrează după `callId` și sortează după `createdAt`.

## Soluție 1: Click pe Link (CEL MAI RAPID)

Click pe acest link pentru a crea automat index-ul:

[https://console.firebase.google.com/v1/r/project/superparty-frontend/firestore/indexes?create_composite=ClFwcm9qZWN0cy9zdXBlcnBhcnR5LWZyb250ZW5kL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9jYWxscy9pbmRleGVzL18QARoKCgZjYWxsSWQQARoNCgljcmVhdGVkQXQQAhoMCghfX25hbWVfXxAC](https://console.firebase.google.com/v1/r/project/superparty-frontend/firestore/indexes?create_composite=ClFwcm9qZWN0cy9zdXBlcnBhcnR5LWZyb250ZW5kL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9jYWxscy9pbmRleGVzL18QARoKCgZjYWxsSWQQARoNCgljcmVhdGVkQXQQAhoMCghfX25hbWVfXxAC)

1. Click pe link
2. Click **Create Index**
3. Așteaptă 2-5 minute (Firebase creează index-ul)
4. Refresh pagina când status devine **Enabled**

## Soluție 2: Creare Manuală

### Pasul 1: Deschide Firebase Console

[https://console.firebase.google.com/project/superparty-frontend/firestore/indexes](https://console.firebase.google.com/project/superparty-frontend/firestore/indexes)

### Pasul 2: Creează Index

1. Click **Create Index**
2. Setează:
   - **Collection ID:** `calls`
   - **Fields to index:**
     - Field: `callId` | Order: Ascending
     - Field: `createdAt` | Order: Descending
3. Click **Create**

### Pasul 3: Așteaptă

Index-ul va fi în status **Building** pentru 2-5 minute, apoi devine **Enabled**.

## Verificare

După ce index-ul e creat, verifică în Railway logs:
- ✅ Nu mai apar erori "requires an index"
- ✅ Apelurile se actualizează cu duration
- ✅ Înregistrările se salvează corect

## Index-uri Necesare

Fișierul `firestore.indexes.json` conține toate index-urile necesare:

```json
{
  "indexes": [
    {
      "collectionGroup": "calls",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "callId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "createdAt",
          "order": "DESCENDING"
        }
      ]
    }
  ]
}
```

## Deploy Automat (Opțional)

Dacă vrei să deploy-ezi index-urile automat în viitor:

```bash
cd kyc-app/kyc-app
firebase login
firebase deploy --only firestore:indexes
```

## Status

După creare, verifică status aici:
[https://console.firebase.google.com/project/superparty-frontend/firestore/indexes](https://console.firebase.google.com/project/superparty-frontend/firestore/indexes)

- 🟡 **Building** - în curs de creare (2-5 min)
- 🟢 **Enabled** - gata de folosit
- 🔴 **Error** - verifică configurația
