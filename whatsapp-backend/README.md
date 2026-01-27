# WhatsApp Backend for SuperParty

Backend standalone pentru Hetzner care gestionează conexiunile WhatsApp folosind Baileys.

## Environment Variables

### Required

- `PORT`: Portul pe care rulează serverul (default: 8080 pe Hetzner)
- `FIREBASE_PROJECT_ID`: ID-ul proiectului Firebase
- `FIREBASE_PRIVATE_KEY`: Cheia privată Firebase (JSON escaped)
- `FIREBASE_CLIENT_EMAIL`: Email-ul clientului Firebase
- `WHATSAPP_BACKEND_URL`: URL-ul de bază al backend-ului (ex: `http://37.27.34.179:8080`) pentru callbacks

### Optional

- `LOGTAIL_SOURCE_TOKEN` sau `BETTER_STACK_SOURCE_TOKEN`: Token pentru remote logging (Logtail/Better Stack)
  - Dacă lipsește sau e invalid: remote logging este dezactivat automat, aplicația folosește doar console.log
  - Dacă apare eroare "Unauthorized": Logtail se dezactivează permanent pentru proces (circuit breaker)
- `WHATSAPP_CONNECT_TIMEOUT_MS`: Timeout pentru conexiune WhatsApp în milisecunde (default: 60000 = 60s)
  - Recomandat pentru producție: 180000-300000 (3-5 minute) pentru a permite scanarea QR
- `ADMIN_TOKEN`: Token pentru endpoint-uri protejate (default: generat random în dev)
- `SESSIONS_PATH`: Path pentru sesiunile Baileys (default: volume Hetzner sau local fallback)

## Deployment

### Hetzner

1. Deploy pe server Hetzner (systemd / Docker)
2. Setează environment variables (vezi mai sus)
3. `WHATSAPP_BACKEND_URL` = URL public al serverului (ex: `http://37.27.34.179:8080`)

### Local Development

```bash
npm install
npm run dev  # cu nodemon
# sau
npm start
```

## Logging

- **Console**: Logurile sunt întotdeauna scrise în console (stdout/stderr)
- **Remote (Logtail)**: Activ doar dacă `LOGTAIL_SOURCE_TOKEN` este setat și valid
  - Dacă token-ul lipsește sau e invalid: remote logging este dezactivat, fără erori
  - Dacă apare "Unauthorized": Logtail se dezactivează permanent (circuit breaker)

## Testing

```bash
npm test
```

## Health Check

- `GET /health`: Status general
- `GET /health/wa`: Status conexiuni WhatsApp
