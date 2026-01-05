# Test End-to-End Evenimente - Firebase Real Data

## Pregătire

### 1. Deploy Indexuri Firestore
```bash
firebase deploy --only firestore:indexes
```

### 2. Seed Date
```bash
node scripts/seed_evenimente.js
```

### 3. Verificare Firebase Console
- Deschide [Firebase Console](https://console.firebase.google.com)
- Verifică că există 7 evenimente în colecția `evenimente`
- Verifică că indexurile sunt create

## Test Cases

### ✅ TC1: Încărcare Listă Evenimente
**Pași:**
1. Deschide aplicația Flutter
2. Navighează la "Evenimente"
3. Verifică că se încarcă lista din Firestore (nu demo data)

**Rezultat așteptat:**
- Lista se încarcă cu 7 evenimente
- Fiecare eveniment afișează: nume, locație, dată
- Nu apar erori în console

**Status:** ⬜ Netestat | ✅ Passed | ❌ Failed

---

### ✅ TC2: Filtrare după Dată
**Pași:**
1. În ecranul Evenimente, selectează "Azi" din dropdown
2. Verifică că lista se filtrează
3. Selectează "Următoarele 7 zile"
4. Verifică că lista se actualizează

**Rezultat așteptat:**
- Filtrele funcționează corect
- Doar evenimentele din intervalul selectat apar
- Sortarea se păstrează

**Status:** ⬜ Netestat | ✅ Passed | ❌ Failed

---

### ✅ TC3: Filtru "Evenimentele Mele" (Neautentificat)
**Pași:**
1. Asigură-te că NU ești autentificat (logout)
2. Navighează la Evenimente
3. Deschide filtre
4. Încearcă să activezi "Doar evenimentele mele"

**Rezultat așteptat:**
- Switch-ul este disabled (gri)
- Apare mesajul "Trebuie să fii autentificat"
- Nu se poate activa filtrul

**Status:** ⬜ Netestat | ✅ Passed | ❌ Failed

---

### ✅ TC4: Filtru "Evenimentele Mele" (Autentificat)
**Pași:**
1. Autentifică-te în aplicație
2. Navighează la Evenimente
3. Deschide filtre
4. Activează "Doar evenimentele mele"

**Rezultat așteptat:**
- Switch-ul funcționează
- Lista se filtrează să arate doar evenimentele unde ești alocat
- Dacă nu ai evenimente alocate, lista e goală

**Status:** ⬜ Netestat | ✅ Passed | ❌ Failed

---

### ✅ TC5: Sortare Evenimente
**Pași:**
1. În ecranul Evenimente, deschide filtre
2. Schimbă sortarea între "Data (crescător)" și "Data (descrescător)"
3. Verifică că lista se reordonează

**Rezultat așteptat:**
- Sortarea funcționează instant
- Ordinea evenimentelor se schimbă corect
- Nu apar erori de indexuri Firestore

**Status:** ⬜ Netestat | ✅ Passed | ❌ Failed

---

### ✅ TC6: Alocare Rol cu Selector Useri
**Pași:**
1. Deschide un eveniment
2. Tap pe butonul "+" de lângă un rol nealocat
3. Verifică că se deschide dialogul de selectare useri
4. Caută un user după nume sau cod
5. Selectează un user
6. Verifică că rolul se alocă

**Rezultat așteptat:**
- Dialogul se deschide cu lista de useri
- Search funcționează
- Userii au nume + staffCode (nu UID)
- După alocare, apare numele userului (nu UID)
- Snackbar confirmă alocarea

**Status:** ⬜ Netestat | ✅ Passed | ❌ Failed

---

### ✅ TC7: Dealocare Rol
**Pași:**
1. Deschide un eveniment cu rol alocat
2. Tap pe butonul "-" de lângă rol
3. În dialog, selectează "Nealocat"
4. Verifică că rolul se dealocă

**Rezultat așteptat:**
- Dialogul se deschide
- Opțiunea "Nealocat" e vizibilă
- După dealocare, rolul apare ca "Nealocat"
- Snackbar confirmă dealocarea

**Status:** ⬜ Netestat | ✅ Passed | ❌ Failed

---

### ✅ TC8: Alocare Șofer
**Pași:**
1. Deschide un eveniment care necesită șofer
2. Tap pe butonul "+" de lângă "Șofer Necesar"
3. Selectează un user din dialog
4. Verifică că șoferul se alocă

**Rezultat așteptat:**
- Dialogul se deschide
- După alocare, apare numele șoferului (nu UID)
- Snackbar confirmă alocarea

**Status:** ⬜ Netestat | ✅ Passed | ❌ Failed

---

### ✅ TC9: Ștergere Eveniment (Fără Dovezi)
**Pași:**
1. Creează un eveniment nou (sau folosește unul existent fără dovezi)
2. Deschide evenimentul
3. Tap pe butonul de ștergere
4. Confirmă ștergerea
5. Verifică în Firebase Console că evenimentul a fost șters

**Rezultat așteptat:**
- Evenimentul dispare din listă
- Documentul e șters din Firestore
- Nu apar erori

**Status:** ⬜ Netestat | ✅ Passed | ❌ Failed

---

### ✅ TC10: Ștergere Eveniment (Cu Dovezi)
**Pași:**
1. Creează un eveniment și adaugă dovezi (poze)
2. Verifică în Firebase Console că există:
   - Document în `evenimente/{eventId}`
   - Subdocumente în `evenimente/{eventId}/dovezi`
   - Fișiere în Storage
3. Șterge evenimentul din aplicație
4. Verifică în Firebase Console că s-au șters:
   - Documentul principal
   - Toate subdocumentele
   - Fișierele din Storage

**Rezultat așteptat:**
- Evenimentul dispare complet
- Toate dovezile sunt șterse
- Nu rămân "orphan files" în Storage

**Status:** ⬜ Netestat | ✅ Passed | ❌ Failed

---

### ✅ TC11: Search Evenimente
**Pași:**
1. În ecranul Evenimente, scrie în bara de search
2. Caută după nume eveniment
3. Caută după locație
4. Verifică că rezultatele se filtrează

**Rezultat așteptat:**
- Search funcționează instant
- Rezultatele se filtrează corect
- Clear button (X) șterge search-ul

**Status:** ⬜ Netestat | ✅ Passed | ❌ Failed

---

### ✅ TC12: Real-time Updates
**Pași:**
1. Deschide aplicația pe 2 dispozitive (sau emulator + browser)
2. Pe dispozitivul 1, alocă un rol
3. Verifică pe dispozitivul 2 că se actualizează automat

**Rezultat așteptat:**
- Schimbările apar instant pe ambele dispozitive
- Nu e nevoie de refresh manual
- Stream Firestore funcționează corect

**Status:** ⬜ Netestat | ✅ Passed | ❌ Failed

---

## Probleme Cunoscute

### Eroare: "Missing index"
**Soluție:** Rulează `firebase deploy --only firestore:indexes` sau creează indexul manual din link-ul din eroare.

### Evenimente nu apar
**Soluție:** Verifică că seed script-ul a rulat cu succes și că există documente în Firestore.

### "Evenimentele mele" nu funcționează
**Soluție:** 
- Verifică că ești autentificat
- Verifică că evenimentele au `alocari` cu `userId` setat corect

### Userii nu apar în selector
**Soluție:**
- Verifică că există useri în colecția `users`
- Verifică că userii au câmpurile `displayName`, `staffCode`, `role`

### Ștergerea dovezilor eșuează
**Soluție:**
- Verifică că ai permisiuni în Storage Rules
- Verifică că `firebase_storage` package e instalat

---

## Checklist Final

- [ ] Toate indexurile Firestore sunt deployed
- [ ] Seed script a rulat cu succes (7 evenimente în DB)
- [ ] Toate cele 12 test cases au passed
- [ ] Nu există erori în console
- [ ] Real-time updates funcționează
- [ ] Selector useri afișează nume (nu UID)
- [ ] Ștergerea evenimentelor curăță și dovezile

---

## Raportare Bugs

Dacă găsești probleme, raportează aici:
- **Test Case:** TC#
- **Pași de reproducere:**
- **Rezultat așteptat:**
- **Rezultat actual:**
- **Screenshots/Logs:**
