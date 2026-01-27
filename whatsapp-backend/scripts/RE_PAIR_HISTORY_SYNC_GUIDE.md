# Ghid complet: Re-pair cu History Sync + Backfill

## Proces end-to-end stabil

### Pasul 0: Obține ADMIN_TOKEN (opțional - pentru verificări)
```bash
ssh root@37.27.34.179 'ADMIN_TOKEN=$(systemctl show whatsapp-backend --property=Environment --value | tr " " "\n" | sed -n "s/^ADMIN_TOKEN=//p"); echo "$ADMIN_TOKEN"'
```

### Pasul 1: Verifică indexul threads
```bash
ssh root@37.27.34.179 "journalctl -u whatsapp-backend --since '60 minutes ago' --no-pager | grep -E 'threads.*FAILED_PRECONDITION|create_composite=.*threads' | tail -n 20"
```

**Dacă vezi erori de `create_composite` pentru threads:**
- Indexul nu este "Ready/Enabled" în Firebase Console
- Trebuie creat/activat indexul în Firebase Console → Firestore → Indexes

### Pasul 2: Inițiază re-pair (regenerare QR)

**Folosind script-ul automatizat:**
```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/whatsapp-backend
./scripts/re-pair-history-sync.sh superpartybyai@gmail.com account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443
```

**Sau manual:**
```bash
export FIREBASE_API_KEY="AIzaSyDcMXO6XdFZE_tVnJ1M4Wrt8Aw7Yh1o0K0"
cd /Users/universparty/Aplicatie-SuperpartyByAi/whatsapp-backend

# Obține token-ul
TOKEN=$(node scripts/get-id-token-terminal.js superpartybyai@gmail.com 2>/dev/null | grep -E "^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$" | head -n 1)

ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443"

# Inițiază re-pair
ssh root@37.27.34.179 "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' http://127.0.0.1:8080/api/whatsapp/regenerate-qr/$ACCOUNT_ID | python3 -m json.tool"

# Obține QR-ul (în buclă până apare)
ssh root@37.27.34.179 "for i in 1 2 3 4 5 6 7 8 9 10; do echo \"--- try \$i\"; curl -sS -H 'Authorization: Bearer $TOKEN' http://127.0.0.1:8080/api/whatsapp/qr/$ACCOUNT_ID | python3 -m json.tool && break; sleep 2; done"
```

### Pasul 3: Scanează QR-ul

1. Deschide WhatsApp pe telefon
2. Mergi la: **Settings → Linked devices → Link a device**
3. Scanează QR-ul afișat

### Pasul 4: Confirmă că a pornit History Sync

**Folosind script-ul:**
```bash
./scripts/monitor-history-sync.sh
```

**Sau manual:**
```bash
ssh root@37.27.34.179 "journalctl -u whatsapp-backend -f | egrep -i 'messaging-history.set|history sync|history.*saved|history.*complete|app state sync'"
```

**Criteriu de succes:**
Trebuie să vezi ceva de tip:
- `messaging-history.set`
- `History sync ... saved/complete`
- `app state sync`

**Dacă nu apare nimic după scanare:**
- Re-pair-ul nu s-a finalizat corect
- Trimite output-ul din `journalctl -f` pentru analiză

### Pasul 5: Rulează backfill după ce History Sync s-a terminat

**Folosind script-ul:**
```bash
./scripts/run-backfill.sh superpartybyai@gmail.com account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443
```

**Sau manual:**
```bash
export FIREBASE_API_KEY="AIzaSyDcMXO6XdFZE_tVnJ1M4Wrt8Aw7Yh1o0K0"
TOKEN=$(node scripts/get-id-token-terminal.js superpartybyai@gmail.com 2>/dev/null | grep -E "^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$" | head -n 1)
ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443"

ssh root@37.27.34.179 "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' http://127.0.0.1:8080/api/whatsapp/backfill/$ACCOUNT_ID | python3 -m json.tool"
```

### Pasul 6: Verificare finală

**A) Dashboard/status:**
```bash
ssh root@37.27.34.179 "curl -sS http://127.0.0.1:8080/api/status/dashboard | python3 -m json.tool | head -250"
```

Caută câmpuri:
- `lastHistorySyncAt`
- `lastBackfillAt`
- Rezultate backfill

**B) Verificare recent-sync:**
```bash
ssh root@37.27.34.179 "journalctl -u whatsapp-backend --since '30 minutes ago' --no-pager | egrep -i '\[recent-sync\].*end|history sync|messaging-history.set|errors=' | tail -n 120"
```

**Criteriu de succes:**
- `recent-sync` nu mai arată `threads=0` constant după activitate
- Apare `messaging-history.set` sau `history sync complete`

## Ce înseamnă "stabil" după asta

✅ **Din momentul re-pair + History Sync:**
- Îți intră bulk-ul (inclusiv "ultima săptămână", în limita a ce trimite WhatsApp)
- Mesajele noi merg permanent prin realtime ingest + persist
- Nu mai depinzi de backfill pentru ziua curentă

✅ **recent-sync rămâne doar un "gap filler":**
- Nu mai este mecanismul principal pentru istoric
- Funcționează doar pentru gap-uri mici

## Script-uri disponibile

1. **`re-pair-history-sync.sh`** - Proces complet automatizat (pașii 1-4)
2. **`monitor-history-sync.sh`** - Monitorizare History Sync (pasul 4)
3. **`run-backfill.sh`** - Rulare backfill (pasul 5)
4. **`get-and-use-token.sh`** - Obținere și utilizare token Firebase

## Troubleshooting

**QR code nu apare:**
- Verifică statusul contului: `./scripts/get-and-use-token.sh <email> accounts`
- Verifică logurile: `ssh root@37.27.34.179 'journalctl -u whatsapp-backend -n 50'`

**History Sync nu pornește după scanare:**
- Verifică că QR-ul a fost scanat corect
- Verifică logurile pentru erori
- Trimite output-ul din `monitor-history-sync.sh` pentru analiză

**Backfill nu funcționează:**
- Asigură-te că History Sync s-a terminat complet
- Verifică indexurile Firestore
- Verifică logurile pentru erori
