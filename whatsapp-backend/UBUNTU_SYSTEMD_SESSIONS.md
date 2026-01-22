# Ubuntu/systemd session persistence

Goal: keep WhatsApp sessions stable across restarts without QR re-pairing.

## Recommended setup

- **SESSIONS_PATH**: a persistent, writable directory.
- Suggested path: `/var/lib/whatsapp-backend/sessions`
- Service user must have read/write permissions.

## Quick setup (Ubuntu)

```bash
SVC="whatsapp-backend"
SVC_USER="$(systemctl show "$SVC" -p User --value || true)"
[ -z "$SVC_USER" ] && SVC_USER="root"
SVC_GRP="$(id -gn "$SVC_USER" 2>/dev/null || echo "$SVC_USER")"

sudo install -d -o "$SVC_USER" -g "$SVC_GRP" -m 750 /var/lib/whatsapp-backend/sessions

sudo install -d /etc/systemd/system/${SVC}.service.d
sudo tee /etc/systemd/system/${SVC}.service.d/override.conf >/dev/null <<'OVR'
[Service]
Environment="SESSIONS_PATH=/var/lib/whatsapp-backend/sessions"
Environment="INSTANCE_ID=%H"
TimeoutStopSec=30
KillSignal=SIGINT
OVR

# /etc/whatsapp-backend/env
SESSIONS_PATH=/var/lib/whatsapp-backend/sessions
```

Restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart whatsapp-backend
```

## Existing sessions migration (fallback → persistent)

If the backend previously used the fallback `.baileys_auth` directory, move sessions into the
persistent `SESSIONS_PATH` to avoid QR re-pairing after restart:

```bash
SVC="whatsapp-backend"
NEW="/var/lib/whatsapp-backend/sessions"
U="$(systemctl show "$SVC" -p User --value || true)"
[ -z "$U" ] && U=root
WD="$(systemctl show "$SVC" -p WorkingDirectory --value || true)"
[ -z "$WD" ] && WD="/opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend"
OLD="$WD/.baileys_auth"

sudo install -d -o "$U" -g "$U" -m 750 "$NEW"
if [ -d "$OLD" ]; then
  sudo rsync -a "$OLD"/ "$NEW"/
  sudo chown -R "$U":"$U" "$NEW"
fi

sudo install -d /etc/systemd/system/${SVC}.service.d
sudo tee /etc/systemd/system/${SVC}.service.d/20-sessions.conf >/dev/null <<'OVR'
[Service]
Environment="SESSIONS_PATH=/var/lib/whatsapp-backend/sessions"
OVR

sudo systemctl daemon-reload
sudo systemctl restart whatsapp-backend
```

Verification (metadata only):

```bash
SESS="/var/lib/whatsapp-backend/sessions"
echo "creds.json_count=$(find "$SESS" -maxdepth 3 -name creds.json 2>/dev/null | wc -l | tr -d ' ')"
```

## Health signals to watch

- `/health` → `sessions_dir_writable=true` and HTTP 200  
- `/health` → `waMode=active` and lock holder is this instance  
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
