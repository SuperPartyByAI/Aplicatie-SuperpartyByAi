# 🎤 Railway Voice AI Setup - URGENT

## Pasul 1: Găsește serviciul backend

1. Mergi la: https://railway.app
2. Login
3. Găsește serviciul care rulează pe: `https://web-production-f0714.up.railway.app`

## Pasul 2: Schimbă Root Directory

1. Click pe serviciu
2. Click pe tab **Settings**
3. Scroll la **Source**
4. La **Root Directory** schimbă din `.` în: `voice-backend`
5. Click **Save**

## Pasul 3: Adaugă Variables

1. Click pe tab **Variables**
2. Click **New Variable** pentru fiecare:

```
OPENAI_API_KEY=<OPENAI_API_KEY>

TWILIO_ACCOUNT_SID=<TWILIO_ACCOUNT_SID>

TWILIO_AUTH_TOKEN=<TWILIO_AUTH_TOKEN>

TWILIO_PHONE_NUMBER=+12182204425

BACKEND_URL=https://web-production-f0714.up.railway.app

COQUI_API_URL=https://web-production-00dca9.up.railway.app

NODE_ENV=production

PORT=5001
```

## Pasul 4: Așteaptă Deploy

Railway va redeploya automat în ~2-3 minute.

## Pasul 5: Testează

Sună la: **+1 (218) 220-4425**

Ar trebui să auzi:

- "Bună ziua, SuperParty, cu ce vă ajut?" (cu vocea Kasya)
- AI-ul te va întreba despre rezervare

## ✅ Verificare

După deploy, verifică logs-urile în Railway:

- Ar trebui să vezi: `🚀 SuperParty Backend - WhatsApp + Voice`
- Ar trebui să vezi: `Server running on port 5001`
- Ar trebui să vezi: `Voice: Kasya (Coqui XTTS)`

## ❌ Dacă nu merge

Verifică în Railway logs dacă apar erori și spune-mi ce vezi.
