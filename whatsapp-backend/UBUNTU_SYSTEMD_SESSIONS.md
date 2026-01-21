# Ubuntu/systemd session persistence

Goal: keep WhatsApp sessions stable across restarts without QR re-pairing.

## Recommended setup

- **SESSIONS_PATH**: a persistent, writable directory.
- Suggested path: `/var/lib/whatsapp-backend/sessions`
- Service user must have read/write permissions.

## Quick setup (Ubuntu)

```bash
sudo mkdir -p /var/lib/whatsapp-backend/sessions
sudo chown -R root:root /var/lib/whatsapp-backend/sessions
sudo chmod 750 /var/lib/whatsapp-backend/sessions

# /etc/whatsapp-backend/env
SESSIONS_PATH=/var/lib/whatsapp-backend/sessions
```

Restart:

```bash
sudo systemctl restart whatsapp-backend
```

## Health signals to watch

- `/health` → `sessions_dir_writable=true` and HTTP 200  
- Logs should include:
  - `Session restored from disk` (normal restart)
  - `Session restored from Firestore` (after redeploy/crash)
  - No `needs_qr` immediately after restart for connected accounts

## Troubleshooting

- If `/health` returns 503:
  - check `SESSIONS_PATH` exists and is writable
  - check mount/volume path (if using a volume)
- If QR is required after restart:
  - verify sessions directory contains per-account `creds.json`
  - verify Firestore is available for fallback restore
