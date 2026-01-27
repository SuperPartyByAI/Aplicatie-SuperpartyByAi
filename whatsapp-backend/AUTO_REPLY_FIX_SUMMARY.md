# Auto-Reply Fix - Rezumat Implementare

## Problema Identificată
Auto-reply nu răspundea la mesaje INBOUND (client → WhatsApp conectat), deși mesajele outbound (din app) erau salvate corect în Firestore.

## Modificări Implementate

### 1. **Filtrare Strictă pentru Mesaje OUTBOUND** ✅
- **Fișier**: `server.js`, funcția `handleMessagesUpsert` (linia ~858)
- **Modificare**: Adăugat logging explicit când se skip-uie mesaje outbound
- **Log nou**: `[AutoReply] ⏭️  SKIP_OUTBOUND: message fromMe=true (sent from app)`
- **Rezultat**: Mesajele trimise din app (outbound) sunt explicit skip-uite și nu declanșează auto-reply

### 2. **Îmbunătățire Logging în `maybeHandleAiAutoReply`** ✅
- **Fișier**: `server.js`, funcția `maybeHandleAiAutoReply` (linia ~512)
- **Modificare**: Fiecare gate acum loghează explicit motivul pentru care NU trimite auto-reply
- **Loguri noi**:
  - `skipped_fromMe` - mesaj outbound (din app)
  - `skipped_group` - mesaj în grup (@g.us)
  - `skipped_notify` - eventType nu este 'notify'
  - `skipped_notFresh` - mesaj mai vechi de 2 minute
  - `skipped_dedupe` - mesaj deja procesat (idempotency)
  - `skipped_nonText` - mesaj non-text (imagine/video/etc)
  - `skipped_noFirestore` - Firestore indisponibil
  - `skipped_disabled` - auto-reply dezactivat (account/thread)
  - `skipped_cooldown_thread` - cooldown activ per thread (10s)
  - `skipped_cooldown_clientJid` - cooldown activ per clientJid (10s)
  - `skipped_noGroqKey` - GROQ_API_KEY neconfigurat
  - `skipped_noSocket` - socket indisponibil

### 3. **Verificare Cooldown (10s)** ✅
- **Constanta**: `AI_REPLY_COOLDOWN_MS = 10 * 1000` (10 secunde) - deja corect setată
- **Gate 10**: Cooldown per thread (10s) - verifică `threads/{threadId}.aiLastReplyAt`
- **Gate 11**: Cooldown per clientJid (10s) - verifică `threads/{threadId}.autoReplyLastClientReplyAt`
- **Rezultat**: Previne spam-ul și loop-urile

### 4. **Idempotency (Dedupe)** ✅
- **Gate 5**: Verifică `isDedupeHit(messageId)` - previne procesarea duplicată
- **După trimitere**: `markDedupe(messageId)` marchează mesajul ca procesat
- **TTL**: `AI_REPLY_DEDUPE_TTL_MS = 10 * 60 * 1000` (10 minute)
- **Rezultat**: Același messageId nu va declanșa auto-reply de 2 ori

### 5. **Filtrare Grupuri** ✅
- **Gate 2**: Verifică `remoteJid.endsWith('@g.us')` - skip-uie grupuri
- **Log**: `skipped_group` când mesajul este dintr-un grup

## Gate-uri de Securitate (Ordine de Execuție)

1. **Gate 1**: Validare input (msg, saved)
2. **Gate 2**: Skip outbound/grupuri/invalidJid
3. **Gate 3**: Doar eventType='notify'
4. **Gate 4**: Doar mesaje fresh (< 2 minute)
5. **Gate 5**: Idempotency (dedupe per messageId)
6. **Gate 6**: Doar mesaje text (conversation/extendedText)
7. **Gate 7**: Firestore disponibil
8. **Gate 8**: Auto-reply enabled (account/thread)
9. **Gate 9**: Comenzi speciale (stop/dezactiveaza)
10. **Gate 10**: Cooldown per thread (10s)
11. **Gate 11**: Cooldown per clientJid (10s)
12. **Gate 12**: GROQ_API_KEY configurat
13. **Gate 13**: Socket disponibil

## Pași de Testare

### Test 1: Mesaj INBOUND (Client → WhatsApp) - Ar trebui să trimită auto-reply

1. **Trimite mesaj din telefonul clientului** către numărul WhatsApp conectat
2. **Verifică logurile backend**:
   ```bash
   ssh -i ~/.ssh/hetzner_whatsapp root@37.27.34.179 "sudo journalctl -u whatsapp-backend -f --no-pager" | grep -E "AutoReply|🤖"
   ```

3. **Loguri așteptate**:
   ```
   📨 [account] PROCESSING: INBOUND message ...
   💾 [account] Message saved: ... direction=INBOUND
   [AutoReply] 🚀 Triggering auto-reply: ... fromMe=false
   [AutoReply] 🔍 Entry: ... fromMe=false
   [AutoReply] ✅ All gates passed, generating reply...
   [AutoReply] 📤 Sending reply: ...
   🤖 [AutoReply] ✅ SUCCESS: ...
   ```

4. **Verifică în Firestore**:
   - Mesajul INBOUND apare în `threads/{threadId}/messages/{messageId}` cu `fromMe=false`
   - Mesajul OUTBOUND (auto-reply) apare în `threads/{threadId}/messages/{outboundMessageId}` cu `fromMe=true` și `autoReply=true`

### Test 2: Mesaj OUTBOUND (App → Client) - NU ar trebui să trimită auto-reply

1. **Trimite mesaj din Flutter app** (ChatScreen) către client
2. **Verifică logurile backend**:
   ```bash
   ssh -i ~/.ssh/hetzner_whatsapp root@37.27.34.179 "sudo journalctl -u whatsapp-backend -f --no-pager" | grep -E "AutoReply|OUTBOUND"
   ```

3. **Loguri așteptate**:
   ```
   📨 [account] PROCESSING: OUTBOUND message ...
   💾 [account] Message saved: ... direction=OUTBOUND
   [AutoReply] ⏭️  SKIP_OUTBOUND: message fromMe=true (sent from app)
   ```

4. **Verifică în Firestore**:
   - Mesajul OUTBOUND apare în `threads/{threadId}/messages/{messageId}` cu `fromMe=true`
   - **NU** apare mesaj auto-reply

### Test 3: Cooldown (10s) - Ar trebui să skip-uie al doilea mesaj

1. **Trimite primul mesaj INBOUND** → ar trebui să primească auto-reply
2. **Înainte de 10 secunde**, trimite al doilea mesaj INBOUND
3. **Loguri așteptate pentru al doilea mesaj**:
   ```
   [AutoReply] ⏭️  Gate 11 FAIL (skipped_cooldown_clientJid): clientJid cooldown active (Xs remaining)
   ```

### Test 4: Grupuri - Ar trebui să skip-uie

1. **Trimite mesaj într-un grup** (@g.us)
2. **Loguri așteptate**:
   ```
   [AutoReply] ⏭️  Gate 2 FAIL (skipped_group): isGroup=true
   ```

### Test 5: Idempotency - Nu trimite de 2 ori pentru același messageId

1. **Simulează mesaj duplicat** (dacă este posibil)
2. **Loguri așteptate pentru mesajul duplicat**:
   ```
   [AutoReply] ⏭️  Gate 5 FAIL (skipped_dedupe): already processed messageId=...
   ```

## Verificare Configurare

### 1. Auto-Reply Enabled în Firestore
```javascript
// Verifică în Firestore Console
accounts/{accountId}:
  - autoReplyEnabled: true
  - autoReplyPrompt: "Ești un asistent WhatsApp..."
```

### 2. GROQ_API_KEY Configurat
```bash
# Verifică în environment
echo $GROQ_API_KEY
```

### 3. Firestore Disponibil
- Verifică logurile la startup: `✅ Firebase Admin initialized`

## Debugging

### Dacă auto-reply NU funcționează:

1. **Verifică logurile pentru gate-uri**:
   ```bash
   ssh ... "sudo journalctl -u whatsapp-backend --since '5 minutes ago' --no-pager" | grep "AutoReply.*FAIL"
   ```

2. **Verifică ce gate eșuează**:
   - `skipped_fromMe` → OK (mesaj outbound, normal să skip-uie)
   - `skipped_disabled` → Activează auto-reply în Firestore
   - `skipped_noGroqKey` → Configurează GROQ_API_KEY
   - `skipped_cooldown_*` → Așteaptă 10s între mesaje
   - `skipped_notFresh` → Mesaj prea vechi (> 2 minute)

3. **Verifică că mesajul este INBOUND**:
   ```bash
   grep "PROCESSING.*INBOUND" logs
   ```

## Fișiere Modificate

- `whatsapp-backend/server.js`:
  - Funcția `handleMessagesUpsert` (linia ~850-890)
  - Funcția `maybeHandleAiAutoReply` (linia ~512-760)

## Acceptanță

✅ **Când trimit mesaj din telefonul clientului către WA conectat**:
- Backend trimite exact un auto-reply
- Auto-reply este salvat în Firestore ca outbound (`fromMe=true`, `autoReply=true`)

✅ **Când trimit mesaj din app (outbound/fromMe)**:
- NU trimite auto-reply
- Log: `SKIP_OUTBOUND: message fromMe=true`

✅ **Idempotency**:
- Același messageId nu declanșează auto-reply de 2 ori

✅ **Cooldown (10s)**:
- Previne spam-ul între mesaje consecutive
