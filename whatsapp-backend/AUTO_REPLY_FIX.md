# Auto-Reply Fix - Account-Level Settings

## Problemă Identificată

Auto-reply-ul nu funcționa deoarece exista o discrepanță între unde se salvează și unde se citesc setările:

1. **Flutter/API salvează** în `accounts/{accountId}`:
   - `autoReplyEnabled` (boolean)
   - `autoReplyPrompt` (string)

2. **Backend citește** doar din `threads/{threadId}`:
   - `aiEnabled` (boolean)
   - `aiSystemPrompt` (string)

Backend-ul nu folosea setările din `accounts/{accountId}`, deci auto-reply-ul nu funcționa când era activat din Flutter.

## Soluție Implementată

Modificat funcția `maybeHandleAiAutoReply()` în `server.js` să verifice:

1. **Setări la nivel de account** (`accounts/{accountId}`):
   - `autoReplyEnabled` - activează/dezactivează auto-reply pentru toate thread-urile
   - `autoReplyPrompt` - prompt-ul AI pentru toate thread-urile

2. **Setări la nivel de thread** (`threads/{threadId}`) - pentru override:
   - `aiEnabled` - poate dezactiva auto-reply pentru un thread specific
   - `aiSystemPrompt` - poate seta un prompt diferit pentru un thread specific

### Prioritate

- **AI Enabled**: Thread-level override SAU account-level (dacă thread nu are setare)
- **Prompt**: Thread prompt > Account prompt > Env `AI_DEFAULT_SYSTEM_PROMPT` > Default hardcodat

## Configurare Necesară

### 1. GROQ API Key (obligatoriu)

Backend-ul folosește Groq API (gratuit) pentru AI. Setează în environment variables:

```bash
GROQ_API_KEY=your_groq_api_key_here
```

Obține cheie gratuită de la: https://console.groq.com/

### 2. AI Default Prompt (opțional)

Poți seta un prompt default pentru toate account-urile:

```bash
AI_DEFAULT_SYSTEM_PROMPT="Ești un asistent WhatsApp. Răspunzi politicos, scurt și clar în română."
```

## Cum Funcționează Acum

1. **Din Flutter**: Activează "AI Auto‑Reply" switch și setează prompt-ul
   - Se salvează în `accounts/{accountId}` cu `autoReplyEnabled: true` și `autoReplyPrompt: "..."`

2. **Backend**: Când primește un mesaj:
   - Verifică `accounts/{accountId}.autoReplyEnabled`
   - Dacă este `true`, generează răspuns cu AI folosind `autoReplyPrompt`
   - Trimite răspunsul automat

3. **Stop Command**: Utilizatorul poate trimite `stop` sau `dezactiveaza` pentru a dezactiva auto-reply pentru thread-ul respectiv

## Verificare

După deploy, verifică în logs:
```
🤖 [ai-autoreply] account=... thread=... replyLen=... latencyMs=...
```

Dacă vezi acest log, auto-reply-ul funcționează!

## Notă

- Auto-reply răspunde doar la mesaje 1:1 (nu în grupuri)
- Rate limit: 1 răspuns per thread per 10 secunde
- Fresh window: doar mesaje din ultimele 2 minute
- Dedupe: nu răspunde de două ori la același mesaj
