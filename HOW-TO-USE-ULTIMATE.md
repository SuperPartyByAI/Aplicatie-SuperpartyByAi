# 📖 Cum să Folosești TIER ULTIMATE 1

## 🎯 Ghid Rapid de Utilizare

---

## 1️⃣ TRIMITERE MESAJ SIMPLU (cu comportament uman)

### API Call:
```bash
curl -X POST http://localhost:3000/api/whatsapp/send/acc1/1234567890@s.whatsapp.net \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, how are you?",
    "options": {
      "useBehavior": true
    }
  }'
```

### Ce se întâmplă:
1. ✅ Delay random (500ms-2s) înainte de typing
2. ✅ Typing indicator (composing)
3. ✅ Typing duration bazat pe lungime mesaj
4. ✅ Pause indicator
5. ✅ Mesaj trimis
6. ✅ Rate limiter verifică limite
7. ✅ Circuit breaker înregistrează succes

---

## 2️⃣ TRIMITERE MESAJ CU VARIAȚIE (anti-spam)

### API Call:
```bash
curl -X POST http://localhost:3000/api/whatsapp/send/acc1/1234567890@s.whatsapp.net \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello {{name}}, how are you?",
    "options": {
      "useBehavior": true,
      "useVariation": true,
      "template": "Hello {{name}}, how are you?",
      "variables": {
        "name": "John"
      },
      "variationOptions": {
        "addEmoji": true,
        "emojiType": "happy",
        "addStarter": true
      }
    }
  }'
```

### Exemple de Variații Generate:
```
1. "Hi John, how are you? 😊"
2. "Hey John, how are you doing?"
3. "Just wanted to say, greetings John, how are you feeling?"
4. "Good day John, how are things? 🙂"
```

---

## 3️⃣ TRIMITERE BULK (mai multe destinatari)

### API Call:
```bash
curl -X POST http://localhost:3000/api/whatsapp/send-bulk/acc1 \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": [
      {
        "jid": "1234567890@s.whatsapp.net",
        "name": "John",
        "firstName": "John"
      },
      {
        "jid": "0987654321@s.whatsapp.net",
        "name": "Jane",
        "firstName": "Jane"
      },
      {
        "jid": "5555555555@s.whatsapp.net",
        "name": "Bob",
        "firstName": "Bob"
      }
    ],
    "template": "Hello {{name}}, how are you today?",
    "options": {
      "accountAge": "normal",
      "priority": 0,
      "variables": {
        "time": "morning"
      }
    }
  }'
```

### Ce se întâmplă:
1. ✅ Generează mesaje unice pentru fiecare destinatar
2. ✅ Aplică variații (sinonime, punctuație, emoji)
3. ✅ Verifică rate limiting pentru fiecare mesaj
4. ✅ Trimite cu comportament uman (typing, delays)
5. ✅ Queue automat dacă rate limit atins
6. ✅ Circuit breaker monitorizează fiecare trimitere

### Response:
```json
{
  "success": true,
  "results": [
    {
      "jid": "1234567890@s.whatsapp.net",
      "success": true
    },
    {
      "jid": "0987654321@s.whatsapp.net",
      "success": true,
      "queued": true,
      "messageId": "1234567890-0.123"
    },
    {
      "jid": "5555555555@s.whatsapp.net",
      "success": true
    }
  ]
}
```

---

## 4️⃣ VERIFICARE STATISTICI

### Toate Statisticile ULTIMATE:
```bash
curl http://localhost:3000/api/ultimate/stats
```

### Response:
```json
{
  "success": true,
  "tier": "ULTIMATE 1",
  "modules": {
    "behavior": {
      "activePresenceSimulations": 2,
      "trackedRecipients": 15,
      "config": { ... }
    },
    "rateLimiter": {
      "acc1": {
        "age": "normal",
        "messagesLastHour": 12,
        "queueLength": 3,
        "processing": true
      }
    },
    "messageVariation": {
      "accounts": 2,
      "totalRecipients": 15,
      "totalMessages": 45
    },
    "circuitBreaker": {
      "stats": {
        "total": 2,
        "closed": 2,
        "open": 0,
        "halfOpen": 0
      },
      "states": {
        "acc1": {
          "state": "CLOSED",
          "healthScore": 100,
          "failureRate": 0
        }
      }
    }
  }
}
```

---

## 5️⃣ VERIFICARE RATE LIMITER

### Check Queue Status:
```bash
curl http://localhost:3000/api/ultimate/rate-limiter
```

### Response:
```json
{
  "success": true,
  "stats": {
    "acc1": {
      "age": "normal",
      "messagesLastHour": [1735401234567, 1735401245678, ...],
      "messagesLastDay": [...],
      "queueLength": 3,
      "processing": true,
      "backoffUntil": 0
    }
  }
}
```

---

## 6️⃣ VERIFICARE CIRCUIT BREAKER

### Check Health:
```bash
curl http://localhost:3000/api/ultimate/circuit-breaker
```

### Response:
```json
{
  "success": true,
  "stats": {
    "total": 2,
    "closed": 2,
    "open": 0,
    "halfOpen": 0,
    "totalFailures": 5,
    "totalSuccesses": 150
  },
  "states": {
    "acc1": {
      "accountId": "acc1",
      "state": "CLOSED",
      "healthScore": 100,
      "failureRate": 0,
      "recentFailures": 0,
      "recentSuccesses": 50,
      "totalFailures": 2,
      "totalSuccesses": 150,
      "lastFailureTime": 1735401234567,
      "timeSinceLastFailure": 300000
    }
  }
}
```

---

## 7️⃣ CONFIGURARE ACCOUNT AGE

### Pentru conturi noi (< 7 zile):
```bash
curl -X POST http://localhost:3000/api/whatsapp/send-bulk/acc1 \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": [...],
    "template": "...",
    "options": {
      "accountAge": "new"
    }
  }'
```

**Limite:**
- 20 mesaje/oră
- 100 mesaje/zi
- 3 burst size
- 3s delay minim

### Pentru conturi normale (7-30 zile):
```bash
"options": { "accountAge": "normal" }
```

**Limite:**
- 50 mesaje/oră
- 300 mesaje/zi
- 5 burst size
- 2s delay minim

### Pentru conturi stabilite (> 30 zile):
```bash
"options": { "accountAge": "established" }
```

**Limite:**
- 100 mesaje/oră
- 600 mesaje/zi
- 10 burst size
- 1s delay minim

---

## 8️⃣ TEMPLATE EXAMPLES

### Template Simplu:
```
"Hello {{name}}, how are you?"
```

### Template cu Timp:
```
"Good {{time}} {{name}}, hope you're having a great {{day}}!"
```

**Variabile disponibile:**
- `{{name}}` - Numele complet
- `{{firstName}}` - Prenumele
- `{{time}}` - morning/afternoon/evening (automat)
- `{{day}}` - Monday/Tuesday/etc (automat)
- `{{date}}` - MM/DD/YYYY (automat)

### Template Complex:
```
"Hey {{firstName}}! 👋

Just wanted to reach out and see how things are going.

Hope you're having a great {{day}}!

Best regards"
```

---

## 9️⃣ BEST PRACTICES

### ✅ DO:
1. **Folosește `useBehavior: true`** pentru toate mesajele
2. **Folosește `useVariation: true`** pentru bulk messages
3. **Setează `accountAge`** corect pentru fiecare cont
4. **Verifică queue status** periodic
5. **Monitorizează circuit breaker** pentru probleme
6. **Folosește templates** pentru mesaje repetitive
7. **Adaugă delays** între bulk sends (automat)

### ❌ DON'T:
1. **Nu trimite** același mesaj la mai mulți destinatari fără variație
2. **Nu ignora** rate limiting warnings
3. **Nu forța** trimiterea când circuit breaker e OPEN
4. **Nu trimite** mai mult de limita contului
5. **Nu folosești** mesaje prea scurte (< 10 caractere)
6. **Nu trimite** burst-uri mari (> 10 mesaje/minut)

---

## 🔟 TROUBLESHOOTING

### Problema: Mesaje în Queue
**Cauză:** Rate limiting activ  
**Soluție:** Așteaptă procesarea automată sau verifică limite

```bash
curl http://localhost:3000/api/ultimate/rate-limiter
```

### Problema: Circuit Breaker OPEN
**Cauză:** Prea multe erori (5+)  
**Soluție:** Așteaptă 60s pentru auto-recovery sau verifică conexiunea

```bash
curl http://localhost:3000/api/ultimate/circuit-breaker
```

### Problema: Mesaje identice
**Cauză:** `useVariation: false` sau template lipsă  
**Soluție:** Activează variație și folosește template

```bash
curl -X POST ... -d '{
  "options": {
    "useVariation": true,
    "template": "Hello {{name}}"
  }
}'
```

### Problema: Rate Limit Hit
**Cauză:** Prea multe mesaje prea repede  
**Soluție:** Verifică `accountAge` și reduce frecvența

```bash
# Check current limits
curl http://localhost:3000/api/ultimate/rate-limiter

# Adjust accountAge
"options": { "accountAge": "established" }
```

---

## 📊 MONITORING

### Health Check:
```bash
curl http://localhost:3000/
```

### Metrics:
```bash
curl http://localhost:3000/api/metrics
```

### Events:
```bash
curl http://localhost:3000/api/events?limit=50
```

### ULTIMATE Stats:
```bash
curl http://localhost:3000/api/ultimate/stats
```

---

## 🎯 EXEMPLE COMPLETE

### Exemplu 1: Campanie Marketing (50 destinatari)

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-bulk/acc1 \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": [
      {"jid":"1@s.whatsapp.net","name":"John","firstName":"John"},
      {"jid":"2@s.whatsapp.net","name":"Jane","firstName":"Jane"},
      ... (48 more)
    ],
    "template": "Hi {{firstName}}! 👋\n\nWe have a special offer for you today.\n\nCheck it out: https://example.com\n\nBest regards,\nTeam",
    "options": {
      "accountAge": "established",
      "priority": 1,
      "variationOptions": {
        "addEmoji": true,
        "emojiType": "celebration"
      }
    }
  }'
```

**Rezultat:**
- ✅ 50 mesaje unice generate
- ✅ Rate limiting automat (1s delay între mesaje)
- ✅ Queue automat dacă limita atinsă
- ✅ Comportament uman pentru fiecare mesaj
- ✅ Circuit breaker monitorizează

### Exemplu 2: Follow-up Personal (1 destinatar)

```bash
curl -X POST http://localhost:3000/api/whatsapp/send/acc1/1234567890@s.whatsapp.net \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hey John, just following up on our conversation yesterday. Let me know if you have any questions!",
    "options": {
      "useBehavior": true,
      "behaviorOptions": {
        "skipBeforeDelay": false
      }
    }
  }'
```

**Rezultat:**
- ✅ Delay 500ms-2s înainte de typing
- ✅ Typing indicator 3-5s
- ✅ Mesaj trimis
- ✅ Read receipt pentru răspuns

---

## 🚀 DEPLOYMENT

### Railway (Automatic):
```bash
git push origin main
# Automatic deploy
# Check: https://your-app.railway.app/
```

### Local:
```bash
npm start
# Check: http://localhost:3000/
```

---

## 📞 SUPPORT

### Check Logs:
```bash
# Railway
railway logs

# Local
npm start
```

### Check Health:
```bash
curl http://localhost:3000/
```

### Check ULTIMATE:
```bash
curl http://localhost:3000/api/ultimate/stats
```

---

**Versiune:** 4.0.0  
**TIER:** ULTIMATE 1  
**Status:** ✅ PRODUCTION READY

🎉 **Enjoy your new WhatsApp system!**
