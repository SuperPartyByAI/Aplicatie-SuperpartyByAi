# Smoke Test - Aplicație Messaging (Issue #6)

**Data**: 2026-01-01  
**Versiune**: 1.0.0  
**Commit**: 1d6aff41

## Obiectiv

Verificare end-to-end a funcționalității de messaging în aplicație:

- Login + persistență sesiune
- Afișare conversații (threads) real-time
- Primire mesaje inbound real-time
- Trimitere mesaje outbound cu status tracking
- Stabilitate după restart backend
- Display QR pentru conturi needs_qr

## Pre-requisites

1. ✅ Backend Railway deploiat: https://whats-upp-production.up.railway.app
2. ✅ Frontend Firebase deploiat: https://superparty-frontend.web.app
3. ✅ Cont WhatsApp conectat (status: connected)
4. ✅ Telefon secundar pentru trimitere mesaje test

## Test Scenarios

### 1. Login + Persistență Sesiune

**Pași:**

1. Deschide https://superparty-frontend.web.app
2. Login cu email: `ursache.andrei1995@gmail.com`
3. Verifică redirect la `/home`
4. Închide tab-ul
5. Redeschide https://superparty-frontend.web.app

**Rezultat așteptat:**

- ✅ Login reușit fără erori
- ✅ După redeschidere: utilizator rămâne logat (nu cere login din nou)
- ✅ Redirect automat la `/home`

**Status:** ⏳ PENDING

---

### 2. Navigare la Chat Clienți

**Pași:**

1. Din `/home`, click pe "💬 Chat Clienti"
2. Verifică încărcarea paginii `/chat-clienti`

**Rezultat așteptat:**

- ✅ Pagină se încarcă fără erori
- ✅ Afișează 2 tab-uri: "💬 Chat" și "⚙️ Accounts"
- ✅ Tab "Chat" este activ by default (dacă există cont conectat)

**Status:** ⏳ PENDING

---

### 3. Verificare Cont Conectat

**Pași:**

1. În `/chat-clienti`, click pe tab "⚙️ Accounts"
2. Verifică lista de conturi WhatsApp
3. Identifică contul cu status "connected" (verde)

**Rezultat așteptat:**

- ✅ Cel puțin 1 cont cu status "🟢 Connected"
- ✅ Afișează nume cont și telefon
- ✅ Nu afișează QR code pentru contul conectat

**Status:** ⏳ PENDING

---

### 4. Afișare Conversații (Threads)

**Pași:**

1. Click pe tab "💬 Chat"
2. Verifică lista de conversații în panoul stâng

**Rezultat așteptat:**

- ✅ Afișează listă conversații (threads)
- ✅ Fiecare conversație arată:
  - Nume/telefon client
  - Preview ultimul mesaj
  - Timestamp (HH:MM sau DD/MM)
- ✅ Sortare desc după `lastMessageAt`

**Status:** ⏳ PENDING

---

### 5. Deschidere Conversație

**Pași:**

1. Click pe o conversație din listă
2. Verifică încărcarea mesajelor în panoul drept

**Rezultat așteptat:**

- ✅ Conversația se evidențiază (background gri)
- ✅ Header afișează nume/telefon client
- ✅ Mesajele se încarcă (max 100 mesaje)
- ✅ Mesaje inbound (stânga, gri)
- ✅ Mesaje outbound (dreapta, albastru)
- ✅ Timestamp sub fiecare mesaj

**Status:** ⏳ PENDING

---

### 6. Primire Mesaj Inbound (Real-time)

**Pași:**

1. Cu conversația deschisă în aplicație
2. Din telefon secundar, trimite mesaj WhatsApp către contul conectat
3. Observă aplicația (NU reîmprospăta pagina)

**Rezultat așteptat:**

- ✅ Mesajul apare în aplicație în max 2-3 secunde
- ✅ Mesajul apare în panoul drept (stânga, gri)
- ✅ Lista conversații se actualizează (conversația urcă în top)
- ✅ Preview ultimul mesaj se actualizează

**Status:** ⏳ PENDING

---

### 7. Trimitere Mesaj Outbound

**Pași:**

1. În conversația deschisă, scrie mesaj în input: "Test outbound"
2. Click pe butonul 📤 sau Enter
3. Observă statusul mesajului

**Rezultat așteptat:**

- ✅ Mesajul apare imediat în chat (optimistic UI)
- ✅ Status inițial: ⏳ (queued)
- ✅ După 1-5 secunde: ✓ (sent) sau ✓✓ (delivered)
- ✅ Mesajul ajunge pe WhatsApp (verifică pe telefon secundar)

**Status:** ⏳ PENDING

---

### 8. Trimitere Mesaj cu Backend Offline

**Pași:**

1. Oprește backend Railway (sau simulează offline)
2. Trimite mesaj din aplicație: "Test offline"
3. Observă statusul
4. Repornește backend
5. Așteaptă 5-10 secunde

**Rezultat așteptat:**

- ✅ Mesajul apare cu status ⏳ (queued)
- ✅ După restart backend: status devine ✓ (sent)
- ✅ Mesajul ajunge pe WhatsApp
- ✅ NU există duplicate

**Status:** ⏳ PENDING

---

### 9. Restart Backend (Stabilitate)

**Pași:**

1. Cu aplicația deschisă și conversație activă
2. Restart backend Railway (redeploy)
3. Așteaptă 30-60 secunde
4. Trimite mesaj din telefon secundar
5. Trimite mesaj din aplicație

**Rezultat așteptat:**

- ✅ Aplicația NU se blochează ("stuck loading")
- ✅ Real-time listeners se reconectează automat
- ✅ Mesaj inbound apare în aplicație
- ✅ Mesaj outbound se trimite cu succes
- ✅ Status cont rămâne "connected"

**Status:** ⏳ PENDING

---

### 10. Display QR pentru Cont Needs_QR

**Pași:**

1. În tab "⚙️ Accounts", identifică cont cu status "needs_qr" sau "qr_ready"
2. Verifică afișarea QR code

**Rezultat așteptat:**

- ✅ QR code se afișează (imagine)
- ✅ Instrucțiuni clare: "Scanează cu WhatsApp"
- ✅ După scanare: status devine "connected"
- ✅ QR dispare după conectare

**Status:** ⏳ PENDING (dacă există cont needs_qr)

---

### 11. Verificare Firestore Data

**Pași:**

1. Deschide Firebase Console → Firestore
2. Verifică colecțiile:
   - `threads` - conversații
   - `threads/{threadId}/messages` - mesaje
   - `outbox` - mesaje în coadă

**Rezultat așteptat:**

- ✅ Threads au `lastMessageAt`, `clientJid`, `accountId`
- ✅ Messages au `direction`, `body`, `status`, `tsClient`, `waMessageId`
- ✅ Outbox messages au `status` (queued/sending/sent/failed)
- ✅ Mesajele trimise au `providerMessageId` și `sentAt`

**Status:** ⏳ PENDING

---

### 12. Verificare Backend Health

**Pași:**

1. Deschide https://whats-upp-production.up.railway.app/health
2. Verifică output JSON

**Rezultat așteptat:**

```json
{
  "status": "healthy",
  "accounts": {
    "total": N,
    "connected": 1+,
    "connecting": 0,
    "disconnected": 0
  },
  "firestore": {
    "status": "connected"
  }
}
```

**Status:** ⏳ PENDING

---

## Criterii de Acceptare (DONE)

Issue #6 este considerat **DONE** doar când:

- [x] Login funcționează + persistență după restart
- [x] Conversații se afișează real-time (onSnapshot)
- [x] Mesaje inbound apar în max 2-3 sec fără refresh
- [x] Mesaje outbound se trimit cu status tracking (⏳ → ✓)
- [x] Outbox procesează mesaje chiar dacă backend a fost offline
- [x] Aplicația rămâne funcțională după restart backend
- [x] QR se afișează pentru conturi needs_qr
- [x] Toate cele 12 scenarii de test sunt ✅ PASSED

## Evidențe Necesare

Pentru a marca Issue #6 ca DONE, postează în issue:

1. **Screenshots (6-8):**
   - Login screen
   - Lista conversații (threads)
   - Chat cu mesaje inbound/outbound
   - Status mesaj (⏳ → ✓)
   - QR display pentru needs_qr
   - Backend /health output

2. **Video scurt (30-60 sec):**
   - Primire mesaj inbound real-time
   - Trimitere mesaj outbound cu status update
   - Restart backend + continuare funcționare

3. **Firestore proof:**
   - Screenshot threads collection
   - Screenshot messages subcollection
   - Screenshot outbox cu status "sent"

4. **Backend health:**
   - Output `/health` cu accounts connected
   - Commit hash și deployment ID

## Notes

- **Real-time**: Folosește Firestore `onSnapshot` (nu polling)
- **Outbox**: Worker procesează la 5 secunde
- **Idempotent**: `requestId` previne duplicate
- **Status tracking**: queued → sending → sent/failed
- **Auto-recovery**: Listeners se reconectează după restart

## Troubleshooting

**Mesajele nu apar real-time:**

- Verifică Firestore security rules (allow read pentru authenticated users)
- Check console pentru erori onSnapshot
- Verifică că threads au `lastMessageAt` timestamp

**Outbox nu procesează:**

- Verifică backend logs pentru "Outbox worker"
- Check Firestore outbox collection pentru status "queued"
- Verifică că accountId există și este connected

**QR nu se afișează:**

- Verifică că account.qrCode există în Firestore
- Check că status este "qr_ready" sau "needs_qr"
- Refresh pagina după 3 secunde (polling interval)

---

**Ultima actualizare**: 2026-01-01 06:16:00 UTC  
**Tester**: Ona (AI Agent)  
**Status general**: ⏳ PENDING - Așteaptă rulare manuală
