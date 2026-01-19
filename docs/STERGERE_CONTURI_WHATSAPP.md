# 📋 Ghid: Ștergerea Conturilor WhatsApp

Există **2 metode** pentru ștergerea conturilor WhatsApp:
1. **Manual (Flutter UI)** - pentru ștergerea selectivă
2. **Bulk (Script)** - pentru ștergerea în masă

---

## 1️⃣ METODA MANUALĂ (Flutter UI)

### Pas cu pas:

1. **Deschide aplicația Flutter**
   ```bash
   cd superparty_flutter
   flutter run
   ```

2. **Navighează la ecranul WhatsApp Accounts**
   - Mergi la secțiunea WhatsApp
   - Vei vedea lista cu toate conturile

3. **Găsește butonul DELETE pe fiecare card**
   - Pe fiecare card de cont există un **buton roșu DELETE** (icon 🗑️)
   - Butonul este în partea dreaptă jos a cardului, lângă "Regenerate QR"

4. **Șterge contul**
   - Click pe butonul DELETE (roșu)
   - Va apărea un dialog de confirmare: "Delete Account?"
   - Click "Delete" pentru confirmare
   - Contul va fi șters permanent

### Exemplu vizual:
```
┌─────────────────────────────────────┐
│ Account: Andrei                     │
│ Phone: +40737571397                 │
│ Status: disconnected                │
│                                     │
│ [Regenerate QR]  [🗑️ DELETE] ← Aici │
└─────────────────────────────────────┘
```

### Avantaje:
- ✅ Selectiv - alegi exact ce conturi să ștergi
- ✅ Visual - vezi toate detaliile contului
- ✅ Safe - confirmare înainte de ștergere
- ✅ Immediate - vezi rezultatul instant

---

## 2️⃣ METODA BULK (Script)

### Setup:

1. **Instalează dependențele** (dacă nu le ai):
   ```bash
   # jq este necesar pentru parsing JSON
   brew install jq  # macOS
   # sau
   sudo apt-get install jq  # Linux
   ```

2. **Setare ADMIN_TOKEN**:
   ```bash
   cd whatsapp-backend
   
   # Opțiunea 1: Din Railway CLI
   export ADMIN_TOKEN=$(railway variables | grep ADMIN_TOKEN | head -1 | awk -F'│' '{print $3}' | xargs)
   
   # Opțiunea 2: Manual (copiază token-ul din Railway Dashboard)
   export ADMIN_TOKEN='your-admin-token-here'
   ```

### Utilizare:

#### A. Lista toate conturile:
```bash
cd whatsapp-backend
./scripts/delete_accounts.sh --list
```

**Output:**
```
📋 LISTA CONTURI:

account_prod_xxx    Andrei              +40737571397    Status: qr_ready
account_dev_yyy     Test                +40700000000    Status: disconnected
account_zzz         eu                  40737571397     Status: disconnected
...
```

#### B. Șterge toate conturile cu un status specific:
```bash
# Șterge toate conturile cu status 'disconnected'
./scripts/delete_accounts.sh --status disconnected

# Șterge toate conturile cu status 'needs_qr'
./scripts/delete_accounts.sh --status needs_qr

# Șterge toate conturile cu status 'qr_ready'
./scripts/delete_accounts.sh --status qr_ready
```

**Exemplu interactiv:**
```bash
$ ./scripts/delete_accounts.sh --status disconnected
🔍 Caut conturi cu status: disconnected
📋 Conturi găsite:
     1  account_1767127436455
     2  account_1767170340043
     3  account_dev_dae305d7c4400481d1b9f7500eff0f28
     4  account_dev_dde908a65501c63b124cb94c627e551d
     5  account_f8bc6f83b05264a5
⚠️  Ești sigur că vrei să ștergi aceste conturi? (yes/no): yes

🗑️  Șterg contul: account_1767127436455
✅ Șters: account_1767127436455
🗑️  Șterg contul: account_1767170340043
✅ Șters: account_1767170340043
...

✅ Șterse: 5
```

#### C. Șterge conturi specifice (multiple):
```bash
# Șterge 2-3 conturi specifice
./scripts/delete_accounts.sh account_id1 account_id2 account_id3

# Exemplu:
./scripts/delete_accounts.sh \
  account_1767127436455 \
  account_1767170340043 \
  account_dev_xxx
```

#### D. Șterge un singur cont:
```bash
./scripts/delete_accounts.sh account_id
```

### Status-uri disponibile:
- `disconnected` - Conturi vechi, deconectate
- `needs_qr` - Conturi care necesită QR code
- `qr_ready` - Conturi cu QR code generat (gata pentru scanare)
- `connected` - Conturi active (⚠️ NU ȘTERGE!)
- `logged_out` - Conturi deconectate permanent

### Avantaje:
- ✅ Rapid - ștergi multe conturi deodată
- ✅ Automat - fără click manual pentru fiecare
- ✅ Scriptable - poți automatiza procesul
- ✅ Safe - confirmare înainte de ștergere în bulk

---

## 📊 Recomandări

### Ce poți șterge SAFE:
- ✅ Conturi cu status `disconnected` (conturi vechi)
- ✅ Conturi cu status `needs_qr` (conturi de test)
- ✅ Conturi `dev_*` cu nume generat automat (teste)
- ✅ Conturi duplicate (același număr de telefon)

### Ce NU trebuie să ștergi:
- ⚠️ Conturi cu status `connected` (active în folosință)
- ⚠️ Conturi `qr_ready` pe care vrei să le scanezi
- ⚠️ Conturi de producție (`prod_*`) care sunt active

### Când să folosești fiecare metodă:

**Folosește MANUAL (Flutter UI)** când:
- Vrei să vezi detalii despre fiecare cont înainte de ștergere
- Vrei să ștergi doar câteva conturi selectate
- Ești în aplicația Flutter deja

**Folosește BULK (Script)** când:
- Vrei să ștergi toate conturile cu un status (ex: toate `disconnected`)
- Ai multe conturi de șters și vrei să fie rapid
- Vrei să automatizezi procesul (ex: cleanup periodic)

---

## 🛠️ Troubleshooting

### Script-ul nu funcționează:
```bash
# Verifică dacă script-ul este executabil
chmod +x scripts/delete_accounts.sh

# Verifică dacă ADMIN_TOKEN este setat
echo $ADMIN_TOKEN

# Verifică dacă jq este instalat
which jq
```

### Butonul DELETE nu apare în Flutter:
- Verifică dacă aplicația este compilată cu ultima versiune
- Verifică dacă ești logat ca super-admin
- Rebuild aplicația: `flutter clean && flutter run`

### Eroare "Account not found":
- Contul a fost deja șters
- ID-ul contului este incorect
- Verifică lista conturilor: `./scripts/delete_accounts.sh --list`

---

## 📝 Exemplu complet

### Pas cu pas: Ștergerea tuturor conturilor `disconnected`:

```bash
# 1. Mergi la directorul backend
cd whatsapp-backend

# 2. Setează ADMIN_TOKEN
export ADMIN_TOKEN=$(railway variables | grep ADMIN_TOKEN | head -1 | awk -F'│' '{print $3}' | xargs)

# 3. Lista conturile cu status 'disconnected'
curl -s https://whats-upp-production.up.railway.app/api/whatsapp/accounts \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  jq -r '.accounts[] | select(.status == "disconnected") | "\(.id) - \(.name) - \(.phone)"'

# 4. Șterge toate conturile 'disconnected'
./scripts/delete_accounts.sh --status disconnected

# 5. Verifică rezultatul
./scripts/delete_accounts.sh --list | grep -i disconnected
# Ar trebui să fie 0 rezultate
```

---

## ✅ Verificare

După ștergere, verifică:
```bash
# Lista conturi rămase
./scripts/delete_accounts.sh --list

# Sau via API
curl -s https://whats-upp-production.up.railway.app/api/whatsapp/accounts \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  jq '.accounts | length'  # Număr conturi
```

---

**🎉 Gata! Acum poți șterge conturi atât manual cât și în bulk!**
