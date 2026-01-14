# 🚀 Creare Serviciu NOU pentru Voice AI

## De ce serviciu nou?

Serviciul `web-production-f0714.up.railway.app` rulează alt cod și nu pot schimba sursa prin API.

## Soluție: Serviciu nou (2 minute)

### Pasul 1: Creează serviciu nou

1. https://railway.app
2. Click "New Project"
3. Click "Deploy from GitHub repo"
4. Selectează: `SuperPartyByAI/superparty-ai-backend`
5. Branch: `main` (NU master!)

### Pasul 2: Adaugă variabilele

Click Variables → Raw Editor → Paste:

```
OPENAI_API_KEY=<OPENAI_API_KEY>
TWILIO_ACCOUNT_SID=<TWILIO_ACCOUNT_SID>
TWILIO_AUTH_TOKEN=<TWILIO_AUTH_TOKEN>
TWILIO_PHONE_NUMBER=+12182204425
COQUI_API_URL=https://web-production-00dca9.up.railway.app
NODE_ENV=production
PORT=5001
```

### Pasul 3: Generate Domain

1. Settings → Networking
2. Click "Generate Domain"
3. Copiază URL-ul (ex: `voice-ai-production-abc.up.railway.app`)

### Pasul 4: Update BACKEND_URL

1. Variables → Edit `BACKEND_URL`
2. Pune URL-ul de la Pasul 3

SAU adaugă variabila:

```
BACKEND_URL=https://URL-UL-TAU.up.railway.app
```

### Pasul 5: Update Twilio

1. https://console.twilio.com/
2. Phone Numbers → +1 (218) 220-4425
3. A call comes in: `https://URL-UL-TAU.up.railway.app/api/voice/incoming`

### Pasul 6: Test

Sună la: **+1 (218) 220-4425**

Ar trebui să auzi: "Bună ziua, SuperParty, cu ce vă ajut?" cu vocea Kasya!

---

## SAU: Folosește serviciul vechi (mai rapid)

Dacă vrei să folosești `web-production-f0714.up.railway.app`:

1. Railway → Serviciul respectiv
2. Settings → Source → Disconnect
3. Connect Repo → `SuperPartyByAI/superparty-ai-backend` (branch: main)
4. Variables → Adaugă cele de mai sus
5. Twilio → Webhook deja setat corect

---

**Ambele variante funcționează! Alege ce preferi.**
