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
- ✅ `TWILIO_PHONE_NUMBER`
- ✅ `BACKEND_URL`

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

## Următorii Pași

După testare, implementează:
1. ✅ Salvare rezervare în Firestore
2. ✅ Trimitere WhatsApp automată cu confirmare
3. ✅ Dashboard pentru vizualizare rezervări
4. ✅ Notificări pentru rezervări noi

## Troubleshooting

### Problema: Backend 502 Error
**Soluție**: Verifică că `OPENAI_API_KEY` este setat în Railway

### Problema: AI nu răspunde
**Soluție**: Verifică logs pentru erori GPT-4o API

### Problema: Speech recognition greșit
**Soluție**: Twilio folosește Google Speech-to-Text pentru română - acuratețea este ~85-90%

### Problema: Apelul se închide brusc
**Soluție**: Verifică că TwiML returnează `<Gather>` corect și nu `<Hangup>` prematur
