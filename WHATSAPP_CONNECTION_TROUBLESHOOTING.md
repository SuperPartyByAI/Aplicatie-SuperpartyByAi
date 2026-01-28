# WhatsApp Connection Troubleshooting

## Status: `awaiting_scan` după scanarea QR

### Ce înseamnă:
- QR code a fost scannat cu succes pe telefon
- Backend așteaptă confirmarea de la WhatsApp
- Procesul de conectare poate dura **2-5 minute** (normal!)

---

## Verificări Pas cu Pas

### 1️⃣ Verifică status-ul contului în app:
- Deschide WhatsApp Accounts în Flutter app
- Vezi status-ul contului:
  - `awaiting_scan` → Așteaptă confirmare (normal, 2-5 min)
  - `connecting` → Se conectează (normal)
  - `connected` → ✅ Conectat cu succes!
  - `disconnected` → ❌ Eroare de conectare

### 2️⃣ Verifică pe telefon:
- WhatsApp → Linked Devices
- Vezi dacă apare device-ul
- Dacă apare ca "Connecting..." → așteaptă 1-2 minute
- Dacă apare "Connected" → ✅ Success!

### 3️⃣ Verifică logs legacy hosting (dacă ai acces):
- legacy hosting Dashboard → Logs
- Caută erori sau warnings după scan

---

## Ce trebuie să faci:

### Dacă status = `awaiting_scan` sau `connecting`:
- ⏳ **Așteaptă 3-5 minute** - procesul e normal
- WhatsApp verifică conexiunea și sincronizează mesajele

### Dacă status rămâne `awaiting_scan` > 5 minute:
- 🔄 Încearcă să regenerezi QR:
  - In app: WhatsApp Accounts → Tap "Regenerate QR"
  - Scan din nou cu telefon
  - Așteaptă 2-3 minute

### Dacă status = `disconnected` sau eroare:
- Verifică conexiunea internet (WiFi/mobile data)
- Verifică că backend legacy hosting e healthy:
  ```bash
  curl https://whats-app-ompro.ro/health
  ```
- Verifică logs legacy hosting pentru erori

---

## Comenzi de Debug:

```bash
# Verifică status conturi
curl https://whats-app-ompro.ro/api/whatsapp/accounts

# Verifică backend health
curl https://whats-app-ompro.ro/health

# Verifică Flutter logs (Android)
adb logcat | grep -iE "whatsapp|error|connection"
```

---

## Timeline Normal:

1. **Scan QR** → 0s (instant)
2. **Backend primește scan** → 1-2s
3. **Status = `awaiting_scan`** → 1-10s
4. **WhatsApp verifică** → 30s - 2min
5. **Status = `connecting`** → 2-3min
6. **Status = `connected`** → ✅ 3-5min total

**Dacă depășește 5 minute, e posibilă problemă.**

---

## Probleme Comune:

### 1. QR expirat
- **Fix**: Regenerare QR (tap "Regenerate QR")

### 2. Network timeout
- **Fix**: Verifică conexiunea internet, reîncearcă

### 3. Backend down
- **Fix**: Verifică legacy hosting health, redeploy dacă e nevoie

### 4. WhatsApp rate limit
- **Fix**: Așteaptă 10-15 minute, reîncearcă

---

## Dacă tot nu merge:

1. Verifică legacy hosting logs pentru erori specifice
2. Verifică că backend e healthy
3. Regenerează QR și scanează din nou
4. Verifică că nu ai deja prea multe devices conectate (max 4)

---

**Status curent**: `awaiting_scan` - așteaptă încă ~2-3 minute pentru conexiune completă.
