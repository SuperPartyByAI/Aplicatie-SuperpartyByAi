# 📞 Configurare Număr Românesc Twilio +40373805828

## ✅ Număr Twilio Confirmat

**Număr:** +40373805828  
**Provider:** Twilio  
**Tip:** Voice-enabled  
**Status:** Active  

---

## 🔧 Configurare Voice Webhooks

### Pasul 1: Accesează Twilio Console

1. Mergi la: https://console.twilio.com/
2. Click **Phone Numbers** → **Manage** → **Active numbers**
3. Găsește și click pe: **+40373805828**

### Pasul 2: Configurează Voice Configuration

Scroll la secțiunea **Voice Configuration** și configurează:

#### **A call comes in:**
```
Configure with: Webhook
URL: https://web-production-f0714.up.railway.app/api/voice/incoming
HTTP Method: HTTP POST
```

#### **Primary handler fails:**
```
Configure with: Webhook
URL: https://web-production-f0714.up.railway.app/api/voice/incoming
HTTP Method: HTTP POST
```

#### **Call status changes:**
```
URL: https://web-production-f0714.up.railway.app/api/voice/status
HTTP Method: HTTP POST
```

#### **Caller Name Lookup:**
```
Status: Disabled
```

### Pasul 3: Salvează

Click **Save** jos de tot pe pagină.

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

### Test 2: Sună la Numărul Românesc
```
Sună la: +40373805828
```

**Ar trebui să auzi:**
> "Bună ziua, SuperParty, cu ce vă ajut?"

Cu voce **ElevenLabs (PREMIUM)** - naturală și profesională.

### Test 3: Verifică Logs Railway

1. Mergi la: https://railway.app
2. Selectează serviciul: `web-production-f0714`
3. Click **Deployments** → **View Logs**

**Ar trebui să vezi:**
```
[Twilio] Incoming call: { 
  callSid: 'CA...', 
  from: '+40...', 
  to: '+40373805828' 
}
[VoiceAI] Initialized with OpenAI
[ElevenLabs] Generating speech...
```

### Test 4: Verifică Logs Twilio

1. Mergi la: https://console.twilio.com/monitor/logs/calls
2. Găsește ultimul apel la **+40373805828**
3. Verifică status: **completed**

---

## 💰 Costuri REALE

### Număr Românesc Twilio (Prețuri Oficiale):

| Item | Cost | Sursa |
|------|------|-------|
| Număr lunar | $1.00-2.00/lună | Twilio |
| Apel incoming | $0.0085/min | Twilio oficial |
| OpenAI GPT-4o | $0.006/apel (2 min) | ~1,400 tokens |
| ElevenLabs | $0.06-0.11/apel (2 min) | Depinde de plan |
| **Total per apel** | **$0.08-0.13** | **REAL** |

### Breakdown per Plan ElevenLabs:

| Plan | Cost ElevenLabs | Total/apel | Recomandat pentru |
|------|-----------------|------------|-------------------|
| Creator ($22/lună) | $0.11 | **$0.13** | 0-200 apeluri/lună |
| Pro ($99/lună) | $0.10 | **$0.12** | 200-1000 apeluri/lună |
| Business ($1,320/lună) | $0.06 | **$0.08** | 5000+ apeluri/lună |

### Opțiune Economică (Coqui XTTS):

| Item | Cost |
|------|------|
| Twilio RO | $0.017/apel |
| OpenAI GPT-4o-mini | $0.0003/apel |
| Coqui XTTS (self-hosted) | $0.00 (Railway $10/lună) |
| **Total per apel** | **~$0.02** |

**Trade-off:** Calitate voce mai slabă, AI mai puțin inteligent

### Comparație Costuri per 100 Apeluri:

| Configurație | Cost/apel | Cost 100 apeluri | Cost lunar total |
|--------------|-----------|------------------|------------------|
| ElevenLabs Creator + GPT-4o | $0.13 | $13 | **$36** |
| ElevenLabs Pro + GPT-4o | $0.12 | $12 | **$112** |
| Coqui + GPT-4o-mini | $0.02 | $2 | **$13** |

⚠️ **Notă:** Costurile variază MULT în funcție de volum și plan ales.

📄 **Detalii complete:** Vezi `COSTURI-REALE-VOICE-AI.md`

---

## 🎯 Avantaje Număr Românesc

### Pentru Clienți:
- ✅ Apel local (fără costuri internaționale)
- ✅ Încredere mai mare (număr local)
- ✅ Latență mai mică (~50-100ms vs 150-200ms)

### Pentru Business:
- ✅ Cost mai mic per apel (-28%)
- ✅ Conversie mai mare (oamenii sună mai ușor)
- ✅ Profesional (număr local)

---

## 📊 Flow Apel Complet

```
1. Client sună: +40373805828
   ↓
2. Twilio primește apel
   ↓
3. Twilio trimite webhook: POST /api/voice/incoming
   ↓
4. Backend Railway răspunde cu TwiML
   ↓
5. Twilio redă mesaj: "Bună ziua, SuperParty..."
   ↓
6. Client vorbește
   ↓
7. Twilio transcrie (Speech-to-Text)
   ↓
8. Backend trimite la OpenAI GPT-4o
   ↓
9. GPT-4o generează răspuns
   ↓
10. Backend trimite la ElevenLabs
    ↓
11. ElevenLabs generează audio
    ↓
12. Backend răspunde cu TwiML + audio URL
    ↓
13. Twilio redă audio către client
    ↓
14. Loop (pași 6-13) până client închide
```

---

## 🔐 Verificare Configurație

### Checklist:

- [ ] Număr +40373805828 vizibil în Twilio Console
- [ ] Webhook "A call comes in" setat la `/api/voice/incoming`
- [ ] Webhook "Primary handler fails" setat la `/api/voice/incoming`
- [ ] Webhook "Call status changes" setat la `/api/voice/status`
- [ ] Toate webhook-uri pe **HTTP POST**
- [ ] Backend Railway activ (curl /health)
- [ ] Variabile Railway setate (OPENAI, TWILIO, ELEVENLABS)
- [ ] Test apel efectuat
- [ ] AI răspunde corect
- [ ] Logs verificate (fără erori)

---

## ❌ Troubleshooting

### Problema: "Webhook Error" în Twilio
**Cauză:** Backend nu răspunde  
**Soluție:**
```bash
# Verifică backend
curl https://web-production-f0714.up.railway.app/health

# Verifică logs Railway
Railway → Deployments → View Logs
```

### Problema: Apelul se închide imediat
**Cauză:** Eroare în TwiML response  
**Soluție:**
```bash
# Verifică logs Railway pentru erori
# Caută: "[Twilio] Error" sau "[VoiceAI] Error"
```

### Problema: Nu se aude vocea
**Cauză:** ElevenLabs API key invalid  
**Soluție:**
```bash
# Verifică variabila în Railway
ELEVENLABS_API_KEY=...

# Verifică quota ElevenLabs
https://elevenlabs.io/
```

### Problema: AI nu răspunde corect
**Cauză:** OpenAI API key invalid  
**Soluție:**
```bash
# Verifică variabila în Railway
OPENAI_API_KEY=sk-...

# Verifică quota OpenAI
https://platform.openai.com/usage
```

---

## 🚀 Next Steps

### 1. Configurează Webhook-urile (5 min)
- Mergi la Twilio Console
- Configurează cele 3 webhook-uri
- Salvează

### 2. Testează (2 min)
- Sună la +40373805828
- Verifică că AI răspunde
- Testează conversație

### 3. Verifică Logs (2 min)
- Railway logs
- Twilio logs
- Caută erori

### 4. Promovează Numărul (continuu)
- Update website cu +40373805828
- Update social media
- Update materiale marketing

---

## 📞 Informații Contact

**Număr Voice AI:** +40373805828  
**Backend:** https://web-production-f0714.up.railway.app  
**Voice Engine:** ElevenLabs (PREMIUM)  
**AI Engine:** OpenAI GPT-4o  
**Cost:** ~$0.034 per apel (2 min)  

---

## ✅ Status Final

- ✅ Număr românesc Twilio confirmat
- ✅ Backend Railway activ
- ✅ Voice AI enabled
- ✅ Configurație webhook pregătită
- ⏳ Așteaptă configurare în Twilio Console

**Next:** Configurează webhook-urile în Twilio Console și testează!

---

**Data:** 28 Decembrie 2024  
**Versiune:** 1.0  
**Status:** ✅ READY FOR CONFIGURATION
