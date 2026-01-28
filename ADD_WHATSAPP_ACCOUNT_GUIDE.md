# ✅ Ghid: Adaugă WhatsApp Account cu Număr Real

## Problema
- Contul tău a fost șters (probabil cont "Test" a rămas în loc)
- Lista de conturi e goală acum
- Trebuie să adaugi din nou contul cu **numărul tău real**

---

## 📱 Pași pentru a Adăuga Contul Real

### 1️⃣ **Pregătește numărul de telefon**
- Numărul trebuie în format **E.164**: `+40712345678`
- Format: `+` + cod țară + număr (fără spații, fără `0` la început)

**Exemple:**
- ✅ `+40712345678` (România, corect)
- ❌ `0712345678` (lipsește `+40`)
- ❌ `40712345678` (lipsește `+`)
- ❌ `+40 712 345 678` (spații)

### 2️⃣ **Adaugă contul în app**

1. **Deschide Flutter app** pe emulator/device
2. **Navigate**: WhatsApp → **Accounts** (sau WhatsApp Accounts screen)
3. **Tap** butonul **"+ Add Account"** (FAB verde jos)
4. **Completează dialog**:
   - **Name**: `Cont Principal` (sau orice nume)
   - **Phone**: `+40712345678` (numărul tău real, format E.164)
5. **Tap** **"Add"**

### 3️⃣ **Așteaptă QR code**

- După "Add", backend generează QR code
- Status-ul contului va fi: `qr_ready` sau `connecting`
- QR code-ul va apărea în cardul contului (dacă status = `qr_ready`)

### 4️⃣ **Scanează QR cu telefonul real**

1. **Deschide WhatsApp** pe telefonul real
2. **Navigate**: WhatsApp → **Settings** → **Linked Devices** (sau "Dispozitive legate")
3. **Tap** **"Link a Device"** sau **"Leghează un dispozitiv"**
4. **Scanează QR code-ul** de pe emulator/device (din app)
5. **Așteaptă** 2-5 minute pentru conectare

### 5️⃣ **Verifică conectarea**

- **Status în app**: Ar trebui să devină `connected` (după 2-5 min)
- **Pe telefon**: Linked Devices → ar trebui să vezi device-ul ca "Connected"

---

## 🔍 Verificare Status

### În app:
- **WhatsApp Accounts screen** → vezi status-ul contului
- **Status posibil**:
  - `qr_ready` → QR code gata pentru scan
  - `awaiting_scan` → Așteaptă scan (după scan)
  - `connecting` → Se conectează (2-3 min)
  - `connected` → ✅ Conectat cu succes!

### Pe telefon:
- **WhatsApp → Linked Devices**
- Ar trebui să vezi device-ul listat ca "Connected"

---

## ❌ Dacă Apare Eroare

### Eroare: "Account already exists"
- **Fix**: Verifică dacă există un cont vechi în Firestore
- Sau: Șterge contul vechi și adaugă din nou

### Eroare: "Invalid phone number"
- **Fix**: Verifică format E.164:
  - Trebuie să înceapă cu `+`
  - Format: `+` + cod țară + număr
  - Exemplu: `+40712345678`

### Eroare: "Connection timeout"
- **Fix**: Verifică conexiunea internet (WiFi/mobile data)
- Verifică că backend Hetzner e healthy:
  ```bash
  curl https://whats-app-ompro.ro/health
  ```

### QR code nu apare
- **Fix**: Tap "Regenerate QR" pe cardul contului
- Sau: Șterge contul și adaugă din nou

---

## 🧪 Comenzi de Test

```bash
# Verifică conturi existente
curl https://whats-app-ompro.ro/api/whatsapp/accounts

# Verifică backend health
curl https://whats-app-ompro.ro/health

# Test add account (cu număr real)
curl -X POST https://whats-app-ompro.ro/api/whatsapp/add-account \
  -H "Content-Type: application/json" \
  -d '{"name":"Cont Principal","phone":"+40712345678"}'
```

---

## 📝 Format Număr Corect

| Corect ✅ | Greșit ❌ |
|-----------|-----------|
| `+40712345678` | `0712345678` |
| `+40712345678` | `40712345678` |
| `+40712345678` | `+40 712 345 678` |
| `+40712345678` | `0712-345-678` |

**IMPORTANT**: Numărul trebuie să fie **exact în format E.164**, fără spații sau caractere speciale.

---

## ✅ Checklist

- [ ] Numărul e în format E.164 (`+40712345678`)
- [ ] Am adăugat contul prin app (Add Account)
- [ ] QR code apare în app (status = `qr_ready`)
- [ ] Am scannat QR cu telefonul real (Linked Devices)
- [ ] Aștept 2-5 minute pentru conectare
- [ ] Status în app = `connected` ✅

---

## 🆘 Dacă Tot Nu Merge

1. **Verifică logs Hetzner** (dacă ai acces)
2. **Verifică Firestore** → `accounts` collection (dacă ai acces)
3. **Reîncearcă** cu Regenerate QR
4. **Șterge contul vechi** și adaugă din nou

---

**Acum**: Lista de conturi e goală, deci poți adăuga fresh contul cu numărul tău real! 🚀
