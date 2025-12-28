# 🎤 Voice AI - Documentație Completă

## Status: ✅ FUNCȚIONAL

Data: 28 Decembrie 2025

---

## 📋 Ce am realizat

### 1. Voice AI Backend
- **Repository**: `SuperPartyByAI/superparty-ai-backend`
- **Branch**: `main`
- **Tehnologii**:
  - Node.js + Express
  - OpenAI GPT-4o (conversație AI)
  - Google Cloud Text-to-Speech (voce naturală)
  - Twilio (telefonie)

### 2. Deployment Railway
- **Service URL**: `https://web-production-f0714.up.railway.app`
- **Service ID**: `1931479e-da65-4d3a-8c5b-77c4b8fb3e31`
- **Project ID**: `a08232e9-9a0b-4bab-b7bd-7efaa7c83868`

### 3. Twilio Configuration
- **Număr telefon**: `+1 (218) 220-4425`
- **Webhook**: `https://web-production-f0714.up.railway.app/api/voice/incoming`
- **Status**: Auto-configurat prin API

---

## 🔧 Configurare Railway Variables

### Variables Complete (Copy-Paste în Raw Editor):

```
RAILWAY_TOKEN=998d4e46-c67c-47e2-9eaa-ae4cc806aab1
PORT=3001
NODE_ENV=production
SUPERPARTY_PROJECT_ID=6d417631-9c08-479c-aa97-d898dd0d5b03
VOICE_PROJECT_ID=1931479e-da65-4d3a-8c5b-77c4b8fb3e31
PROJECT_NAME_1=SuperParty Backend
BACKEND_URL_1=https://web-production-00dca9.up.railway.app
BACKEND_SERVICE_ID_1=6d417631-9c08-479c-aa97-d898dd0d5b03
COQUI_URL_1=https://web-production-00dca9.up.railway.app
COQUI_SERVICE_ID_1=6d417631-9c08-479c-aa97-d898dd0d5b03
PROJECT_NAME_2=Web Production
BACKEND_URL_2=https://web-production-f0714.up.railway.app
BACKEND_SERVICE_ID_2=1931479e-da65-4d3a-8c5b-77c4b8fb3e31
COQUI_URL_2=https://web-production-f0714.up.railway.app
COQUI_SERVICE_ID_2=1931479e-da65-4d3a-8c5b-77c4b8fb3e31
OPENAI_API_KEY=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
TWILIO_ACCOUNT_SID=AC17c88873d670aab4aa4a50fae230d2df
TWILIO_AUTH_TOKEN=5c6670d39a1dbf46d47ecdaa244b91d9
TWILIO_PHONE_NUMBER=+12182204425
BACKEND_URL=https://web-production-f0714.up.railway.app
COQUI_API_URL=https://web-production-00dca9.up.railway.app
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"superparty-frontend","private_key_id":"b90e20f74715474d2b116d05b436ff39252fd090","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCnDvexVmoCZOHV\nwewtcbreEHmTfewF1Ijdq2YbC9Mvnf3oTVifgfje3esOXCx2VP+6av/0Ib49v/LC\nNYOtNnkI5pmR1fOF/2W+KPizzAveFLtir0E+vEeTS0F+qamkb5QCAA6ouZEVwwFi\nv9AcqY8iKJR+G+ysZVPVgEYLFXuOQwuiT1EoQ55rj3F9XxOtYgR17zD/fy37oezk\nebuCGv4AeebZcVzUB8qo/n6ET06ZwH/lShWYL4ouFU9L4+IsEFOSNIdA1eTkVIm2\ncLkC06s91OF/mPZexhUdCzAsuGhAHYdPd/GnaklPYWmw3gr6eCQk+SBd8YN7pI9N\nDx8nZLBtAgMBAAECggEABdFPXmFaQTmWpL1DVoTMo2GS/kgnET/owUFwBZaYlOKt\nXirdYHaj/kzfm+kpUjidDDagMbYAHEHkOA+phX1tYxo2tF2tRJgTiLcADDDZo/L4\nYJQmU0M2weIfxoOtiPCqyJQMbqNBsm6PTItN+cWM2r1riGW8DPfdXsTAC7BElHxi\nQdWypGuS+c8N5dC2K35X+mBnr6koKI8o6PBlPbqsWOo+soquzK/CfFgpfpmtPHxb\n8HooTkKgB0hzm2sA3Bme8dLFMTSfBR2kmKN8J7sezgFvrh4VA+MH6BYu7jQ6Azpo\nQCScO6GN9oFCX12/5zPCKuQxL5HM0X+t8VplBDBSqQKBgQDjm+0W3oDCq8s1s97I\nJp5YgxRVM3QUzinyNXXzuNBBV39vEPueQzgjhReDDvptrNK9aa6LDuRifx3hePaz\niIfbQO174mqeXD7OX8dgDKRUd3CSrVcI5SJOg1NVhqtTCYAwN2G+bP0Fof+qC2fd\nQDwDE7VAv8O9Mcr+ikuR8f58KQKBgQC75YXfThVfAEn5Hd5oRmfAZRz5y45itXeX\nEMryM1u43UucO/PQMOYuA1QOwAutj7uZnYAHHD55t9SHReqZYo+PSmIML0zvr3dh\nSl6qWEZUbu2jpNPKM4ASo3eFzf55+aGTt2I8vFDDPGbWiwD8oWYt8z9SbC48Xra3\nF1u5j/6apQKBgGRdpp+WAAtXu+TzawKxXNPFAVtMtBxUiNSgVGHjlhmqHqx4Pawd\nEg0/rA2DtlRUiB00E96H85enXCLHt2mVg+rf55jgT4mDPcK9I2qsSG5iuMZFH4Lx\nnz4l1MJ6/uM/5kHcugJBhxVLyTRPkT5UC+KDd0KVDRhJc6zoiMhTgJd5AoGAFu7x\nwwqlwx2m6bgCkFmfijUNL1PwAg5CFXcgPiWUmWCxPNV4cb22KoGPfelkw39al2pI\n2RVSbsrILuaStrv357Zddz1Ct7KD8KUCHup9UwrjCGkyzGgyxpObIAK/f6W/Wec1\nH1KgzOOPbbozmaIddZhN70Jy9j1dMcWxFVoE6l0CgYBRCuQV2hUYQK7loLfRT2AR\nY+LRSOobiZlp3pmctQf0q7uBQuYVyzdiPkzAjyNFAqTt1epuP+OBSi5l80kJ4hge\n6BMf8Y5QcWG3OxdYtpCPcmFaaQe/JS7fdPJXahcg0Y0YQl18W37yPJ06l9EcUcWJ\naIlu1mQEe/xeRJGWlcAAsg==\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-fbsvc@superparty-frontend.iam.gserviceaccount.com","client_id":"118362575838205906896","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40superparty-frontend.iam.gserviceaccount.com","universe_domain":"googleapis.com"}
```

---

## 📁 Structura Cod

### Repository: `superparty-ai-backend`

```
superparty-ai-backend/
├── server.js                    # Express server principal
├── voice-ai-handler.js          # GPT-4o conversation logic
├── twilio-handler.js            # Twilio call handling
├── google-tts-handler.js        # Google Cloud TTS (voce naturală)
├── elevenlabs-handler.js        # ElevenLabs (backup, nu folosit)
├── coqui-handler.js             # Coqui XTTS (backup, nu folosit)
├── package.json                 # Dependencies
├── Procfile                     # Railway start command
└── railway.json                 # Railway configuration
```

### Fișiere Importante în `Aplicatie-SuperpartyByAi`:

```
railway-monitor/
├── configure-twilio.js          # Auto-configure Twilio webhooks
├── verify-and-fix.js            # Verify deployment status
├── railway-api-complete.js      # Railway API automation
└── update-twilio-webhook.js     # Update Twilio webhook URL

voice-backend/                   # Original voice backend code
VOICE-AI-COMPLETE-DOCUMENTATION.md  # Acest fișier
```

---

## 🎯 Cum Funcționează

### Flow Apel Telefonic:

1. **User sună** la `+1 (218) 220-4425`
2. **Twilio** primește apelul
3. **Webhook** trimite la: `https://web-production-f0714.up.railway.app/api/voice/incoming`
4. **Backend** răspunde cu salut: "Bună ziua! Numele meu este Kasya, de la SuperParty. Cu ce vă pot ajuta?"
5. **User vorbește** (4 secunde timeout pentru speech)
6. **GPT-4o** procesează conversația
7. **Google TTS** generează răspuns audio (voce naturală)
8. **Twilio** redă audio-ul către user
9. **Repeat** până la finalizare

### Voce:
- **Provider**: Google Cloud Text-to-Speech
- **Voice**: `ro-RO-Wavenet-A` (Female, natural)
- **Settings**: 
  - Speaking rate: 0.95 (mai lent)
  - Pitch: +2.0 (mai feminin)
  - Profile: telephony-class-application
- **Fallback**: Amazon Polly Carmen (dacă Google nu e disponibil)

---

## 🔧 Scripts Utile

### 1. Verificare Status
```bash
node railway-monitor/verify-and-fix.js
```

### 2. Configurare Twilio Webhook
```bash
node railway-monitor/configure-twilio.js
```

### 3. Test Backend
```bash
curl https://web-production-f0714.up.railway.app/
```

---

## 🐛 Troubleshooting

### Problema: Vocea e robotizată
**Cauză**: Google TTS nu e configurat sau credentials lipsesc
**Soluție**: Verifică că `GOOGLE_CREDENTIALS_JSON` e setat în Railway Variables

### Problema: "Nu am primit nicio informație"
**Cauză**: Timeout prea scurt sau Twilio nu primește speech
**Soluție**: 
- Verifică că `speechTimeout: 4` și `timeout: 6` în `twilio-handler.js`
- Vorbește mai tare/clar

### Problema: Apelul se închide instant
**Cauză**: Backend nu răspunde sau webhook greșit
**Soluție**:
- Verifică Railway logs
- Verifică că webhook-ul Twilio e corect setat
- Rulează: `node railway-monitor/configure-twilio.js`

### Problema: Backend-ul vechi încă rulează
**Cauză**: Railway nu a luat repo-ul nou
**Soluție**:
1. Railway → Settings → Source → Disconnect
2. Connect Repo → `SuperPartyByAI/superparty-ai-backend` (branch: main)
3. Verifică că în logs apare: `SuperParty Backend - WhatsApp + Voice`

---

## 📊 Monitoring

### v7.0 Monitor
- **URL**: `https://web-production-79489.up.railway.app`
- **Dashboard**: Multi-project monitoring
- **Features**:
  - Self-monitoring
  - Auto-repair
  - Health checks
  - Uptime tracking

### Railway Logs
```
[GoogleTTS] Initialized
[VoiceAI] Initialized with OpenAI
[Twilio] Incoming call: { callSid: '...', from: '...' }
[GoogleTTS] Generating speech...
[GoogleTTS] Speech generated and cached
```

---

## 💰 Costuri

### Google Cloud TTS
- **Free Tier**: 1 milion caractere/lună (WaveNet)
- **Cost după**: $16/1M caractere
- **Estimat**: ~$0-5/lună (usage normal)

### OpenAI GPT-4o
- **Cost**: $2.50/1M input tokens, $10/1M output tokens
- **Estimat**: ~$10-20/lună (100-200 apeluri/zi)

### Twilio
- **Cost**: $0.0085/minut (incoming calls)
- **Estimat**: Depinde de volum

### Railway
- **Plan**: Hobby ($5/lună) sau Pro ($20/lună)
- **Inclus**: Compute, bandwidth, storage

**Total estimat**: $15-50/lună

---

## 🚀 Next Steps

### Îmbunătățiri Posibile:

1. **Voce Clonată Kasya**
   - Upload sample audio în ElevenLabs
   - Clone voice
   - Replace Google TTS cu ElevenLabs

2. **Optimizare Conversație**
   - Fine-tune GPT-4o prompt
   - Add more context despre pachete
   - Improve error handling

3. **Analytics**
   - Track call duration
   - Conversion rate
   - Common questions

4. **Integrare CRM**
   - Save reservations în database
   - Send email confirmations
   - WhatsApp notifications

---

## 📞 Contact & Support

- **Repository**: https://github.com/SuperPartyByAI/superparty-ai-backend
- **Railway Project**: https://railway.app/project/a08232e9-9a0b-4bab-b7bd-7efaa7c83868
- **Twilio Console**: https://console.twilio.com/

---

## ✅ Checklist Deployment

- [x] Backend code pushed to GitHub
- [x] Railway service connected to correct repo
- [x] All environment variables set
- [x] Google Cloud credentials configured
- [x] Twilio webhook configured
- [x] Voice AI tested and working
- [ ] Voice quality optimized (în progres)
- [ ] Production testing complete

---

**Ultima actualizare**: 28 Decembrie 2025, 12:00 PM
**Status**: ✅ Funcțional, în curs de optimizare voce
