# 📞 Twilio Webhook Setup

## Configurare număr Twilio

1. Mergi la: https://console.twilio.com/
2. Login cu contul tău
3. Click pe **Phone Numbers** → **Manage** → **Active numbers**
4. Click pe numărul: **+1 (218) 220-4425**

## Configurare Voice Webhook

În secțiunea **Voice Configuration**:

### A Call Comes In (Webhook)
- **Configure with**: Webhooks, TwiML Bins, Functions, Studio, or Proxy
- **A call comes in**: 
  - URL: `https://web-production-f0714.up.railway.app/api/voice/incoming`
  - Method: **HTTP POST**

### Call Status Changes (Optional)
- **Status callback URL**: `https://web-production-f0714.up.railway.app/api/voice/status`
- Method: **HTTP POST**

## Salvează

Click **Save** jos de tot.

## Testează

Sună la **+1 (218) 220-4425**

Ar trebui să auzi imediat:
> "Bună ziua, SuperParty, cu ce vă ajut?"

Cu vocea Kasya (clonată cu Coqui).

## ✅ Verificare

După ce suni, verifică în Railway logs:
- Ar trebui să vezi: `[Twilio] Incoming call: { callSid: '...', from: '...' }`
- Ar trebui să vezi: `[VoiceAI] Initialized with OpenAI`
- Ar trebui să vezi: `[Coqui] Service is now AVAILABLE`

## ❌ Troubleshooting

### Dacă nu răspunde deloc:
- Verifică că webhook-ul e setat corect în Twilio
- Verifică că URL-ul e: `https://web-production-f0714.up.railway.app/api/voice/incoming`

### Dacă răspunde dar nu e vocea Kasya:
- Verifică că `COQUI_API_URL` e setat în Railway Variables
- Verifică că serviciul Coqui rulează pe: `https://web-production-00dca9.up.railway.app`

### Dacă se închide imediat:
- Verifică Railway logs pentru erori
- Verifică că toate variabilele sunt setate corect
