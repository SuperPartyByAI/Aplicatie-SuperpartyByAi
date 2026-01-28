# Următorii Pași - Deploy și Testare

## ✅ Status Actual

- **Backend fix-uri**: Commit `bb6dbcb5` pe `fix/wa-debug-backendstatus`
- **Flutter fix-uri**: Commit `96a06c5e` pe `fix/wa-debug-backendstatus`
- **Branch**: `fix/wa-debug-backendstatus`

## Opțiuni Deploy

### Opțiunea 1: Merge în Main (Recomandat)

```bash
# Switch la main
git checkout main
git pull origin main

# Merge fix branch
git merge fix/wa-debug-backendstatus

# Push main (auto-deploy pe legacy hosting pentru backend)
git push origin main

# Pentru Flutter: merge și deploy manual la Firebase dacă e cazul
```

### Opțiunea 2: Deploy Direct pe Branch (Testing)

```bash
# legacy hosting va auto-deploy branch-ul dacă e configurat
# Verifică legacy hosting settings pentru branch deployment
```

## Testare După Deploy

### 1. Backend: PASSIVE Guard pe Delete Account

```bash
# Identifică PASSIVE instance (check /health)
curl https://whats-app-ompro.ro/health | jq '.waMode'

# Dacă waMode="passive", testează delete:
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-app-ompro.ro/api/whatsapp/accounts/ACCOUNT_ID

# Expected: 503 { error: "instance_passive", ... }
```

### 2. Backend: 401 Handler Set logged_out

```bash
# Trigger 401 (delete creds manually sau wait for disconnect)
# Check account status în Firestore
# Expected: status = "logged_out" (nu "needs_qr")
```

### 3. Flutter: Handle 202 (Already In Progress)

```dart
// În Flutter emulator, call regenerateQr când status=connecting
// Expected: Success (nu error), mesaj "QR regeneration already in progress"
```

### 4. Flutter: Handle 429 (Rate Limited)

```dart
// În Flutter emulator, rapidly tap "Regenerate QR" 5x
// Expected: Orange SnackBar cu mesaj "Please wait X seconds"
```

## Verificare Commit Hash

După deploy, verifică că legacy hosting rulează commit corect:

```bash
curl https://whats-app-ompro.ro/health | jq '.commit'
# Ar trebui să returneze commit-ul merge-at (nu 892419e6)
```

## Note Importante

- **legacy hosting auto-deploy**: De obicei deploy automat pe `main` push
- **Flutter deploy**: Poate necesita deploy manual la Firebase Functions
- **Backward compatibility**: Fix-urile sunt defensive și compatibile cu codul existent

## Dacă Merge în Main

După merge, verifică:
1. legacy hosting logs pentru backend deploy
2. Flutter app pentru fix-uri
3. Health endpoint pentru commit hash
