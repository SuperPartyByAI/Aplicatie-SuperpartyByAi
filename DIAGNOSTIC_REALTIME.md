# Diagnostic Ingest Timp Real - Ghid Complet

## Problema
Mesajele noi din WhatsApp nu apar în timp real în aplicație pentru contul personal.

## Verificări Necesare

### 1. Restart Backend + Confirmare Build Nou

Pe server Hetzner:

```bash
# Restart serviciu
sudo systemctl restart whatsapp-backend

# Verifică status
sudo systemctl status whatsapp-backend --no-pager -l

# Verifică health
curl -s http://37.27.34.179:8080/health | python3 - <<'PY'
import sys, json
d=json.load(sys.stdin)
print("timestamp:", d.get("timestamp"))
print("bootTimestamp:", d.get("bootTimestamp"))
print("connected:", d.get("connected"))
print("lockStatus:", d.get("lockStatus"))
print("dedupe:", d.get("dedupe"))
print("history:", d.get("history"))
PY
```

**Important**: Verifică că `bootTimestamp` s-a schimbat (confirmă restart).

### 2. Test Ingest Timp Real (60 sec)

#### Pas 1: Health înainte de mesaj
```bash
curl -s http://37.27.34.179:8080/health | python3 - <<'PY'
import sys, json
d=json.load(sys.stdin)
print("dedupe.wrote:", d.get("dedupe", {}).get("wrote"))
print("history.wrote:", d.get("history", {}).get("wrote"))
print("history.lastRunAt:", d.get("history", {}).get("lastRunAt"))
PY
```

#### Pas 2: Trimite mesaj nou în WhatsApp
- Trimite "ping-123" către contul personal (sau din contul personal către altcineva)
- Așteaptă 15-30 secunde

#### Pas 3: Health după mesaj
```bash
curl -s http://37.27.34.179:8080/health | python3 - <<'PY'
import sys, json
d=json.load(sys.stdin)
print("dedupe.wrote:", d.get("dedupe", {}).get("wrote"))
print("history.wrote:", d.get("history", {}).get("wrote"))
print("history.lastRunAt:", d.get("history", {}).get("lastRunAt"))
PY
```

**Interpretare**:
- ✅ Dacă `dedupe.wrote` sau `history.wrote` crește → ingest funcționează
- ❌ Dacă nu se schimbă nimic → backend-ul nu mai ingestează

### 3. Verificare Log-uri Backend

#### Live monitoring (recomandat)
```bash
sudo journalctl -u whatsapp-backend -f --no-pager \
| egrep -i "Processing|Attempting to save|Message saved|Dedupe|already processed|Skipping message|Firestore write FAIL|error|exception|warn|📨|📩|💾|✅|❌|⚠️"
```

#### Log-uri recente (după mesaj)
```bash
sudo journalctl -u whatsapp-backend --since "2 min ago" -n 200 --no-pager \
| egrep -i "Processing|Attempting to save|Message saved|Dedupe|already processed|Skipping message|Firestore write FAIL|error|exception|warn|📨|📩|💾|✅|❌|⚠️"
```

**Interpretare**:

✅ **Caz 1: Vezi toate marker-ele**
```
📨 Processing X message(s) in real-time
📩 Processing message: remote=... fromMe=... msg=... ts=...
💾 Attempting to save message: ...
✅ Message saved successfully: ...
```
→ Ingest + write în Firestore e OK. Dacă NU apare în app → problemă pe Flutter/Firestore stream.

❌ **Caz 2: Vezi până la 💾, dar apoi ❌**
```
💾 Attempting to save message: ...
❌ Firestore write FAIL: ...
```
→ Problemă de Firestore credentials / path / permisiuni. Trebuie snippet-ul exact de eroare.

❌ **Caz 3: Nu vezi deloc 📨/📩**
→ Sesiunea WhatsApp e "connected" în health, dar nu mai livrează evenimente (Baileys blocat). 
**Soluție**: Regenerate QR + re-pair pentru contul afectat.

### 4. Fix Standard: Re-pair WhatsApp

Dacă log-urile arată că nu primești evenimente noi:

1. **Din aplicație**: Regenerate QR pentru contul personal
2. **Din WhatsApp**: Linked Devices → Scan QR code
3. **Test din nou**: Trimite "ping-123" și verifică log-urile

### 5. Verificare Flutter (după ce backend zice ✅ Message saved)

În Flutter, verifică log-urile:
```
Thread stream update ... threads=200
```

Dacă vezi `✅ Message saved successfully` în backend dar NU apare în app:
→ Problemă pe Flutter/Firestore stream (query/filtru/cache).

## Ce să trimiți pentru diagnostic complet

1. **Output health înainte și după mesaj**:
   ```bash
   curl -s http://37.27.34.179:8080/health
   ```

2. **40-80 linii din log-uri** exact în momentul mesajului "ping-123":
   ```bash
   sudo journalctl -u whatsapp-backend --since "2 min ago" -n 200 --no-pager
   ```

3. **În Flutter**: Linia `Thread stream update ...` imediat după ce backend zice `✅ Message saved successfully`

## Marker-e Logging Noi

Cu logging-ul îmbunătățit, vei vedea:

- `📨 Processing X message(s) in real-time` → Mesajele ajung la handler
- `📩 Processing message: remote=... fromMe=... msg=... ts=...` → Mesajele sunt procesate
- `💾 Attempting to save message: ...` → Se încearcă salvarea
- `✅ Message saved successfully: ...` → Mesajul este salvat în Firestore
- `⏭️ already processed (dedupe)` → Mesajul este duplicat (normal pentru retry-uri)
- `⚠️ Skipping message - no content` → Mesajul este filtrat
- `❌ Firestore write FAIL` → Eroare la salvare

## Rezumat Fix-uri Aplicate

1. ✅ **Fix dedupe bug în StaffInboxScreen** (cheia include accountId)
2. ✅ **Optimizare backfill automat** (cooldown 1h, 4 conturi, 2 concurrent)
3. ✅ **Logging detaliat pentru ingest timp real** (marker-e clare pentru fiecare pas)

## Următorii Pași

1. Restart backend pe Hetzner
2. Test ingest cu mesaj "ping-123"
3. Verifică log-urile cu marker-ele noi
4. Dacă nu vezi evenimente → re-pair WhatsApp
5. Dacă vezi evenimente dar nu apare în app → verifică Flutter stream
