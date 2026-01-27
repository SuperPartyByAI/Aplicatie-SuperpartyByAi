# Deploy chatEventOps on Hetzner

## Env vars (no secrets in repo)
Add to your systemd EnvironmentFile (currently `/etc/whatsapp-backend/firebase-sa.env`):

```
GROQ_API_KEY=...
ADMIN_EMAILS=admin1@example.com,admin2@example.com
GOOGLE_APPLICATION_CREDENTIALS=/etc/whatsapp-backend/firebase-sa.json
```

## Install dependency
On the server (in `/opt/whatsapp/whatsapp-backend`):

```
npm install groq-sdk
```

## Restart service
```
sudo systemctl restart whatsapp-backend
sudo systemctl status whatsapp-backend --no-pager
```

## Smoke test (replace TOKEN)
```
curl -sS -X POST http://127.0.0.1:8080/api/ai/chatEventOps \
  -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"text":"listeaza ultimele 2 evenimente","dryRun":true}'
```

Expected JSON: `{ ok: true, action: "LIST", items: [...] }`.
