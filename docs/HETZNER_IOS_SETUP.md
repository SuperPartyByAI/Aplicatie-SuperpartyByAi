# Ghid complet: SSH + Hetzner setup 100% de pe iPhone (fără macOS)

Setare cheie SSH, configurare Blink Shell / iSH, și bootstrap complet pe serverul Hetzner. Toate comenzile sunt copy-paste pe iPhone.

---

## Placeholders (înlocuiește înainte de rulare)

| Variabilă | Exemplu | Descriere |
|-----------|---------|-----------|
| `HETZNER_IP` | `1.2.3.4` | IP-ul serverului Hetzner |
| `REPO_URL` | `https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi.git` | URL clone (HTTPS sau SSH) |
| `REPO_DIR` | `/opt/superparty` | Directorul în care se clonează repo-ul |
| `BACKEND_DIR` | `/opt/superparty/whatsapp-backend` | Calea către `whatsapp-backend` |
| `DEPLOY_USER` | `deploy` | User creat pe server |
| `SERVICE_NAME` | `whatsapp-backend` | Numele serviciului systemd |
| `PORT` | `8080` | Portul backend-ului |
| `AUTO_BACKFILL_ENABLED` | `true` | Activează auto-backfill |
| `AUTO_BACKFILL_INTERVAL_MS` | `1800000` | Interval periodic (30 min) |
| `AUTO_BACKFILL_COOLDOWN_MS` | `21600000` | Cooldown success (6 h) |

---

## A) Blink Shell (iOS) – preferat

Blink include OpenSSH / `ssh-keygen`. Nu necesită instalare suplimentară.

### 1. Verificare chei existente

Rulează:

```bash
ls -la ~/.ssh/superparty_hetzner_ed25519 ~/.ssh/superparty_hetzner_ed25519.pub 2>/dev/null || true
ls -la ~/.ssh/id_ed25519 ~/.ssh/id_ed25519.pub 2>/dev/null || true
```

- Dacă există **`~/.ssh/superparty_hetzner_ed25519`** sau **`~/.ssh/id_ed25519`**: nu regenerezi. Treci la pasul 2.
- Dacă **nu** există niciuna: treci la pasul „Generare cheie”.

### 2. Afișare public key (dacă există cheie)

Preferat `superparty_hetzner_ed25519`:

```bash
if [ -f ~/.ssh/superparty_hetzner_ed25519.pub ]; then
  cat ~/.ssh/superparty_hetzner_ed25519.pub
elif [ -f ~/.ssh/id_ed25519.pub ]; then
  cat ~/.ssh/id_ed25519.pub
else
  echo "Nicio cheie gasita. Genereaza una (vezi Generare cheie)."
fi
```

Copiază outputul (o singură linie, începe cu `ssh-ed25519 ...`). Îl vei adăuga în Hetzner.

### 3. Generare cheie (dacă lipsește)

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -f ~/.ssh/superparty_hetzner_ed25519 -C "superparty-hetzner-iphone"
```

- La „Enter passphrase” pune o parolă (obligatoriu).
- La „Enter same passphrase again” repetă parola.

Apoi afișează cheia publică:

```bash
cat ~/.ssh/superparty_hetzner_ed25519.pub
```

Copiază linia întreagă.

---

### 4. Configurare SSH (`~/.ssh/config`)

Înlocuiește `___HETZNER_IP___` cu IP-ul tău. Dacă ai adăugat deja `Host superparty-hetzner`, șterge liniile vechi din `~/.ssh/config` înainte să rulezi din nou (altfel apar duplicate).

```bash
mkdir -p ~/.ssh
printf '%s\n' 'Host superparty-hetzner' '  HostName ___HETZNER_IP___' '  User root' '  IdentityFile ~/.ssh/superparty_hetzner_ed25519' '  IdentitiesOnly yes' >> ~/.ssh/config
```

Dacă folosești `id_ed25519` în loc de `superparty_hetzner_ed25519`:

```bash
printf '%s\n' 'Host superparty-hetzner' '  HostName ___HETZNER_IP___' '  User root' '  IdentityFile ~/.ssh/id_ed25519' '  IdentitiesOnly yes' >> ~/.ssh/config
```

Apoi:

```bash
chmod 600 ~/.ssh/config
```

### 5. ⏸️ PAUZĂ – Adăugare cheie SSH în Hetzner (manual)

1. Deschide **Hetzner Cloud Console**: https://console.hetzner.cloud/
2. Proiect → **Security** → **SSH Keys** → **Add SSH Key**.
3. Nume: ex. `iPhone-Blink`.
4. Key: lipește **cheia publică** (outputul de la `cat ~/.ssh/...pub`).
5. Salvează.

Apoi atașează cheia la serverul tău:

- **Servers** → selectează serverul → **Rescue** / **ISO** nu e nevoie.
- La **Create Server** ai ales deja o cheie SSH; dacă serverul există, adaugă cheia în **Security** → **SSH Keys** și asigură-te că e asociată la acel server (sau recreează serverul cu noua cheie).

Dacă ai acces **root** pe server doar cu parolă (fără SSH key), mai întâi pune cheia în **Project → SSH Keys**, apoi conectează-te cu parolă o singură dată și adaugă manual `~/.ssh/authorized_keys` pe server. Ghidul presupune că ai setat deja cheia în Hetzner și poți face `ssh root@IP`.

### 6. Test SSH

```bash
ssh superparty-hetzner "echo ok"
```

Dacă apare `ok`, conexiunea merge. La prima conexiune acceptă fingerprint-ul (`yes`).

---

## B) iSH (iOS) – Alpine Linux

iSH nu include OpenSSH. Instalezi `openssh` și configurezi `~/.ssh`.

### 1. Instalare OpenSSH și setup `~/.ssh`

```bash
apk add openssh-client openssh-keygen
mkdir -p ~/.ssh
chmod 700 ~/.ssh
```

### 2. Verificare chei existente

```bash
ls -la ~/.ssh/superparty_hetzner_ed25519 ~/.ssh/superparty_hetzner_ed25519.pub 2>/dev/null || true
ls -la ~/.ssh/id_ed25519 ~/.ssh/id_ed25519.pub 2>/dev/null || true
```

- Dacă există una dintre perechi: nu regenerezi, treci la afișare public key.
- Dacă nu: treci la generare.

### 3. Afișare public key (dacă există)

```bash
if [ -f ~/.ssh/superparty_hetzner_ed25519.pub ]; then
  cat ~/.ssh/superparty_hetzner_ed25519.pub
elif [ -f ~/.ssh/id_ed25519.pub ]; then
  cat ~/.ssh/id_ed25519.pub
else
  echo "Nicio cheie gasita. Genereaza una."
fi
```

Copiază linia. O folosești în Hetzner.

### 4. Generare cheie (dacă lipsește)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/superparty_hetzner_ed25519 -C "superparty-hetzner-iphone"
```

Parolă la prompt. Apoi:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/superparty_hetzner_ed25519
chmod 644 ~/.ssh/superparty_hetzner_ed25519.pub
cat ~/.ssh/superparty_hetzner_ed25519.pub
```

### 5. Config SSH și test

Înlocuiește `___HETZNER_IP___`:

```bash
printf '%s\n' 'Host superparty-hetzner' '  HostName ___HETZNER_IP___' '  User root' '  IdentityFile ~/.ssh/superparty_hetzner_ed25519' '  IdentitiesOnly yes' >> ~/.ssh/config
chmod 600 ~/.ssh/config
```

Adaugă cheia în Hetzner (vezi **A) Pasul 5**), apoi:

```bash
ssh superparty-hetzner "echo ok"
```

---

## C) Bootstrap remote (rulat de pe iPhone prin SSH)

Bootstrap-ul creează user `deploy`, instalează git/curl/ufw, Node 20, clonează repo-ul, configurează systemd și ENV pentru auto-backfill, și verifică `/ready`.

### Setare variabile (Blink sau iSH)

Rulează înainte de comanda `ssh ... <<SCRIPT` (în același terminal). Înlocuiește valorile:

```bash
export HETZNER_IP="___"
export REPO_URL="___"
export REPO_DIR="/opt/superparty"
export BACKEND_DIR="/opt/superparty/whatsapp-backend"
export DEPLOY_USER="deploy"
export SERVICE_NAME="whatsapp-backend"
export PORT="8080"
export AUTO_BACKFILL_ENABLED="true"
export AUTO_BACKFILL_INTERVAL_MS="1800000"
export AUTO_BACKFILL_COOLDOWN_MS="21600000"
```

Exemplu:

```bash
export HETZNER_IP="1.2.3.4"
export REPO_URL="https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi.git"
export REPO_DIR="/opt/superparty"
export BACKEND_DIR="/opt/superparty/whatsapp-backend"
export DEPLOY_USER="deploy"
export SERVICE_NAME="whatsapp-backend"
export PORT="8080"
export AUTO_BACKFILL_ENABLED="true"
export AUTO_BACKFILL_INTERVAL_MS="1800000"
export AUTO_BACKFILL_COOLDOWN_MS="21600000"
```

### Rulare bootstrap (o singură comandă)

Conectează-te cu **root** (ex. `root@${HETZNER_IP}` sau `superparty-hetzner` dacă ai config). Scriptul e idempotent: user/repo/service existente nu cauzează erori; dacă repo există face `git pull`, altfel `git clone`; service este restartat.

**Copiază blocul următor integral** (de la `ssh` până la `SCRIPT` inclusiv). Folosește **`<<SCRIPT`** (fără ghilimele), ca variabilele exportate să fie expandate în script. Dacă ai `Host superparty-hetzner` în `~/.ssh/config`, poți rula `ssh superparty-hetzner 'bash -s' <<SCRIPT` în loc de `ssh root@"${HETZNER_IP}"`.

```bash
ssh root@"${HETZNER_IP}" 'bash -s' <<SCRIPT
set -e
REPO_URL="${REPO_URL}"
REPO_DIR="${REPO_DIR}"
BACKEND_DIR="${BACKEND_DIR}"
DEPLOY_USER="${DEPLOY_USER}"
SERVICE_NAME="${SERVICE_NAME}"
PORT="${PORT}"
AUTO_BACKFILL_ENABLED="${AUTO_BACKFILL_ENABLED}"
AUTO_BACKFILL_INTERVAL_MS="${AUTO_BACKFILL_INTERVAL_MS}"
AUTO_BACKFILL_COOLDOWN_MS="${AUTO_BACKFILL_COOLDOWN_MS}"

echo "[bootstrap] Update apt..."
apt-get update -qq

echo "[bootstrap] Install git, curl, ufw, build-essential..."
apt-get install -y -qq git curl ufw build-essential

echo "[bootstrap] Create user $DEPLOY_USER (idempotent)..."
id $DEPLOY_USER >/dev/null 2>&1 || useradd -m -s /bin/bash $DEPLOY_USER
(grep -qE "^${DEPLOY_USER}.*sudo$|^${DEPLOY_USER}.*wheel$" /etc/group) || usermod -aG sudo $DEPLOY_USER 2>/dev/null || usermod -aG wheel $DEPLOY_USER 2>/dev/null || true

echo "[bootstrap] Install Node.js 20 LTS..."
if ! command -v node >/dev/null 2>&1 || [ "\$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ] 2>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
node -v
npm -v

echo "[bootstrap] Clone or pull repo..."
mkdir -p \$(dirname "$REPO_DIR")
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" fetch origin
  git -C "$REPO_DIR" reset --hard origin/main 2>/dev/null || git -C "$REPO_DIR" reset --hard origin/master 2>/dev/null || true
  git -C "$REPO_DIR" pull --rebase 2>/dev/null || true
else
  git clone "$REPO_URL" "$REPO_DIR"
fi

echo "[bootstrap] npm ci in backend..."
cd "$BACKEND_DIR"
npm ci
chown -R $DEPLOY_USER:$DEPLOY_USER "$REPO_DIR"

echo "[bootstrap] Create .env..."
SESSIONS_DIR="/var/lib/whatsapp-backend/sessions"
printf '%s\n' "PORT=$PORT" "AUTO_BACKFILL_ENABLED=$AUTO_BACKFILL_ENABLED" "AUTO_BACKFILL_INTERVAL_MS=$AUTO_BACKFILL_INTERVAL_MS" "AUTO_BACKFILL_COOLDOWN_SUCCESS_MS=$AUTO_BACKFILL_COOLDOWN_MS" "AUTO_BACKFILL_ATTEMPT_BACKOFF_MS=600000" "AUTO_BACKFILL_LEASE_MS=900000" "AUTO_BACKFILL_MAX_ACCOUNTS_PER_TICK=3" "AUTO_BACKFILL_MAX_CONCURRENCY=1" "INSTANCE_ID=hetzner-1" "SESSIONS_PATH=$SESSIONS_DIR" > "$BACKEND_DIR/.env"
chown $DEPLOY_USER:$DEPLOY_USER "$BACKEND_DIR/.env"
chmod 600 "$BACKEND_DIR/.env"

echo "[bootstrap] Sessions dir..."
install -d -o $DEPLOY_USER -g $DEPLOY_USER -m 750 "$SESSIONS_DIR"

echo "[bootstrap] Systemd unit..."
printf '%s\n' "[Unit]" "Description=WhatsApp Backend (SuperParty)" "After=network.target" "" "[Service]" "Type=simple" "User=$DEPLOY_USER" "WorkingDirectory=$BACKEND_DIR" "EnvironmentFile=$BACKEND_DIR/.env" "Environment=NODE_ENV=production" "ExecStart=/usr/bin/node server.js" "Restart=on-failure" "RestartSec=10" "StandardOutput=journal" "StandardError=journal" "" "[Install]" "WantedBy=multi-user.target" > /etc/systemd/system/${SERVICE_NAME}.service

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

echo "[bootstrap] Wait for service..."
sleep 5
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$PORT/ready" >/dev/null 2>&1; then
    echo "[bootstrap] /ready OK"
    curl -fsS "http://127.0.0.1:$PORT/ready" | head -c 500
    echo ""
    exit 0
  fi
  sleep 2
done
echo "[bootstrap] WARN: /ready not 200 after 20s. Check journalctl -u $SERVICE_NAME -n 200"
curl -sS "http://127.0.0.1:$PORT/ready" || true
exit 1
SCRIPT
```

**Important:**

- **Firebase / alte secrete:** Bootstrap-ul **nu** configurează Firebase. Trebuie să adaugi manual:
  - `GOOGLE_APPLICATION_CREDENTIALS` (cale către JSON service account) sau variabilele Firestore.
  - `ADMIN_TOKEN`, `GROQ_API_KEY` etc. conform `RUNBOOK_WHATSAPP_SYNC.md` și `whatsapp-backend/env.auto-backfill.example`.
- Editează `$BACKEND_DIR/.env` pe server (sau adaugă override systemd) și repornește: `systemctl restart whatsapp-backend`.
- **Repo privat:** dacă `REPO_URL` e `git@github.com:...`, pe server trebuie deploy key sau SSH key care poate face `git clone`. Pentru HTTPS cu token, folosești `https://TOKEN@github.com/...`.
- **Dacă /ready nu răspunde:** backend-ul poate avea nevoie de Firebase credentials înainte să asculte. Verifică `journalctl -u whatsapp-backend -n 200`, adaugă `GOOGLE_APPLICATION_CREDENTIALS` în `.env`, repornește serviciul.

---

## D) Verificare

Rulează pe iPhone (Blink/iSH) după SSH pe server. Înlocuiește `superparty-hetzner` cu `root@IP` dacă nu ai config.

### 1. Status serviciu

```bash
ssh superparty-hetzner "systemctl status whatsapp-backend"
```

### 2. Loguri (ultimele 200 de linii)

```bash
ssh superparty-hetzner "journalctl -u whatsapp-backend -n 200 --no-pager"
```

### 3. Endpoint /ready

```bash
ssh superparty-hetzner "curl -fsS http://127.0.0.1:8080/ready"
```

Așteptat: JSON cu `"ready": true` sau `"mode": "active"|"passive"`.

### 4. Endpoint /health (opțional)

```bash
ssh superparty-hetzner "curl -fsS http://127.0.0.1:8080/health"
```

### 5. Auto-backfill

- **Loguri:** `ssh superparty-hetzner "journalctl -u whatsapp-backend -f"` și caută `[wa-auto-backfill]` sau mesaje despre backfill.
- **Firestore:** verifică în `accounts/{accountId}` câmpurile `lastAutoBackfillAt`, `lastAutoBackfillStatus` (vezi `RUNBOOK_WHATSAPP_SYNC.md`).

---

## Rezumat comenzi (copy-paste pe iPhone)

**Blink – verificare cheie + config + test:**

```bash
ls -la ~/.ssh/superparty_hetzner_ed25519.pub ~/.ssh/id_ed25519.pub 2>/dev/null
cat ~/.ssh/superparty_hetzner_ed25519.pub 2>/dev/null || cat ~/.ssh/id_ed25519.pub 2>/dev/null
printf '%s\n' 'Host superparty-hetzner' '  HostName ___HETZNER_IP___' '  User root' '  IdentityFile ~/.ssh/superparty_hetzner_ed25519' '  IdentitiesOnly yes' >> ~/.ssh/config
chmod 600 ~/.ssh/config
ssh superparty-hetzner "echo ok"
```

**iSH – în plus:** `apk add openssh-client openssh-keygen` și `mkdir -p ~/.ssh && chmod 700 ~/.ssh`.

**Bootstrap:** setează `HETZNER_IP`, `REPO_URL`, etc., apoi rulează blocul `ssh root@"${HETZNER_IP}" 'bash -s' <<SCRIPT ... SCRIPT`.

**Verificare:** `systemctl status`, `journalctl -u whatsapp-backend -n 200`, `curl .../ready`, `curl .../health`.

---

**Nu expune niciodată cheia privată** (`~/.ssh/*_ed25519` fără `.pub`). Doar cheia publică se adaugă în Hetzner.
