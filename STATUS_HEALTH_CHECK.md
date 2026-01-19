# Status Health Check - Railway

## Verificare Imediată

**Endpoint**: `https://whats-upp-production.up.railway.app/health`

### Status Actual (17:33 EET)

```json
{
  "status": "error",
  "code": 502,
  "message": "Application failed to respond"
}
```

## Analiză

**502 Bad Gateway** = Aplicația nu răspunde

### Cauze Posibile

1. **Redeploy în progres** ⏳
   - Instanța a primit SIGTERM (văzut în loguri)
   - Container-ul se reconstruiește/redeploy
   - Status: Normal în timpul redeploy

2. **Instanța down/crashed** ❌
   - Serverul nu pornește corect
   - Eroare la build/start
   - Status: Trebuie investigat

### Concluzie Din Loguri Anterioare

Din logurile Railway (17:26):
```
[WABootstrap] Semnal inițiat de închidere corectă = SIGTERM
SIGNTERM primit, închidere conexiuni...
Oprirea containerului
```

**Status**: Instanța s-a închis pentru redeploy. E normal să fie 502 temporar.

## Verificări Recomandate

### 1. Verificare Periodică (Automated)

```bash
# Check every 15s until healthy
while true; do
  date
  curl -s https://whats-upp-production.up.railway.app/health | jq -r '.commit // .code // .message'
  echo
  sleep 15
done
```

### 2. Verificare Manuală

```bash
# Check once
curl -s https://whats-upp-production.up.railway.app/health | jq '{commit, status, code, message}'

# Expected după deploy:
# {"commit": "96a06c5e", "status": "healthy", ...}
```

### 3. Dacă Rămâne 502 (> 5 minute)

**Verificări în Railway Dashboard**:

1. **Deployments** tab:
   - Ultimul deploy: commit `96a06c5e`?
   - Status: Success / Failed / Building?
   - Dacă Failed: check build logs

2. **Settings** → **Source**:
   - Branch: `main` (nu alt branch)?
   - Auto-deploy: Enabled?

3. **Logs** tab:
   - Ultimele linii: build errors, start errors?
   - Container crashed / healthcheck failed?

## Verificare Commit După Deploy

După ce `/health` returnează 200 (nu 502):

```bash
curl -s https://whats-upp-production.up.railway.app/health | jq -r '.commit'

# Expected: "96a06c5e"
# Dacă e "d4f4998a": merge sau branch mismatch
```

## Concluzie

**Status**: 502 (Application failed to respond) - Redeploy în progres

**Acțiune**: Așteaptă 2-5 minute și verifică din nou `/health`.

**Dacă rămâne 502 după 5 minute**: Verifică Railway Dashboard pentru erori de build/start.
