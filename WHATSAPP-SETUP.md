# WhatsApp Setup - Ghid Complet

## 🎯 Obiectiv
Activează notificări WhatsApp pentru confirmări rezervări Voice AI.

---

## 📋 Pași de Urmat

### 1. Găsește Sandbox Code în Twilio

1. **Accesează Twilio Console:**
   - URL: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
   - Login cu contul tău Twilio

2. **Găsește codul:**
   - Vei vedea o secțiune "Sandbox Participants"
   - Codul arată așa: **"join happy-elephant"** sau **"join blue-tiger"**
   - Notează acest cod!

### 2. Înregistrează-te pe WhatsApp

1. **Deschide WhatsApp** pe telefonul tău

2. **Creează conversație nouă** cu numărul:
   ```
   +1 415 523 8886
   ```

3. **Trimite mesajul:**
   ```
   join <codul-tău>
   ```
   Exemplu: `join happy-elephant`

4. **Așteaptă confirmarea:**
   Vei primi mesaj:
   ```
   ✅ Twilio Sandbox: You are all set! 
   Reply stop to leave the sandbox at any time.
   ```

### 3. Adaugă Variabila în Railway

1. **Accesează Railway Dashboard:**
   - URL: https://railway.app/project/f0714
   - Click pe serviciul "web"

2. **Deschide Variables:**
   - Click pe tab-ul "Variables"

3. **Adaugă variabila:**
   - Click "New Variable"
   - **Variable Name:** `TWILIO_WHATSAPP_NUMBER`
   - **Value:** `whatsapp:+14155238886`
   - Click "Add"

4. **Așteaptă redeploy:**
   - Railway va reporni automat (~30 secunde)
   - Verifică în tab "Deployments" că e "Success"

### 4. Testează WhatsApp

**Opțiunea 1: Script automat**
```bash
cd /workspaces/Aplicatie-SuperpartyByAi
./test-whatsapp.sh
```

**Opțiunea 2: Manual**
```bash
curl -X POST https://web-production-f0714.up.railway.app/api/whatsapp/test \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+40792864811"}'
```

**Răspuns așteptat:**
```json
{
  "success": true,
  "messageSid": "SM..."
}
```

**Verifică telefonul** - ar trebui să primești:
```
🎉 Test message from SuperParty Voice AI!

This confirms WhatsApp notifications are working.
```

---

## ✅ Verificare Finală

După configurare, verifică că totul funcționează:

```bash
# 1. Backend status
curl https://web-production-f0714.up.railway.app/ | jq '.whatsappEnabled'
# Ar trebui să returneze: true

# 2. Test message
./test-whatsapp.sh
# Ar trebui să primești mesaj pe WhatsApp
```

---

## 🎯 Test Complet: Voice AI + WhatsApp

1. **Sună la:** +1 218 220 4425
2. **Apasă 1** pentru Voice AI
3. **Răspunde la întrebări:**
   - Data: "15 ianuarie"
   - Invitați: "20 de copii"
   - Tip: "aniversare"
   - Preferințe: "baloane"
   - Nume: "Maria"

4. **Verifică WhatsApp** - ar trebui să primești:
   ```
   🎉 Confirmare Rezervare SuperParty

   📋 Cod Rezervare: RES-...

   📅 Detalii Eveniment:
   • Data: 15 ianuarie
   • Invitați: 20 de copii
   • Tip: aniversare
   • Preferințe: baloane
   • Client: Maria

   ✅ Status: Rezervare înregistrată

   📞 Vă vom contacta în curând pentru confirmare...
   ```

---

## 🐛 Troubleshooting

### Problema: Nu primesc mesaj de confirmare în Sandbox
**Cauză:** Nu ai trimis "join <code>" corect
**Soluție:**
1. Verifică că ai trimis exact "join <code>" (cu spațiu)
2. Verifică că ai trimis la +1 415 523 8886
3. Așteaptă mesajul de confirmare de la Twilio

### Problema: "Not a valid phone number"
**Cauză:** Numărul nu e în format E.164
**Soluție:** Folosește format: +40792864811 (cu +40, fără spații)

### Problema: "Unable to create record"
**Cauză:** Nu ești înregistrat în Sandbox
**Soluție:** Trimite din nou "join <code>" la +1 415 523 8886

### Problema: Backend returnează whatsappEnabled: false
**Cauză:** Variabila TWILIO_WHATSAPP_NUMBER nu e setată în Railway
**Soluție:** Adaugă variabila și așteaptă redeploy

---

## 💰 Costuri

### Twilio Sandbox (Testare)
- **Cost:** $0.00 (GRATUIT)
- **Limitări:**
  - Doar participanți înregistrați pot primi mesaje
  - Mesaje expiră după 24h de inactivitate
  - Trebuie să re-join periodic

### WhatsApp Business API (Producție)
- **Cost:** ~$0.005 per mesaj
- **Avantaje:**
  - Orice număr poate primi mesaje
  - Template-uri personalizate
  - Branding propriu
  - Fără expirare

**Pentru producție:**
1. Twilio Console → Messaging → WhatsApp → Request Access
2. Completează formular business
3. Așteaptă aprobare (1-2 săptămâni)
4. Configurează template-uri
5. Actualizează TWILIO_WHATSAPP_NUMBER cu numărul tău

---

## 📞 Suport

Dacă întâmpini probleme:
- **Twilio Support:** https://support.twilio.com
- **Twilio Docs:** https://www.twilio.com/docs/whatsapp
- **Verifică logs:** Railway Dashboard → Logs

---

## ✅ Checklist

- [ ] Am găsit Sandbox Code în Twilio Console
- [ ] Am trimis "join <code>" la +1 415 523 8886
- [ ] Am primit confirmare de la Twilio
- [ ] Am adăugat TWILIO_WHATSAPP_NUMBER în Railway
- [ ] Backend returnează whatsappEnabled: true
- [ ] Test message funcționează (./test-whatsapp.sh)
- [ ] Voice AI trimite confirmare după rezervare

**Când toate sunt bifate, WhatsApp este FUNCȚIONAL!** ✅
