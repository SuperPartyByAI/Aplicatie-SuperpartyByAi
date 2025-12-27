# 📱 Reconnect WhatsApp Account - Quick Guide

## De ce trebuie reconectat?

După redeploy Railway, WhatsApp sessions se pierd (normal). Trebuie să re-adaugi contul.

**Timp:** 2 minute  
**Metoda:** Pairing Code (recomandat)

---

## 🚀 Pași Rapizi

### 1. Deschide App

```
https://superparty-frontend.web.app
```

### 2. Login

**Email:** ursache.andrei1995@gmail.com  
**Password:** (parola ta)

### 3. GM Mode

- Click pe meniu (☰)
- Click "GM Mode"
- Scroll down la "WhatsApp Accounts"

### 4. Add Account

**Click "Adaugă Cont WhatsApp"**

**Completează:**
- **Account ID:** `account1` (sau alt nume)
- **Phone Number:** `40737571397` (numărul tău Vodafone, FĂRĂ +)

**Click "Adaugă"**

### 5. Așteaptă Pairing Code

**În 5-10 secunde** va apărea:

```
🔢 Cod Pairing
KT93AM4F
```

(codul va fi diferit de fiecare dată)

### 6. Introdu Codul în WhatsApp

**Pe telefonul tău:**

1. Deschide WhatsApp
2. Settings (⚙️) → Linked Devices
3. Click "Link a Device"
4. Click "Link with phone number instead"
5. Introdu codul: `KT93AM4F`
6. Click "Link"

### 7. Verifică Conexiunea

**În app (după 10 secunde):**

- Status devine: **"connected"** ✅
- Phone number apare: **40737571397**

**✅ DONE!** WhatsApp conectat!

---

## 🧪 Test Funcționalitate

### Test 1: Vezi Conversații

1. În app: **Chat Clienți**
2. Selectează account: **account1**
3. Trebuie să vezi lista de clienți

### Test 2: Trimite Mesaj

1. Click pe un client
2. Scrie mesaj: "Test"
3. Click "Trimite"
4. Mesajul apare în WhatsApp pe telefon

### Test 3: Primește Mesaj

1. Trimite mesaj din WhatsApp pe telefon
2. Mesajul apare INSTANT în app (fără refresh)

**✅ Totul funcționează!**

---

## 🔧 Keep-alive Active

**Nou implementat:**

- Backend trimite "keep-alive" la 30 secunde
- Previne deconectări automate
- Auto-reconnect dacă se deconectează

**Verificare:**

Așteaptă 5 minute → Status trebuie să rămână "connected"

---

## 🐛 Troubleshooting

### Pairing code nu apare

**Cauză:** Număr telefon greșit sau backend nu răspunde

**Fix:**
```bash
# Verifică format număr:
✅ Corect: 40737571397
❌ Greșit: +40737571397, 0737571397

# Verifică backend:
curl https://aplicatie-superpartybyai-production.up.railway.app/
# Trebuie să răspundă: {"status":"online",...}
```

### Status rămâne "connecting"

**Cauză:** Codul nu a fost introdus în WhatsApp

**Fix:**
1. Verifică dacă ai introdus codul corect
2. Încearcă din nou (delete account + re-add)

### Se deconectează după câteva minute

**Cauză:** Keep-alive nu funcționează sau WhatsApp Web limit

**Check:**
```bash
# Verifică câte device-uri ai conectate în WhatsApp
# Max 4 devices (telefon + 3 linked devices)
```

**Fix:**
1. Deconectează alte device-uri din WhatsApp
2. Re-add account în app

### "Cannot add account" error

**Cauză:** Backend nu răspunde sau max accounts reached

**Fix:**
```bash
# Verifică backend:
curl https://aplicatie-superpartybyai-production.up.railway.app/api/accounts

# Dacă nu răspunde:
# Railway → Restart service
```

---

## 📊 Status Expected

### După Reconnect

**Backend:**
```json
{
  "id": "account1",
  "name": "WhatsApp 1",
  "status": "connected",
  "phone": "40737571397"
}
```

**Frontend:**
- ✅ Status: "connected"
- ✅ Phone: 40737571397
- ✅ Messages sync real-time
- ✅ No disconnections

---

## 🔄 Dacă Trebuie Reconectat Din Nou

**Când:**
- După Railway redeploy
- După 30 zile inactivitate (WhatsApp policy)
- După logout manual

**Pași:**
1. Delete account vechi (dacă există)
2. Add account nou (pași de mai sus)
3. Pairing code nou
4. Done!

**Timp:** 2 minute

---

## 💡 Tips

### Salvează Pairing Code

**NU funcționează!** Pairing code expiră după 1 minut.

Trebuie generat nou de fiecare dată.

### Multiple Accounts

Poți adăuga până la **20 accounts** simultan:

```
account1 - 40737571397
account2 - 40123456789
account3 - 40987654321
...
```

Fiecare cu pairing code separat.

### QR Code Alternative

Dacă pairing code nu merge, folosește QR:

1. Add account FĂRĂ phone number
2. QR code apare instant
3. Scanează cu WhatsApp
4. Done!

---

## 📞 Support

**Probleme?**

1. Check [VERIFICATION-REPORT.md](VERIFICATION-REPORT.md) - Status sistem
2. Check [FIX-FIREBASE-PERMISSIONS.md](FIX-FIREBASE-PERMISSIONS.md) - Fix permissions
3. Contact: ursache.andrei1995@gmail.com

---

**Created:** 2024-12-27  
**Ona AI** ✅
