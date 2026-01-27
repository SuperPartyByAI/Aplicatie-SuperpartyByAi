# Verificare Auto-Reply - Ghid Complet

## Status Actual

✅ **GROQ_API_KEY** - Setat corect pe server
✅ **Backend modificat** - Verifică setările din `accounts/{accountId}`
✅ **Logging adăugat** - Pentru debugging

## Cum să Verifici dacă Promptul este Setat

### Opțiunea 1: Din Flutter App (Recomandat)

1. Deschide aplicația Flutter
2. Mergi la: **WhatsApp → Inbox**
3. Selectează un cont WhatsApp din dropdown
4. Verifică cardul **"AI Auto‑Reply"**:
   - Dacă vezi switch-ul și prompt-ul → Setat ✅
   - Dacă vezi "Fără prompt setat" → Nu este setat ❌

### Opțiunea 2: Setează Promptul din Flutter

1. **WhatsApp → Inbox**
2. Selectează contul
3. În cardul "AI Auto‑Reply", apasă **iconița de setări** (⚙️)
4. În ecranul "Setări AI":
   - Activează **"AI activ"** (switch ON)
   - Adaugă un prompt, ex: `"Răspunde politicos, scurt și clar în română. Fii prietenos și oferă informații utile."`
   - Apasă **"Salvează"**
5. Revino la Inbox și activează switch-ul **"AI Auto‑Reply"**

## Cum să Testezi Auto-Reply

### Test Manual

1. **Activează auto-reply** (vezi mai sus)
2. **Trimite un mesaj** la numărul WhatsApp conectat (din alt telefon/WhatsApp)
3. **Așteaptă 5-10 secunde**
4. **Verifică** dacă primești un răspuns automat

### Verificare în Logs Backend

După ce trimiți un mesaj, verifică logs-urile:

```bash
ssh root@37.27.34.179
sudo journalctl -u whatsapp-backend -f | grep -E "ai-autoreply|ai-autoreply-check"
```

Ar trebui să vezi:
- `[ai-autoreply-check]` - Verificarea setărilor
- `🤖 [ai-autoreply]` - Răspunsul generat și trimis

## Troubleshooting

### Auto-reply nu funcționează

1. **Verifică că promptul este setat:**
   - Flutter → WhatsApp → Inbox → Selectează cont → Verifică "AI Auto‑Reply" card

2. **Verifică că switch-ul este ON:**
   - Cardul "AI Auto‑Reply" trebuie să aibă switch-ul activat

3. **Verifică logs backend:**
   ```bash
   ssh root@37.27.34.179
   sudo journalctl -u whatsapp-backend -n 100 --no-pager | grep -i "ai-autoreply"
   ```

4. **Verifică GROQ_API_KEY:**
   ```bash
   ssh root@37.27.34.179
   sudo cat /etc/whatsapp-backend/firebase-sa.env | grep GROQ
   ```

### Mesajul nu primește răspuns

- Verifică că mesajul este **1:1** (nu în grup)
- Verifică că mesajul este **text** (nu media)
- Verifică că nu ai trimis `stop` sau `dezactiveaza` (dezactivează auto-reply)
- Verifică logs pentru erori: `sudo journalctl -u whatsapp-backend -f`

## Structura Firestore

Setările se salvează în:
```
accounts/{accountId}:
  autoReplyEnabled: true/false
  autoReplyPrompt: "prompt text here"
```

Backend-ul verifică:
1. `accounts/{accountId}.autoReplyEnabled` → Activează auto-reply pentru toate thread-urile
2. `accounts/{accountId}.autoReplyPrompt` → Prompt-ul folosit pentru toate thread-urile
3. `threads/{threadId}.aiEnabled` → Override per thread (opțional)
4. `threads/{threadId}.aiSystemPrompt` → Override prompt per thread (opțional)

## Test Rapid

1. **Activează** auto-reply din Flutter (switch ON + prompt setat)
2. **Trimite mesaj** la numărul WhatsApp
3. **Verifică logs:**
   ```bash
   ssh root@37.27.34.179 "sudo journalctl -u whatsapp-backend --since '1 minute ago' --no-pager | grep -E 'ai-autoreply|🤖'"
   ```

Dacă vezi `🤖 [ai-autoreply]` în logs → **Funcționează!** ✅
