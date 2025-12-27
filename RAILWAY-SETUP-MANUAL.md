# 🚂 Railway - Setare Environment Variables (Manual)

## Pași Simpli (2 minute):

### 1. Du-te la Railway Dashboard

Link: [https://railway.app/dashboard](https://railway.app/dashboard)

---

### 2. Găsește Proiectul

Caută proiectul care conține backend-ul (probabil se numește ceva cu "aplicatie-superpartybyai" sau "backend")

Click pe proiect.

---

### 3. Selectează Service-ul Backend

În proiect, vei vedea unul sau mai multe "services" (containere).

Click pe service-ul care rulează backend-ul Node.js (probabil se numește "backend" sau "aplicatie-superpartybyai-production").

---

### 4. Deschide Tab-ul Variables

În service, click pe tab-ul **"Variables"** (sus, lângă "Settings", "Deployments", etc.)

---

### 5. Adaugă Cele 3 Variabile

Click pe butonul **"+ New Variable"** (albastru, sus-dreapta)

**Adaugă prima variabilă:**
```
Name: TWILIO_ACCOUNT_SID
Value: AC17c88873d670aab4aa4a50fae230d2df
```
Click **"Add"**

**Adaugă a doua variabilă:**
```
Name: TWILIO_AUTH_TOKEN
Value: 5c6670d39a1dbf46d47ecdaa244b91d9
```
Click **"Add"**

**Adaugă a treia variabilă:**
```
Name: TWILIO_PHONE_NUMBER
Value: +40373807863
```
Click **"Add"**

---

### 6. Railway Va Redeploy Automat

După ce adaugi variabilele, Railway va detecta schimbarea și va reporni automat backend-ul.

Vei vedea în tab-ul **"Deployments"** un nou deployment care pornește.

**Așteaptă 1-2 minute** până se termină deployment-ul (status devine "Success" cu ✅).

---

### 7. Verifică Că Funcționează

După ce deployment-ul e gata, verifică că backend-ul rulează:

**Deschide în browser:**
```
https://aplicatie-superpartybyai-production.up.railway.app/
```

Ar trebui să vezi:
```json
{
  "status": "online",
  "service": "SuperParty Backend - WhatsApp + Voice",
  "accounts": 0,
  "maxAccounts": 20,
  "activeCalls": 0
}
```

Dacă vezi `"activeCalls": 0` → **Variables sunt setate corect!** ✅

---

## ✅ Gata!

Acum backend-ul are credentials Twilio și e gata să primească apeluri.

**Next step:** Configurează webhook în Twilio (vezi mai jos).

---

# 📞 Twilio - Configurare Webhook

## Pași Simpli (1 minut):

### 1. Du-te la Twilio Console

Link: [https://console.twilio.com/us1/develop/phone-numbers/manage/active](https://console.twilio.com/us1/develop/phone-numbers/manage/active)

---

### 2. Click pe Numărul Tău

Click pe `+40 373 807 863`

---

### 3. Scroll la "Voice Configuration"

Scroll în jos până găsești secțiunea **"Voice Configuration"**

---

### 4. Setează Webhook pentru "A CALL COMES IN"

**Configure with:** Selectează **"Webhooks, TwiML Bins, Functions, Studio, or Proxy"**

**A CALL COMES IN:**
- Selectează **"Webhook"** din dropdown
- **URL:** 
  ```
  https://aplicatie-superpartybyai-production.up.railway.app/api/voice/incoming
  ```
- **HTTP:** Selectează **"HTTP POST"**

---

### 5. Setează Webhook pentru "CALL STATUS CHANGES"

Mai jos, în aceeași secțiune:

**CALL STATUS CHANGES:**
- **URL:**
  ```
  https://aplicatie-superpartybyai-production.up.railway.app/api/voice/status
  ```
- **HTTP:** Selectează **"HTTP POST"**

---

### 6. Save

Scroll în jos și click pe butonul roșu **"Save"** sau **"Save Configuration"**

---

## ✅ Gata!

Twilio e configurat să trimită apelurile către backend-ul tău.

---

# 🧪 Testare Finală

## Sună Numărul Twilio

**Din telefonul tău, sună:**
```
0373 807 863
```

**Ce ar trebui să se întâmple:**

1. ✅ Auzi mesajul: "Vă rugăm așteptați, vă conectăm cu un operator."
2. ✅ (Dacă ai dashboard deschis) Vezi modal cu apel incoming
3. ✅ Poți răspunde/respinge apelul din UI
4. ✅ După 30 secunde (dacă nu răspunzi): "Ne pare rău, toți operatorii sunt ocupați..."

---

## Verifică Logs

**În Railway:**
1. Du-te la service backend
2. Tab **"Deployments"**
3. Click pe deployment-ul activ
4. Vei vedea logs cu:
   ```
   [Twilio] Incoming call: { callSid: "CAxxxx", from: "+40...", ... }
   ```

---

## Verifică Firestore

**În Firebase Console:**
1. Du-te la [https://console.firebase.google.com](https://console.firebase.google.com)
2. Selectează proiectul `superparty-frontend`
3. **Firestore Database**
4. Ar trebui să vezi collection nouă: **`calls`**
5. Click pe collection → vei vedea apelul tău salvat

---

# 🎉 Success!

Dacă toate astea funcționează → **Centrala telefonică e LIVE!** 📞

**Ce poți face acum:**
- Primești apeluri în aplicație
- Notificări real-time
- Răspunzi/respingi din UI
- Vezi istoric apeluri
- Statistici apeluri

**Dacă ceva nu merge → Spune-mi ce eroare vezi și te ajut!** 🚀

---

**Created:** 2024-12-27  
**Author:** Ona AI
