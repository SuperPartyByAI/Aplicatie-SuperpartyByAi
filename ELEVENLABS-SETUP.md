# Setup ElevenLabs - Voce Naturală de Fată

## ✅ Ce am implementat:

- ✅ ElevenLabs handler
- ✅ Integrare în Voice AI
- ✅ Fallback la Google Wavenet (dacă ElevenLabs eșuează)
- ✅ Voce feminină: **Rachel** (ultra-naturală)
- ✅ Cleanup automat fișiere audio vechi

---

## 📋 Ce trebuie să faci TU:

### 1. Creează cont ElevenLabs

1. Mergi la: https://elevenlabs.io
2. Click "Sign Up"
3. Alege plan:
   - **Free:** 10,000 caractere/lună (~20-30 apeluri) - GRATUIT
   - **Starter:** 30,000 caractere/lună (~60-90 apeluri) - $5/lună

### 2. Obține API Key

1. După login, mergi la: https://elevenlabs.io/app/settings/api-keys
2. Click "Create API Key"
3. Copiază key-ul (începe cu `sk_...`)

### 3. (Opțional) Alege altă voce

Dacă nu îți place Rachel, poți alege altă voce:

1. Mergi la: https://elevenlabs.io/app/voice-library
2. Filtrează:
   - Language: **Romanian** (sau Multilingual)
   - Gender: **Female**
3. Ascultă preview-urile
4. Click pe vocea preferată
5. Copiază **Voice ID** (ex: `EXAVITQu4vr4xnSDxMaL`)

**Voci recomandate pentru română:**
- **Rachel** (EXAVITQu4vr4xnSDxMaL) - Caldă, prietenoasă ← ACUM ACTIV
- **Bella** (EXAVITQu4vr4xnSDxMaL) - Profesională, clară
- **Elli** (MF3mGyEYCl7XYWbV9V6O) - Tânără, energică

### 4. Adaugă în Railway

Railway Dashboard → Variables:

```
ELEVENLABS_API_KEY=sk_your_api_key_here
```

**Opțional** (dacă vrei altă voce decât Rachel):
```
ELEVENLABS_VOICE_ID=voice_id_here
```

### 5. Restart Railway

Railway va detecta noile variabile și va reporni automat.

---

## 🎧 Test

După restart, sună la: **+1 218 220 4425**

Ar trebui să auzi voce **ULTRA naturală** de fată!

---

## 📊 Cum funcționează:

### Flow:
1. Client sună → Twilio
2. GPT-4o generează răspuns text
3. **ElevenLabs** convertește text → audio natural
4. Audio se salvează temporar în `/temp`
5. Twilio redă audio-ul clientului
6. După 1 oră, fișierul se șterge automat

### Fallback:
Dacă ElevenLabs eșuează sau lipsește API key:
→ Folosește **Google Wavenet** (voce bună, dar mai robotizată)

---

## 💰 Costuri ElevenLabs

### Free Tier:
- 10,000 caractere/lună
- ~20-30 apeluri
- **Cost:** $0

### Starter ($5/lună):
- 30,000 caractere/lună
- ~60-90 apeluri
- **Cost:** $5/lună

### Estimare caractere per apel:
- Conversație scurtă (5 întrebări): ~300 caractere
- Conversație medie (7 întrebări): ~500 caractere
- Conversație lungă (10 întrebări): ~700 caractere

**Exemplu:** Cu Starter ($5/lună) → ~60 apeluri/lună

---

## 🐛 Troubleshooting

### Vocea e încă robotizată:
- Verifică că ai adăugat `ELEVENLABS_API_KEY` în Railway
- Verifică logs Railway: ar trebui să vezi `[ElevenLabs] Initialized`
- Dacă vezi `[ElevenLabs] API key missing` → key-ul lipsește

### Eroare "quota exceeded":
- Ai depășit limita lunară
- Upgrade la Starter ($5/lună) sau așteaptă luna viitoare

### Audio nu se redă:
- Verifică că `/audio` endpoint funcționează
- Test: `https://web-production-f0714.up.railway.app/audio/` (ar trebui să listeze fișiere)

---

## ✅ Checklist

- [ ] Cont ElevenLabs creat
- [ ] API Key copiat
- [ ] `ELEVENLABS_API_KEY` adăugat în Railway
- [ ] Railway restartat
- [ ] Test apel: voce naturală ✅

---

## 🎯 Rezultat final:

**Voce:** Ultra-naturală, feminină, caldă, prietenoasă
**Calitate:** 10/10 (vs 8/10 Google Wavenet, 4/10 Polly)
**Cost:** $0-5/lună (vs $0 Google Wavenet)
**Diferență:** ENORMĂ - sună ca om real!

**După setup, Voice AI va suna ca un operator REAL de call-center!** 🎉
