# 📞 Configurare Număr Twilio - Ghid Complet

## ✅ Status Serviciu

**Railway Backend:**
- URL: `https://web-production-f0714.up.railway.app`
- Status: ✅ ONLINE
- Voice AI: ✅ ENABLED
- Voice Engine: ElevenLabs (PREMIUM)
- Active Calls: 0

---

## 🔧 Configurație Twilio (Copy-Paste)

### 1. Voice Configuration

#### **A call comes in:**
```
Webhook
URL: https://web-production-f0714.up.railway.app/api/voice/incoming
HTTP Method: HTTP POST
```

#### **Primary handler fails:**
```
Webhook
URL: https://web-production-f0714.up.railway.app/api/voice/incoming
HTTP Method: HTTP POST
```

#### **Call status changes:**
```
Webhook
URL: https://web-production-f0714.up.railway.app/api/voice/status
HTTP Method: HTTP POST
```

#### **Caller Name Lookup:**
```
Status: Disabled
```

---

## 📋 Pași de Configurare (2 minute)

### Pasul 1: Accesează Twilio Console
1. Mergi la: https://console.twilio.com/
2. Click pe **Phone Numbers** → **Manage** → **Active numbers**
3. Selectează numărul tău: **+40373805828** (număr românesc) sau alt număr

### Pasul 2: Configurează Voice
1. Scroll la secțiunea **Voice Configuration**
2. La **A call comes in:**
   - Selectează: **Webhook**
   - URL: `https://web-production-f0714.up.railway.app/api/voice/incoming`
   - HTTP: **HTTP POST**

3. La **Primary handler fails:**
   - Selectează: **Webhook**
   - URL: `https://web-production-f0714.up.railway.app/api/voice/incoming`
   - HTTP: **HTTP POST**

4. La **Call status changes:**
   - URL: `https://web-production-f0714.up.railway.app/api/voice/status`
   - HTTP: **HTTP POST**

5. **Caller Name Lookup:** Lasă **Disabled**

### Pasul 3: Salvează
1. Click **Save** la finalul paginii
2. Așteaptă confirmarea (2-3 secunde)

---

## 🧪 Testare

### Test 1: Verifică Backend
```bash
curl https://web-production-f0714.up.railway.app/health
```

**Răspuns așteptat:**
```json
{
  "status": "healthy",
  "service": "SuperParty Voice AI",
  "timestamp": "2025-12-28T..."
}
```

### Test 2: Sună la Numărul Twilio
1. Sună la numărul tău Twilio
2. Ar trebui să auzi: **"Bună ziua, SuperParty, cu ce vă ajut?"**
3. Vocea: **ElevenLabs (PREMIUM)** - voce naturală, profesională

### Test 3: Verifică Logs Railway
1. Mergi la: https://railway.app
2. Selectează serviciul: `web-production-f0714`
3. Click **Deployments** → **View Logs**
4. Ar trebui să vezi:
```
[Twilio] Incoming call: { callSid: '...', from: '...' }
[VoiceAI] Initialized with OpenAI
[ElevenLabs] Generating speech...
```

---

## 🎯 Ce Face Sistemul

### Flow Apel:

1. **Apel Intră** → Twilio trimite webhook la `/api/voice/incoming`
2. **Backend Răspunde** → TwiML cu mesaj de bun venit
3. **User Vorbește** → Twilio transcrie cu Speech-to-Text
4. **AI Procesează** → OpenAI GPT-4o generează răspuns
5. **Voice Synthesis** → ElevenLabs generează audio natural
6. **Răspuns** → Twilio redă audio către user
7. **Loop** → Conversație continuă până user închide

### Capabilități AI:

- ✅ Răspunde la întrebări despre SuperParty
- ✅ Oferă informații despre evenimente
- ✅ Preia rezervări (nume, telefon, email)
- ✅ Transferă la operator uman (dacă e configurat)
- ✅ Conversație naturală, contextuală

---

## 🔐 Variabile Railway (Verificare)

Verifică că toate variabilele sunt setate în Railway:

```bash
OPENAI_API_KEY=sk-...           # OpenAI pentru AI
TWILIO_ACCOUNT_SID=AC...        # Twilio credentials
TWILIO_AUTH_TOKEN=...           # Twilio credentials
ELEVENLABS_API_KEY=...          # ElevenLabs pentru voce
ELEVENLABS_VOICE_ID=...         # ID voce Kasya
```

**Verificare:**
```bash
curl https://web-production-f0714.up.railway.app/
```

Ar trebui să vezi:
```json
{
  "voiceAI": "enabled",
  "voice": "ElevenLabs (PREMIUM)"
}
```

---

## ❌ Troubleshooting

### Problema: "Webhook Error" în Twilio
**Cauză:** Backend-ul nu răspunde  
**Soluție:**
1. Verifică că Railway service e activ
2. Verifică logs pentru erori
3. Test: `curl https://web-production-f0714.up.railway.app/health`

### Problema: Apelul se închide imediat
**Cauză:** Eroare în TwiML response  
**Soluție:**
1. Verifică Railway logs
2. Caută erori de tip: `[Twilio] Error generating TwiML`
3. Verifică că toate variabilele sunt setate

### Problema: Nu se aude vocea
**Cauză:** ElevenLabs API key invalid sau limită depășită  
**Soluție:**
1. Verifică `ELEVENLABS_API_KEY` în Railway
2. Verifică quota ElevenLabs: https://elevenlabs.io/
3. Fallback: Sistemul va folosi voce Google TTS

### Problema: AI nu răspunde corect
**Cauză:** OpenAI API key invalid sau limită depășită  
**Soluție:**
1. Verifică `OPENAI_API_KEY` în Railway
2. Verifică quota OpenAI: https://platform.openai.com/usage
3. Verifică logs pentru erori GPT-4o

---

## 💰 Costuri Estimate

### Per Apel (medie 2 minute):

| Serviciu | Cost | Detalii |
|----------|------|---------|
| Twilio Voice | $0.026 | $0.013/min × 2 min |
| OpenAI GPT-4o | $0.015 | ~1000 tokens input + output |
| ElevenLabs | $0.006 | ~200 caractere × $0.00003/char |
| **TOTAL** | **$0.047** | **~$0.05 per apel** |

### Per Lună (100 apeluri):

| Serviciu | Cost |
|----------|------|
| Twilio | $2.60 |
| OpenAI | $1.50 |
| ElevenLabs | $0.60 |
| **TOTAL** | **$4.70** |

### Optimizare Costuri:

**Pentru 1000+ apeluri/lună:**
- Consideră Coqui XTTS (self-hosted, gratis) în loc de ElevenLabs
- Cost: $2.60 (Twilio) + $1.50 (OpenAI) = **$4.10/lună**
- Economie: **87% față de ElevenLabs**

---

## 🚀 Next Steps

### Opțional - Îmbunătățiri:

1. **Coqui XTTS (Voce Gratis):**
   - Deploy Coqui service pe Railway
   - Schimbă `VOICE_ENGINE=coqui` în Railway
   - Economie: $0.60/100 apeluri

2. **Transfer la Operator:**
   - Configurează `TRANSFER_NUMBER` în Railway
   - AI va transfera apeluri complexe

3. **Webhook Notificări:**
   - Configurează webhook pentru notificări
   - Primești alert când cineva sună

4. **Analytics:**
   - Integrează cu Google Analytics
   - Track: durata apeluri, subiecte, conversii

---

## 📞 Contact Support

**Dacă ai probleme:**
1. Verifică Railway logs
2. Verifică Twilio logs: https://console.twilio.com/monitor/logs/calls
3. Test manual: `curl https://web-production-f0714.up.railway.app/health`

**Logs Railway:**
```bash
# În Railway dashboard
Deployments → View Logs → Filter: "error" sau "Twilio"
```

**Logs Twilio:**
```bash
# În Twilio Console
Monitor → Logs → Calls → Selectează apelul
```

---

## ✅ Checklist Final

- [ ] Backend Railway activ (verificat cu curl)
- [ ] Toate variabilele setate în Railway
- [ ] Webhook-uri configurate în Twilio
- [ ] Test apel efectuat
- [ ] Voce funcționează (ElevenLabs)
- [ ] AI răspunde corect
- [ ] Logs verificate (fără erori)

---

**Status:** ✅ READY FOR PRODUCTION  
**Backend:** https://web-production-f0714.up.railway.app  
**Voice Engine:** ElevenLabs (PREMIUM)  
**AI Engine:** OpenAI GPT-4o  
**Cost:** ~$0.05 per apel  

🎉 **Sistemul este gata de utilizare!**
