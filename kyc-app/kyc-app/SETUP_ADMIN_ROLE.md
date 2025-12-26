# Setup Admin Role în Firestore

## Pași pentru a seta primul admin:

### 1. Mergi în Firebase Console:
[https://console.firebase.google.com/project/superparty-frontend/firestore](https://console.firebase.google.com/project/superparty-frontend/firestore)

### 2. Găsește colecția `users`

### 3. Găsește documentul cu UID-ul tău (user cu email `ursache.andrei1995@gmail.com`)

### 4. Adaugă câmpul `role`:
- Click pe documentul tău
- Click "Add field"
- Field name: `role`
- Field type: `string`
- Value: `admin`
- Click "Add"

### 5. Salvează

## SAU rulează acest script în Firebase Console:

```javascript
// În Firebase Console → Firestore → Query
// Găsește user-ul după email
db.collection('users')
  .where('email', '==', 'ursache.andrei1995@gmail.com')
  .get()
  .then(snapshot => {
    snapshot.forEach(doc => {
      doc.ref.update({ role: 'admin' });
      console.log('Admin role added to:', doc.id);
    });
  });
```

## Verificare:

După ce ai adăugat role, aplicația va verifica automat:
- `isAdmin()` va returna `true` pentru useri cu `role: 'admin'`
- Firestore Rules vor permite acces admin
