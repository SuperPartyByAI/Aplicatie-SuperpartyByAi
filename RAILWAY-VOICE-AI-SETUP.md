# Railway Voice AI Setup - Instrucțiuni Complete

## Variabile de Environment Necesare

Accesează [Railway Dashboard](https://railway.app/project/f0714) → serviciul "web" → tab "Variables"

### 1. Twilio Voice (Deja Configurate)
```
TWILIO_ACCOUNT_SID=AC8e0f5e8e0f5e8e0f5e8e0f5e8e0f5e8e
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+12182204425
TWILIO_API_KEY=SKxxxxx
TWILIO_API_SECRET=xxxxx
TWILIO_TWIML_APP_SID=APxxxxx
```

### 2. OpenAI (LIPSEȘTE - TREBUIE ADĂUGAT)
```
OPENAI_API_KEY=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
```

### 3. Backend URL (Deja Configurat)
```
BACKEND_URL=https://web-production-f0714.up.railway.app
```

### 4. Twilio WhatsApp (OPȚIONAL - pentru notificări)
```
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

## Pași pentru Adăugare OPENAI_API_KEY

1. **Accesează Railway Dashboard**
   - URL: https://railway.app/project/f0714
   - Login cu contul tău

2. **Selectează Serviciul**
   - Click pe serviciul "web" (backend)

3. **Deschide Variables**
   - Click pe tab-ul "Variables" din meniul de sus

4. **Adaugă Variabila**
   - Click pe butonul "New Variable"
   - **Variable Name**: `OPENAI_API_KEY`
   - **Value**: `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`
   - Click "Add"

5. **Așteaptă Redeploy**
   - Railway va reporni automat serviciul
   - Durează ~30-60 secunde
   - Verifică în tab "Deployments" că noul deployment e "Success"

6. **Verificare**
   ```bash
   curl https://web-production-f0714.up.railway.app/
   ```
   Ar trebui să primești:
   ```json
   {
     "status": "online",
     "service": "SuperParty Backend - WhatsApp + Voice",
     "activeCalls": 0
   }
   ```

## Configurare WhatsApp (Opțional)

### Opțiunea 1: Twilio Sandbox (Gratuit - pentru testare)

1. **Accesează Twilio Console**
   - URL: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
   - Login cu contul Twilio

2. **Găsește Sandbox Code**
   - Vei vedea un cod de tipul: "join <word>-<word>"
   - Exemplu: "join happy-elephant"

3. **Înregistrează-te în Sandbox**
   - Deschide WhatsApp pe telefon
   - Trimite mesaj la: **+1 415 523 8886**
   - Mesaj: "join <sandbox-code>" (înlocuiește cu codul tău)
   - Vei primi confirmare: "You are all set!"

4. **Adaugă Variabila în Railway**
   ```
   TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
   ```

5. **Test**
   ```bash
   curl -X POST https://web-production-f0714.up.railway.app/api/whatsapp/test \
     -H "Content-Type: application/json" \
     -d '{"phoneNumber": "+40792864811"}'
   ```
   Ar trebui să primești mesaj de test pe WhatsApp.

### Opțiunea 2: WhatsApp Business API (Pentru Producție)

Pentru producție, vei avea nevoie de:
1. Cont WhatsApp Business verificat
2. Număr de telefon dedicat
3. Aprobare de la Meta/Facebook
4. Cost: ~$0.005 per mesaj

**Pași:**
1. Twilio Console → Messaging → WhatsApp → Request Access
2. Completează formular cu detalii business
3. Așteaptă aprobare (1-2 săptămâni)
4. Configurează template-uri de mesaje
5. Actualizează `TWILIO_WHATSAPP_NUMBER` cu numărul tău

## Verificare Finală

### 1. Backend Health Check
```bash
curl https://web-production-f0714.up.railway.app/
```
✅ Status: "online"

### 2. Test Apel Telefonic
- Sună la: **+1 218 220 4425**
- Apasă **1** pentru Voice AI
- Răspunde la întrebări
- Verifică că rezervarea e salvată

### 3. Verificare Logs
În Railway Dashboard → tab "Logs", caută:
```
[Voice AI] Processing: { callSid: '...', speech: '...' }
[Voice AI] Reservation saved: RES-...
[WhatsAppNotifier] Sent confirmation: SM...
```

### 4. Verificare Firestore
- Accesează Firebase Console
- Firestore Database → Collection "reservations"
- Ar trebui să vezi rezervarea nouă

## Troubleshooting

### Backend 502 Error
**Cauză**: OPENAI_API_KEY lipsește sau invalid
**Soluție**: Verifică că ai adăugat cheia corectă în Railway Variables

### Voice AI nu răspunde
**Cauză**: OpenAI API key invalid sau rate limit
**Soluție**: 
1. Verifică key-ul în OpenAI Dashboard
2. Verifică billing și usage limits
3. Verifică logs în Railway pentru erori

### WhatsApp nu trimite
**Cauză**: Nu ești înregistrat în Sandbox sau key lipsește
**Soluție**:
1. Trimite "join <code>" la +1 415 523 8886
2. Verifică că `TWILIO_WHATSAPP_NUMBER` e setat
3. Verifică logs pentru erori Twilio

### Speech Recognition greșit
**Cauză**: Twilio folosește Google Speech-to-Text
**Soluție**: 
- Vorbește clar și încet
- Evită zgomot de fundal
- Acuratețea pentru română: ~85-90%

## Costuri Estimate

### Per Apel cu Voice AI:
- Twilio Voice: $0.01/min × 3 min = **$0.03**
- Twilio Speech-to-Text: $0.02/min × 3 min = **$0.06**
- OpenAI GPT-4o: $0.05/apel (5-10 mesaje) = **$0.05**
- **Total: ~$0.14 per apel**

### Per Apel cu Operator:
- Twilio Voice: $0.01/min × 5 min = **$0.05**
- Twilio Recording: $0.0025/min × 5 min = **$0.01**
- **Total: ~$0.06 per apel**

### WhatsApp (Sandbox - Gratuit):
- Twilio Sandbox: **$0.00**

### WhatsApp (Business API):
- Per mesaj: **$0.005**

## Suport

Dacă întâmpini probleme:
1. Verifică logs în Railway Dashboard
2. Verifică Twilio Console → Monitor → Logs
3. Verifică OpenAI Dashboard → Usage
4. Contactează suport Twilio sau OpenAI dacă e necesar
