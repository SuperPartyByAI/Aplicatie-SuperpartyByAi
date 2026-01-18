# 🔴 Problema: 401 Unauthorized → Cont șters automat

## 🎯 Root Cause

**Cont vechi** (`account_dev_904735e817756d2bac1328b0c556b2f9`):
- Primește **401 (Unauthorized)** de la WhatsApp
- Backend șterge automat contul: `❌ Explicit cleanup (401), deleting account`
- Se repetă în buclă: conectare → 401 → ștergere → reconectare

**Cont nou** (`account_dev_dde908a65501c63b124cb94c627e551d`):
- ✅ QR generat cu succes (`phone: +407****97`)
- ✅ Status: `qr_ready`
- ✅ Funcționează corect!

---

## 🔧 Soluție

### 1️⃣ **Folosește contul nou cu QR valid**

Contul `account_dev_dde908a65501c63b124cb94c627e551d` e OK:
- QR generat corect
- Phone: `+407****97` (numărul tău real, mascat în logs)
- Status: `qr_ready`

**Acțiune**: Scanează QR code-ul pentru acest cont nou!

### 2️⃣ **Șterge contul vechi corupt** (opțional)

Contul vechi (`account_dev_904735e817756d2bac1328b0c556b2f9`) e corupt și se șterge automat la 401.

**Dacă vrei să-l ștergi manual**:
- In Flutter app: WhatsApp Accounts → Find cont vechi → Delete
- Sau: Se va șterge automat după cleanup (când primește 401)

### 3️⃣ **Sesiune coruptă** (dacă problema continuă)

Dacă contul nou primește și el 401 după scan:

**Sesiune coruptă în Railway**:
- Sesion file: `/app/sessions/account_dev_dde908a65501c63b124cb94c627e551d`
- Trebuie șters din Railway (nu am acces direct)

**Workaround**:
- Șterge contul din app
- Adaugă din nou (generează sesiune fresh)

---

## 📋 Pași pentru Conectare

1. **Verifică conturile în app**:
   - Deschide WhatsApp Accounts
   - Ar trebui să vezi contul nou cu QR code

2. **Scanează QR cu telefonul real**:
   - WhatsApp → Settings → Linked Devices
   - "Link a Device"
   - Scanează QR din app

3. **Așteaptă conectare**:
   - 2-5 minute pentru conectare completă
   - Status ar trebui să devină `connected`

---

## 🔍 Ce înseamnă 401 (Unauthorized)

**401 de la WhatsApp** înseamnă:
- ❌ Sesion invalid/expirat
- ❌ Credentials corupte
- ❌ WhatsApp a deautentificat sesiunea

**Backend action** (corect):
- Când primește 401, șterge automat contul (evită loop infinit)
- Log: `❌ Explicit cleanup (401), deleting account`

---

## ✅ Status Curent

| Cont | Status | Problemă |
|------|--------|----------|
| `account_dev_904735e817756d2bac1328b0c556b2f9` | ❌ Deleted (401) | Sesiune coruptă, șters automat |
| `account_dev_dde908a65501c63b124cb94c627e551d` | ✅ `qr_ready` | **Folosește acest cont!** |

---

## 🚀 Acțiune Imediată

**Contul nou e OK - scanează QR code-ul!**

1. Deschide Flutter app → WhatsApp Accounts
2. Vezi contul cu QR code (status = `qr_ready`)
3. Scanează QR cu telefonul real
4. Așteaptă 2-5 minute pentru `connected`

**Contul vechi se șterge automat** când primește 401 (nu e problemă).

---

**Status**: Cont nou OK, scanează QR! 🎉
