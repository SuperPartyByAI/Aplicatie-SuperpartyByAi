# AI Auto-Reply (WhatsApp)

## Overview
Auto-reply is triggered for **inbound 1:1** messages only (no groups, no status).
It runs inside `messages.upsert` on Hetzner and replies via Baileys.

## Enable per thread
Set this on the thread doc in Firestore:

```
threads/{threadId}:
  aiEnabled: true
  aiSystemPrompt: "Custom prompt (optional)"
```

Default behavior is **disabled** when `aiEnabled` is missing or false.

## Stop command
If user sends `stop` or `dezactiveaza`, backend sets:
```
aiEnabled = false
```

## Env vars
- `GROQ_API_KEY` (required)
- `AI_DEFAULT_SYSTEM_PROMPT` (optional)

## Notes
- Fresh window: only replies to messages within last 2 minutes.
- Dedupe by waMessageId with TTL.
- Rate limit: 1 reply per thread per 10s.
