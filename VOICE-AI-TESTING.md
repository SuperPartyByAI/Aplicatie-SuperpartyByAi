# Voice AI Testing Guide

## Flow-ul Conversației

### 1. Apel Inițial
- Client sună la: **+1 218 220 4425**
- IVR răspunde: "Bună ziua! Ați sunat la SuperParty. Pentru rezervare rapidă, apăsați tasta 1. Pentru operator, apăsați tasta 2."

### 2. Opțiune 1: Voice AI (Rezervare Automată)

#### Întrebări în Ordine:
1. **Data evenimentului**
   - AI: "Pentru ce dată doriți rezervarea?"
   - Exemplu răspuns: "15 ianuarie" sau "sâmbătă viitoare"

2. **Număr persoane**
   - AI: "Câți invitați veți avea?"
   - Exemplu răspuns: "20 de copii" sau "aproximativ 30"

3. **Tip eveniment**
   - AI: "Ce tip de eveniment: botez, nuntă, sau aniversare?"
   - Exemplu răspuns: "aniversare" sau "botez"

4. **Preferințe animator**
   - AI: "Aveți preferințe pentru animator? Baloane, facepainting, magie?"
   - Exemplu răspuns: "baloane și facepainting" sau "nu am preferințe"

5. **Nume client**
   - AI: "Cu cine vorbesc?"
   - Exemplu răspuns: "Maria Popescu"

#### Finalizare:
- AI confirmă: "Mulțumesc! Rezervarea dumneavoastră a fost înregistrată. Veți primi o confirmare pe WhatsApp. O zi bună!"
- Apelul se închide automat

### 3. Opțiune 2: Operator Uman
- AI: "Vă conectez cu un operator. Vă rugăm așteptați."
- Apelul sună în browser (Centrală Telefonică)
- Operatorul poate răspunde sau respinge

## Date Colectate

Voice AI colectează următoarele informații:

```javascript
{
  date: "15 ianuarie",           // Data evenimentului
  guests: "20 de copii",          // Număr invitați
  eventType: "aniversare",        // Tip eveniment
  preferences: "baloane și facepainting", // Preferințe
  clientName: "Maria Popescu"     // Nume client
}
```

## Caracteristici AI

### Comportament:
- ✅ Răspunsuri scurte (max 2 propoziții)
- ✅ Limbă: Doar română
- ✅ Ton: Prietenos și profesionist
- ✅ O întrebare pe rând
- ✅ Confirmă informațiile multiple dacă clientul le dă deodată

### Restricții:
- ❌ NU inventează informații
- ❌ NU pune întrebări despre preț/buget
- ❌ NU vorbește în alte limbi

## Scenarii de Test

### Scenariu 1: Client Cooperant
```
Client: Sună
IVR: "Pentru rezervare rapidă, apăsați 1..."
Client: Apasă 1
AI: "Pentru ce dată doriți rezervarea?"
Client: "15 ianuarie"
AI: "Câți invitați veți avea?"
Client: "20 de copii"
AI: "Ce tip de eveniment?"
Client: "Aniversare"
AI: "Preferințe animator?"
Client: "Baloane și facepainting"
AI: "Cu cine vorbesc?"
Client: "Maria Popescu"
AI: "Mulțumesc! Veți primi confirmare pe WhatsApp."
```

### Scenariu 2: Client Dă Multe Informații Deodată
```
AI: "Pentru ce dată doriți rezervarea?"
Client: "15 ianuarie, pentru 20 de copii, aniversare"
AI: "Perfect! Am notat: 15 ianuarie, 20 copii, aniversare. Aveți preferințe pentru animator?"
Client: "Baloane"
AI: "Excelent! Cu cine vorbesc?"
Client: "Maria"
AI: "Mulțumesc Maria! Veți primi confirmare pe WhatsApp."
```

### Scenariu 3: Client Confuz
```
AI: "Pentru ce dată doriți rezervarea?"
Client: "Nu știu exact..."
AI: "Aveți o dată aproximativă? De exemplu, luna sau săptămâna?"
Client: "Poate în februarie"
AI: "Perfect, februarie. Câți invitați veți avea?"
```

### Scenariu 4: Client Vrea Operator
```
Client: Sună
IVR: "Pentru operator, apăsați 2..."
Client: Apasă 2
AI: "Vă conectez cu un operator..."
[Apelul sună în browser]
```

## Verificare Funcționalitate

### 1. Backend Status
```bash
curl https://web-production-f0714.up.railway.app/
```
Răspuns așteptat:
```json
{
  "status": "online",
  "service": "SuperParty Backend - WhatsApp + Voice",
  "activeCalls": 0
}
```

### 2. Verificare Environment Variables
Asigură-te că sunt setate în Railway:
- ✅ `OPENAI_API_KEY` - pentru GPT-4o
- ✅ `TWILIO_ACCOUNT_SID`
- ✅ `TWILIO_AUTH_TOKEN`
- ✅ `TWILIO_PHONE_NUMBER` - +1 218 220 4425
- ✅ `TWILIO_API_KEY`
- ✅ `TWILIO_API_SECRET`
- ✅ `TWILIO_TWIML_APP_SID`
- ✅ `BACKEND_URL` - https://web-production-f0714.up.railway.app
- ⚠️ `TWILIO_WHATSAPP_NUMBER` - whatsapp:+14155238886 (opțional - Sandbox)

### 3. Test WhatsApp Notification
```bash
curl -X POST https://web-production-f0714.up.railway.app/api/whatsapp/test \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+40792864811"}'
```

**IMPORTANT**: Pentru Twilio WhatsApp Sandbox, trebuie mai întâi să te înregistrezi:
1. Trimite pe WhatsApp la +1 415 523 8886
2. Mesajul: "join <sandbox-code>" (găsești codul în Twilio Console → Messaging → Try it out → Send a WhatsApp message)
3. După confirmare, poți primi mesaje de test

### 3. Verificare Logs
În Railway Dashboard → Logs, caută:
```
[Voice AI] Processing: { callSid: '...', speech: '...' }
[Voice AI] Reservation complete: { date: '...', guests: '...' }
```

## Costuri Estimate

### Per Apel (Voice AI):
- Twilio Voice: ~$0.01/min
- Twilio Speech Recognition: ~$0.02/min
- GPT-4o API: ~$0.05/apel (5-10 mesaje)
- **Total: ~$0.10-0.15 per apel**

### Per Apel (Operator):
- Twilio Voice: ~$0.01/min
- Twilio Recording: ~$0.0025/min
- **Total: ~$0.01-0.03 per apel**

## Testare Flow Complet

### Pas 1: Verificare Backend
```bash
# Check backend status
curl https://web-production-f0714.up.railway.app/

# Expected: {"status":"online",...}
```

### Pas 2: Test Apel Telefonic
1. Sună la **+1 218 220 4425**
2. Ascultă IVR: "Bună ziua! Ați sunat la SuperParty..."
3. Apasă **1** pentru Voice AI

### Pas 3: Conversație cu AI
Răspunde la întrebări:
- **Data**: "15 ianuarie"
- **Invitați**: "20 de copii"
- **Tip**: "aniversare"
- **Preferințe**: "baloane și facepainting"
- **Nume**: "Maria Popescu"

### Pas 4: Verificare Rezervare
```bash
# Get recent reservations
curl https://web-production-f0714.up.railway.app/api/reservations

# Expected: Array cu rezervarea ta
```

### Pas 5: Verificare WhatsApp
- Verifică telefonul pentru mesaj WhatsApp
- Ar trebui să primești confirmare cu toate detaliile

### Pas 6: Verificare în Dashboard
1. Deschide [Centrală Telefonică](https://superparty-kyc.web.app/centrala-telefonica)
2. Verifică "Call History" - ar trebui să vezi apelul
3. Verifică "Call Statistics" - ar trebui să crească numărul

## Checklist Testare

- [ ] Backend online (status 200)
- [ ] IVR răspunde la apel
- [ ] Voice AI înțelege română
- [ ] AI pune toate cele 5 întrebări
- [ ] Rezervare salvată în Firestore
- [ ] WhatsApp trimis (dacă configurat)
- [ ] Apel vizibil în dashboard
- [ ] Recording disponibil după apel

## Următorii Pași

După testare cu succes:
1. ✅ Salvare rezervare în Firestore - **IMPLEMENTAT**
2. ✅ Trimitere WhatsApp automată - **IMPLEMENTAT**
3. ⏳ Dashboard pentru vizualizare rezervări - **TODO**
4. ⏳ Notificări real-time pentru rezervări noi - **TODO**
5. ⏳ Număr telefonic românesc (+40) - **În așteptare (7 zile)**

## Troubleshooting

### Problema: Backend 502 Error
**Soluție**: Verifică că `OPENAI_API_KEY` este setat în Railway

### Problema: AI nu răspunde
**Soluție**: Verifică logs pentru erori GPT-4o API

### Problema: Speech recognition greșit
**Soluție**: Twilio folosește Google Speech-to-Text pentru română - acuratețea este ~85-90%

### Problema: Apelul se închide brusc
**Soluție**: Verifică că TwiML returnează `<Gather>` corect și nu `<Hangup>` prematur
