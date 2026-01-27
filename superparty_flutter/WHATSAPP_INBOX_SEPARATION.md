# Separarea Inbox-urilor WhatsApp

## Prezentare Generală

Aplicația suportă acum 2 tipuri de inbox-uri separate:

1. **My Inbox** (`/whatsapp/my-inbox`) - Conversațiile contului WhatsApp personal al utilizatorului
2. **Employee Inbox** (`/whatsapp/employee-inbox`) - Conversațiile conturilor WhatsApp de angajat (cu dropdown pentru selectarea contului)

## Configurare în Firestore

### 1. Cont Personal (My Inbox)

Pentru ca un utilizator să aibă acces la "My Inbox", adaugă în `users/{uid}`:

```javascript
{
  "myWhatsAppAccountId": "account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443",
  "updatedAt": FieldValue.serverTimestamp()
}
```

**Câmpuri:**
- `myWhatsAppAccountId` (string): ID-ul contului WhatsApp personal (din colecția de conturi WhatsApp)

### 2. Conturi de Angajat (Employee Inbox)

Pentru ca un angajat să aibă acces la "Employee Inbox", adaugă în `users/{uid}`:

```javascript
{
  "employeeWhatsAppAccountIds": [
    "account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443",
    "account_prod_another_account_id"
  ],
  "updatedAt": FieldValue.serverTimestamp()
}
```

**Câmpuri:**
- `employeeWhatsAppAccountIds` (array<string>): Lista de ID-uri ale conturilor WhatsApp de angajat

**Alternativ:** Poți folosi și `staffProfiles/{uid}` cu câmpul `whatsAppAccountIds` sau `employeeWhatsAppAccountIds`.

### 3. Exemplu Complet

```javascript
// users/{uid}
{
  "email": "user@example.com",
  "name": "John Doe",
  "myWhatsAppAccountId": "account_prod_personal_123",
  "employeeWhatsAppAccountIds": [
    "account_prod_team_456",
    "account_prod_team_789"
  ],
  "status": "active",
  "createdAt": Timestamp,
  "updatedAt": Timestamp
}
```

## Cum Funcționează

### My Inbox Screen
- Afișează doar thread-urile din `myWhatsAppAccountId`
- Apare în WhatsAppScreen doar dacă `myWhatsAppAccountId` este setat
- Fără dropdown (un singur cont)

### Employee Inbox Screen
- Afișează thread-urile din `employeeWhatsAppAccountIds`
- Apare în WhatsAppScreen doar dacă utilizatorul este angajat (`staffProfiles/{uid}` există) și are cel puțin un cont în `employeeWhatsAppAccountIds`
- Cu dropdown pentru selectarea contului (dacă sunt multiple)

### Inbox (All Accounts) - Admin
- Afișează thread-uri din toate conturile conectate
- Disponibil doar pentru admin
- Este inbox-ul original (`/whatsapp/inbox`)

## Securitate

### Nivel 1: UI Filtering (Actual)
- Flutter filtrează thread-urile pe baza `accountId` în query-ul Firestore
- Utilizatorul vede doar thread-urile din conturile permise

### Nivel 2: Backend Filtering (Recomandat)
Pentru securitate completă, actualizează `whatsappProxyGetAccounts` în Firebase Functions:

```javascript
// functions/src/whatsapp/whatsappProxyGetAccounts.js
exports.whatsappProxyGetAccounts = functions.https.onCall(async (data, context) => {
  // ... existing auth check ...
  
  const uid = context.auth.uid;
  
  // Get user's allowed account IDs from Firestore
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  const myAccountId = userDoc.data()?.myWhatsAppAccountId;
  const employeeAccountIds = userDoc.data()?.employeeWhatsAppAccountIds || [];
  const allowedAccountIds = [myAccountId, ...employeeAccountIds].filter(Boolean);
  
  // Get all accounts from backend
  const allAccounts = await getAccountsFromBackend();
  
  // Filter to only return allowed accounts
  const filteredAccounts = allAccounts.filter(acc => 
    allowedAccountIds.includes(acc.id)
  );
  
  return { success: true, accounts: filteredAccounts };
});
```

## Testare

### 1. Testare My Inbox
1. Adaugă `myWhatsAppAccountId` în `users/{uid}` în Firestore
2. Deschide aplicația → WhatsApp → "My Inbox"
3. Verifică că apar doar thread-urile din contul personal

### 2. Testare Employee Inbox
1. Adaugă `employeeWhatsAppAccountIds` în `users/{uid}` în Firestore
2. Asigură-te că utilizatorul are `staffProfiles/{uid}` (este angajat)
3. Deschide aplicația → WhatsApp → "Employee Inbox"
4. Verifică dropdown-ul (dacă sunt multiple conturi)
5. Verifică că apar doar thread-urile din conturile de angajat

### 3. Testare Permisiuni
1. Fără `myWhatsAppAccountId` → "My Inbox" nu apare
2. Fără `employeeWhatsAppAccountIds` → "Employee Inbox" nu apare
3. Admin → vede "Inbox (All Accounts)" + "My Inbox" + "Employee Inbox" (dacă configurate)

## Fișiere Modificate/Create

### Noi Fișiere
- `lib/services/whatsapp_account_service.dart` - Serviciu pentru gestionarea accountId-urilor
- `lib/screens/whatsapp/my_inbox_screen.dart` - Ecran pentru inbox personal
- `lib/screens/whatsapp/employee_inbox_screen.dart` - Ecran pentru inbox de angajat

### Fișiere Modificate
- `lib/router/app_router.dart` - Adăugat rute pentru `/whatsapp/my-inbox` și `/whatsapp/employee-inbox`
- `lib/screens/whatsapp/whatsapp_screen.dart` - Adăugat butoane pentru ambele inbox-uri

## Note Importante

1. **Backward Compatibility**: Inbox-ul original (`/whatsapp/inbox`) rămâne disponibil pentru admin
2. **Sortare**: Ambele inbox-uri sortează thread-urile descrescător după `lastMessageAt`
3. **Real-time**: Ambele inbox-uri folosesc Firestore streams pentru actualizări în timp real
4. **Filtrare**: Thread-urile sunt filtrate automat (ascunse, redirect, broadcast sunt excluse)

## Următorii Pași (Opțional)

1. **Backend Filtering**: Implementează filtrarea în Firebase Functions pentru securitate completă
2. **UI pentru Setare**: Adaugă ecran pentru utilizatori să-și configureze propriul `myWhatsAppAccountId`
3. **Admin UI**: Adaugă interfață pentru admin să aloce `employeeWhatsAppAccountIds` la angajați
