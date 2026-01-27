# Thread Canonicalization Fix - Rezolvarea Duplicate-urilor și Identificării Greșite a Contactelor

## Problema Identificată

AI-ul răspundea uneori cu datele persoanei greșite (nume/firstName/displayName) din cauza:
1. **Duplicate de thread-uri** pe același telefon (ex: `+40768098268 x2`)
2. **JID-uri diferite** pentru același contact (`@lid` vs `@s.whatsapp.net`)
3. **ThreadId necanonicalizat** - același contact putea avea thread-uri diferite
4. **Lipsă fallback** - când thread doc nu exista, se crea unul nou în loc să se caute unul existent

## Soluția Implementată

### A) Funcții de Normalizare

#### 1. `normalizePhone(input)`
- Extrage doar cifrele (fără `+`, fără spații)
- Returnează: `"40768098268"` pentru input `"+40768098268"` sau `"40 768 098 268"`

#### 2. `canonicalClientKey(remoteJid, accountId)` (async)
- Pentru `@s.whatsapp.net`: extrage phone digits → `${digits}@s.whatsapp.net`
- Pentru `@lid`: încearcă să rezolve telefonul din mapping → folosește `${digits}@s.whatsapp.net` dacă găsește, altfel păstrează `@lid`
- Pentru grupuri: returnează ca atare
- Returnează: `{canonicalKey, phoneDigits, phoneE164}`

#### 3. `buildCanonicalThreadId(accountId, canonicalKey)`
- Construiește threadId canonical: `${accountId}__${canonicalKey}`
- Garantează că același contact → același threadId

#### 4. `findExistingThreadByPhone(accountId, phoneDigits, phoneE164)` (async)
- Caută thread-uri existente după `phoneE164` sau `phone`
- Alege thread-ul cu `lastRaw` cel mai recent
- Verifică că thread-ul aparține account-ului corect

### B) Logging Complet pentru Diagnosticare

Toate logurile folosesc formatul `[AutoReply][Trace] traceId=...` pentru a urmări un mesaj de la intrare până la răspuns.

**Loguri cheie:**
- `[AutoReply][Trace] traceId=... incomingRemoteJid=... canonicalKey=... phoneDigits=... phoneE164=... canonicalThreadId=...`
- `[AutoReply][Trace] traceId=... threadDocPath=threads/... threadDocExists=...`
- `[AutoReply][Trace] traceId=... threadDocMissing attemptingFallback phoneDigits=...`
- `[AutoReply][Trace] traceId=... pickedExistingThread threadId=... phoneDigits=...`
- `[AutoReply][Trace] traceId=... threadDataLoaded actualThreadId=... exists=... pickedExisting=... hasFirstName=... hasDisplayName=...`
- `[AutoReply][Trace] traceId=... nameCheck hasName=... firstName=... displayName=... nameSource=...`
- `[AutoReply][Trace] traceId=... success actualThreadId=... pickedExistingThread=...`

### C) Fallback Anti-Duplicate

Când `threadDoc.exists=false`:
1. Dacă avem `phoneDigits` sau `phoneE164`, caută thread-uri existente
2. Alege thread-ul cu `lastRaw` cel mai recent
3. Folosește thread-ul existent în loc să creeze unul nou
4. Loghează `pickedExistingThread=true` pentru diagnosticare

### D) Actualizări în `maybeHandleAiAutoReply`

1. **Canonicalizare la început:**
   ```javascript
   const { canonicalKey, phoneDigits, phoneE164 } = await canonicalClientKey(remoteJid, accountId);
   const canonicalThreadId = canonicalKey ? buildCanonicalThreadId(accountId, canonicalKey) : null;
   let threadId = canonicalThreadId || saved?.threadId || (remoteJid ? `${accountId}__${remoteJid}` : null);
   ```

2. **Fallback când thread nu există:**
   ```javascript
   if (!threadDoc.exists && phoneDigits && canonicalThreadId) {
     const existing = await findExistingThreadByPhone(accountId, phoneDigits, phoneE164);
     if (existing.threadId) {
       actualThreadId = existing.threadId;
       threadData = existing.threadData;
       pickedExistingThread = true;
     }
   }
   ```

3. **Salvare phone info:**
   - Când se creează thread nou sau se actualizează, se salvează `phoneE164`, `phone`, `phoneNumber`
   - Astfel, următoarele căutări vor găsi thread-ul corect

## Pași de Testare

### Test 1: Contact Nou (fără firstName)
**Pași:**
1. Trimite mesaj de pe un număr nou către WhatsApp conectat
2. Verifică logurile pe server:
   ```bash
   ssh root@37.27.34.179 "journalctl -u whatsapp-backend --since '5 minutes ago' --no-pager | grep -E '\[Trace\].*traceId=' | tail -20"
   ```

**Loguri așteptate:**
- `[AutoReply][Trace] traceId=... incomingRemoteJid=... canonicalKey=... phoneDigits=...`
- `[AutoReply][Trace] traceId=... threadDocExists=false`
- `[AutoReply][Trace] traceId=... noExistingThreadFound willCreateNew` (sau `pickedExistingThread=true` dacă găsește)
- `[AutoReply][Trace] traceId=... needToAskName hasName=false`
- `[AutoReply][Trace] traceId=... askedForName threadId=...`

**Rezultat așteptat:**
- AI întreabă "Salut! Cum te numești?" o singură dată
- Numele este salvat pe thread-ul corect (canonicalThreadId)

### Test 2: Același Contact cu Variații (+40 vs 40)
**Pași:**
1. Trimite mesaj de pe `+40768098268@s.whatsapp.net`
2. Apoi trimite mesaj de pe `40768098268@s.whatsapp.net` (fără +)
3. Verifică logurile

**Loguri așteptate:**
- Ambele mesaje ar trebui să aibă același `canonicalKey=40768098268@s.whatsapp.net`
- Ambele mesaje ar trebui să folosească același `canonicalThreadId`
- `threadDocExists=true` pentru al doilea mesaj (sau `pickedExistingThread=true`)

**Rezultat așteptat:**
- Nu se creează thread nou
- Se folosește același thread doc pentru ambele mesaje

### Test 3: Caz @lid
**Pași:**
1. Trimite mesaj de pe un JID `@lid` (dacă există mapping)
2. Verifică logurile

**Loguri așteptate:**
- `[AutoReply][Trace] traceId=... incomingRemoteJid=...@lid canonicalKey=... phoneDigits=... phoneE164=...`
- Dacă mapping există: `canonicalKey=40768098268@s.whatsapp.net` (canonicalizat)
- Dacă mapping nu există: `canonicalKey=...@lid` (fallback)

**Rezultat așteptat:**
- Dacă mapping există: se folosește thread-ul canonicalizat (nu se creează duplicat)
- Dacă mapping nu există: se folosește `@lid`, dar se salvează `phoneE164` când este disponibil

## Comenzi pentru Verificare Loguri

### Verificare Loguri Recente (ultimele 5 minute)
```bash
ssh -i ~/.ssh/hetzner_whatsapp root@37.27.34.179 "journalctl -u whatsapp-backend --since '5 minutes ago' --no-pager | grep '\[Trace\]' | tail -30"
```

### Verificare pentru un Trace ID Specific
```bash
# După ce trimiți mesaj, copiază traceId din loguri și rulează:
ssh -i ~/.ssh/hetzner_whatsapp root@37.27.34.179 "journalctl -u whatsapp-backend --since '10 minutes ago' --no-pager | grep 'traceId=ABC123'"
```

### Verificare Canonicalizare
```bash
ssh -i ~/.ssh/hetzner_whatsapp root@37.27.34.179 "journalctl -u whatsapp-backend --since '5 minutes ago' --no-pager | grep -E 'canonicalKey|canonicalThreadId|pickedExistingThread' | tail -20"
```

### Verificare Name Check
```bash
ssh -i ~/.ssh/hetzner_whatsapp root@37.27.34.179 "journalctl -u whatsapp-backend --since '5 minutes ago' --no-pager | grep -E 'nameCheck|needToAskName|askedForName|savedContactName' | tail -20"
```

## Exemplu de Log "Bun"

```
[AutoReply][Trace] traceId=abc123 incomingRemoteJid=40768098268@s.whatsapp.net canonicalKey=40768098268@s.whatsapp.net phoneDigits=40768098268 phoneE164=+40768098268 canonicalThreadId=account_prod_...__40768098268@s.whatsapp.net computedThreadId=account_prod_...__40768098268@s.whatsapp.net
[AutoReply][Trace] traceId=abc123 entering try block accountId=... threadId=...
[AutoReply][Trace] traceId=abc123 firestoreQueriesCompleted threadDocPath=threads/account_prod_...__40768098268@s.whatsapp.net threadDocExists=true
[AutoReply][Trace] traceId=abc123 threadDataLoaded actualThreadId=... exists=true pickedExisting=false hasFirstName=true hasDisplayName=true hasPendingNameRequest=false hasPendingPreferredName=false
[AutoReply][Trace] traceId=abc123 nameCheck hasName=true firstName=Denisa displayName=Denisa Ursache pendingNameRequest=false pendingPreferredName=false nameSource=firstName
[AutoReply][Trace] traceId=abc123 settingsCheck accountId=... actualThreadId=... accountEnabled=true threadEnabled=false isAiEnabled=true accountPrompt=set
[AutoReply][Trace] traceId=abc123 allGatesPassed generatingReply actualThreadId=...
[AutoReply][Trace] traceId=abc123 promptSource=account promptLength=... promptHash=... nameSource=firstName
[AutoReply][Trace] traceId=abc123 success actualThreadId=... pickedExistingThread=false
```

## Modificări în Cod

### Funcții Noi Adăugate
- `normalizePhone(input)` - linia ~117
- `canonicalClientKey(remoteJid, accountId)` - linia ~125
- `buildCanonicalThreadId(accountId, canonicalKey)` - linia ~175
- `findExistingThreadByPhone(accountId, phoneDigits, phoneE164)` - linia ~185

### Modificări în `maybeHandleAiAutoReply`
- Linia ~775: Canonicalizare la început
- Linia ~980: Fallback când thread nu există
- Toate operațiunile de scriere folosesc `actualThreadId` în loc de `threadId`
- Logging complet cu `traceId` pentru fiecare pas

## Status Deploy

✅ **Deploy completat pe server** (Hetzner)
✅ **Serviciul repornit** - `whatsapp-backend.service` rulează
✅ **Sintaxă validă** - `node -c server.js` trece fără erori

## Următorii Pași

1. **Trimite mesaj de test** de pe un număr nou către WhatsApp conectat
2. **Verifică logurile** folosind comenzile de mai sus
3. **Confirmă că:**
   - `canonicalKey` este consistent pentru același contact
   - `pickedExistingThread=true` apare când se găsește thread existent
   - `nameSource` indică sursa corectă a numelui (firstName vs displayName)
   - Nu se creează duplicate pentru același telefon

## Note Importante

- **Backward compatibility**: Thread-urile existente continuă să funcționeze
- **Canonicalizare progresivă**: Thread-urile noi vor folosi formatul canonical, cele vechi vor fi migrate progresiv
- **Fallback inteligent**: Dacă thread-ul nu există, se caută unul existent înainte de a crea unul nou
- **Phone info salvat**: Când se creează thread nou, se salvează `phoneE164` pentru căutări viitoare
