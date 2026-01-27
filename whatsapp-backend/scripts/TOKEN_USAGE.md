# Ghid de utilizare pentru Firebase ID Token

## Script-uri disponibile

### 1. `get-id-token-terminal.js` - Obține token-ul
Obține un Firebase ID token pentru un email dat.

```bash
export FIREBASE_API_KEY="AIzaSyDcMXO6XdFZE_tVnJ1M4Wrt8Aw7Yh1o0K0"
cd /Users/universparty/Aplicatie-SuperpartyByAi/whatsapp-backend
node scripts/get-id-token-terminal.js superpartybyai@gmail.com
```

### 2. `get-and-use-token.sh` - Obține și folosește token-ul
Script automatizat care obține token-ul și îl folosește pentru request-uri API.

#### Comenzi disponibile:

**a) Doar afișează token-ul:**
```bash
./scripts/get-and-use-token.sh superpartybyai@gmail.com show
```

**b) Listează conturile WhatsApp:**
```bash
./scripts/get-and-use-token.sh superpartybyai@gmail.com accounts
```

**c) Obține QR code pentru un account:**
```bash
./scripts/get-and-use-token.sh superpartybyai@gmail.com qr <ACCOUNT_ID>
```

**d) Regenerare QR code:**
```bash
./scripts/get-and-use-token.sh superpartybyai@gmail.com regenerate <ACCOUNT_ID>
```

## Utilizare manuală a token-ului

După ce obții token-ul, poți să-l folosești în request-uri curl:

```bash
# Salvează token-ul într-o variabilă
TOKEN="eyJhbGciOiJSUzI1NiIs..."

# Listează conturile
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8080/api/whatsapp/accounts

# Obține QR code
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8080/api/whatsapp/qr/<ACCOUNT_ID>

# Regenerare QR code
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8080/api/whatsapp/regenerate-qr/<ACCOUNT_ID>
```

## Endpoint-uri API disponibile

- `GET /api/whatsapp/accounts` - Listează toate conturile
- `GET /api/whatsapp/qr/:accountId` - Obține QR code pentru un account
- `POST /api/whatsapp/regenerate-qr/:accountId` - Regenerare QR code
- `POST /api/whatsapp/add-account` - Adaugă un cont nou
- `DELETE /api/whatsapp/accounts/:id` - Șterge un cont

## Notă importantă

- Token-ul este valabil pentru **1 oră** (3600 secunde)
- După expirare, trebuie să obții un token nou
- Token-ul este specific pentru email-ul `superpartybyai@gmail.com`

## Configurare

Firebase API Key este deja configurat în script-uri:
- `AIzaSyDcMXO6XdFZE_tVnJ1M4Wrt8Aw7Yh1o0K0` (iOS)
- `AIzaSyB5zJqeDVenc9ygUx2zyW2WLkczY6FLavI` (macOS)

Credențialele Firebase sunt pe server la:
- `/etc/whatsapp-backend/firebase-sa.json`
