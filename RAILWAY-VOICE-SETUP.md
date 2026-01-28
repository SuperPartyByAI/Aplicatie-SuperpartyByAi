# 🎤 legacy hosting Voice AI Setup - URGENT

## Pasul 1: Găsește serviciul backend

1. Mergi la: https://legacy hosting.app
2. Login
3. Găsește serviciul care rulează pe: `https://whats-app-ompro.ro`

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
OPENAI_API_KEY=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

TWILIO_ACCOUNT_SID=AC17c88873d670aab4aa4a50fae230d2df

TWILIO_AUTH_TOKEN=5c6670d39a1dbf46d47ecdaa244b91d9

TWILIO_PHONE_NUMBER=+12182204425

BACKEND_URL=https://whats-app-ompro.ro

COQUI_API_URL=https://whats-app-ompro.ro

NODE_ENV=production

PORT=5001
```

## Pasul 4: Așteaptă Deploy

legacy hosting va redeploya automat în ~2-3 minute.

## Pasul 5: Testează

Sună la: **+1 (218) 220-4425**

Ar trebui să auzi:

- "Bună ziua, SuperParty, cu ce vă ajut?" (cu vocea Kasya)
- AI-ul te va întreba despre rezervare

## ✅ Verificare

După deploy, verifică logs-urile în legacy hosting:

- Ar trebui să vezi: `🚀 SuperParty Backend - WhatsApp + Voice`
- Ar trebui să vezi: `Server running on port 5001`
- Ar trebui să vezi: `Voice: Kasya (Coqui XTTS)`

## ❌ Dacă nu merge

Verifică în legacy hosting logs dacă apar erori și spune-mi ce vezi.
