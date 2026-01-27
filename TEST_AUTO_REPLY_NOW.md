# Test Auto-Reply - Pași Rapizi

## ✅ Ce este Configurat

1. ✅ **GROQ_API_KEY** - Setat pe server
2. ✅ **Backend modificat** - Verifică `accounts/{accountId}.autoReplyEnabled`
3. ✅ **Logging activat** - Vei vedea `[ai-autoreply-check]` în logs

## 🧪 Test Rapid

### Pasul 1: Verifică în Flutter App

1. Deschide aplicația Flutter
2. **WhatsApp → Inbox**
3. Selectează contul: `account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443`
4. Verifică cardul **"AI Auto‑Reply"**:
   - Dacă vezi "Fără prompt setat" → **Setează prompt-ul** (vezi Pasul 2)
   - Dacă vezi prompt-ul → **Activează switch-ul** (ON)

### Pasul 2: Setează Promptul (dacă nu este setat)

1. În cardul "AI Auto‑Reply", apasă **iconița de setări** (⚙️)
2. Activează **"AI activ"** (switch ON)
3. Adaugă prompt: `"Răspunde politicos, scurt și clar în română. Fii prietenos."`
4. Apasă **"Salvează"**
5. Revino la Inbox și activează switch-ul **"AI Auto‑Reply"** (ON)

### Pasul 3: Trimite Mesaj de Test

1. **Din alt telefon/WhatsApp**, trimite un mesaj la numărul WhatsApp conectat
2. Mesajul trebuie să fie:
   - **Text simplu** (nu media, nu grup)
   - **1:1 conversație**
   - **Nu** `stop` sau `dezactiveaza`

### Pasul 4: Verifică Logs

În terminal, rulează:

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
./scripts/hetzner/watch-auto-reply.sh
```

Sau manual:
```bash
ssh -i ~/.ssh/hetzner_whatsapp root@37.27.34.179 "sudo journalctl -u whatsapp-backend -f --no-pager" | grep -E "ai-autoreply|🤖"
```

### Ce să Cauți în Logs

**Dacă promptul NU este setat:**
```
[ai-autoreply-check] ... accountEnabled=false ... isAiEnabled=false
[ai-autoreply] Skipping - not enabled
```

**Dacă promptul ESTE setat și funcționează:**
```
[ai-autoreply-check] ... accountEnabled=true ... isAiEnabled=true accountPrompt=set
🤖 [ai-autoreply] account=... thread=... replyLen=... latencyMs=...
```

## 🔍 Verificare Rapidă - Status Actual

Rulează pentru a vedea status-ul:

```bash
ssh -i ~/.ssh/hetzner_whatsapp root@37.27.34.179 "sudo journalctl -u whatsapp-backend --since '10 minutes ago' --no-pager | grep -E 'ai-autoreply|🤖' | tail -10"
```

Dacă nu vezi nimic → Auto-reply nu a fost activat încă sau nu au venit mesaje.

## 📝 Rezumat

**Pentru ca auto-reply să funcționeze, trebuie:**

1. ✅ GROQ_API_KEY setat (DONE)
2. ⚠️ `accounts/{accountId}.autoReplyEnabled = true` (verifică în Flutter)
3. ⚠️ `accounts/{accountId}.autoReplyPrompt = "..."` (verifică în Flutter)
4. ⚠️ Mesaj primit (trimite un mesaj de test)

**Verifică în Flutter app dacă promptul este setat!**
