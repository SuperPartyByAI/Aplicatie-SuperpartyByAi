# CI/CD Setup - Flutter Build & Deploy

## 🚀 Ce Face CI/CD-ul

La fiecare push pe `main` care modifică `superparty_flutter/**`:

1. ✅ Build-ează APK automat (GitHub Actions)
2. ✅ Upload-ează pe Firebase App Distribution
3. ✅ Îți trimite notificare pe telefon
4. ✅ Instalezi direct din notificare

---

## 📋 Setup Necesar (O SINGURĂ DATĂ)

### 1. Firebase App ID

**Găsește App ID:**

1. Mergi la: https://console.firebase.google.com/project/superparty-frontend/settings/general
2. Scroll la "Your apps"
3. Click pe Android app
4. Copiază **App ID** (format: `1:xxxxx:android:xxxxx`)

**Adaugă în GitHub Secrets:**

1. Mergi la: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/settings/secrets/actions
2. Click "New repository secret"
3. Name: `FIREBASE_APP_ID`
4. Value: App ID-ul copiat
5. Click "Add secret"

---

### 2. Firebase Service Account

**Generează Service Account:**

1. Mergi la: https://console.firebase.google.com/project/superparty-frontend/settings/serviceaccounts/adminsdk
2. Click "Generate new private key"
3. Click "Generate key"
4. Se descarcă un fișier JSON (ex: `superparty-frontend-xxxxx.json`)

**Adaugă în GitHub Secrets:**

1. Deschide fișierul JSON în Notepad
2. Copiază ÎNTREG conținutul (tot JSON-ul)
3. Mergi la: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/settings/secrets/actions
4. Click "New repository secret"
5. Name: `FIREBASE_SERVICE_ACCOUNT`
6. Value: Paste întreg JSON-ul
7. Click "Add secret"

---

### 3. Activează Firebase App Distribution

**În Firebase Console:**

1. Mergi la: https://console.firebase.google.com/project/superparty-frontend/appdistribution
2. Click "Get started"
3. Selectează Android app
4. Click "Register testers"
5. Adaugă email: `ursache.andrei1995@gmail.com`
6. Click "Add testers"

---

## 🧪 Test CI/CD

### Opțiunea 1: Push Modificare

```bash
# Pe Windows
cd C:\Users\ursac\Aplicatie-SuperpartyByAi

# Fă o modificare mică
echo "test" >> superparty_flutter/README.md

# Commit & Push
git add superparty_flutter/README.md
git commit -m "test: trigger CI/CD"
git push origin main
```

### Opțiunea 2: Manual Trigger

1. Mergi la: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions/workflows/flutter-build.yml
2. Click "Run workflow"
3. Click "Run workflow" (verde)

---

## 📱 Primești APK pe Telefon

### Pas 1: Instalează Firebase App Distribution

**Pe telefon:**

1. Deschide: https://appdistribution.firebase.dev/i/xxxxx (link din email)
2. SAU descarcă app: https://play.google.com/store/apps/details?id=com.google.firebase.appdistribution

### Pas 2: Primești Notificare

După ~5-10 minute de la push:

1. ✅ Primești email: "New build available"
2. ✅ Primești notificare pe telefon (dacă ai app-ul)
3. ✅ Click pe notificare
4. ✅ Click "Download"
5. ✅ Click "Install"

---

## 🔍 Monitorizare Build

### GitHub Actions

**Vezi progress:**
https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions

**Statusuri:**

- 🟡 **In progress** - Se build-ează
- ✅ **Success** - APK gata, trimis pe telefon
- ❌ **Failed** - Eroare (vezi logs)

**Timp estimat:** 5-10 minute

---

## 📊 Ce se Întâmplă Pas cu Pas

```
1. Push pe GitHub (main branch)
   ↓
2. GitHub Actions detectează modificare în superparty_flutter/
   ↓
3. Pornește VM Ubuntu
   ↓
4. Instalează Java 17
   ↓
5. Instalează Flutter 3.24.5
   ↓
6. flutter pub get (dependencies)
   ↓
7. flutter build apk --release (~3-5 min)
   ↓
8. Upload APK pe Firebase App Distribution
   ↓
9. Firebase trimite notificare pe telefon
   ↓
10. Tu instalezi din notificare
```

---

## 🐛 Troubleshooting

### Build Failed: "FIREBASE_APP_ID not found"

**Soluție:**

- Verifică că ai adăugat secret în GitHub
- Name exact: `FIREBASE_APP_ID`
- Fără spații sau caractere extra

### Build Failed: "Service account invalid"

**Soluție:**

- Regenerează service account key
- Copiază ÎNTREG JSON-ul (inclusiv `{` și `}`)
- Verifică că nu ai adăugat spații sau newlines extra

### Nu Primesc Notificare

**Soluție:**

1. Verifică email-ul (spam folder)
2. Instalează Firebase App Distribution app
3. Login cu același email
4. Activează notificări în app

### APK nu se Instalează

**Soluție:**

1. Activează "Install from unknown sources"
2. Settings → Security → Unknown sources → ON
3. Sau Settings → Apps → Special access → Install unknown apps → Firebase App Distribution → Allow

---

## 🎯 Avantaje CI/CD

### Înainte (Manual):

```
1. Instalează Flutter pe Windows (30 min)
2. flutter pub get (2 min)
3. flutter build apk (5 min)
4. Copiază APK pe telefon (cablu USB)
5. Instalează manual
Total: ~40 min + cablu USB
```

### Acum (CI/CD):

```
1. Push pe GitHub (10 sec)
2. Așteaptă notificare (5-10 min)
3. Click Install (10 sec)
Total: ~10 min, fără cablu!
```

---

## 📝 Comenzi Utile

### Trigger Manual Build

```bash
# Folosește GitHub CLI
gh workflow run flutter-build.yml

# Sau prin web:
# https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions/workflows/flutter-build.yml
```

### Vezi Logs

```bash
# Ultimul run
gh run list --workflow=flutter-build.yml --limit 1

# Vezi logs
gh run view --log
```

### Download APK Direct

```bash
# Download ultimul APK build-at
gh run download --name superparty-app
```

---

## 🔐 Security

**Secrets sunt sigure:**

- ✅ Encrypted în GitHub
- ✅ Nu apar în logs
- ✅ Doar workflow-urile le pot accesa
- ✅ Nu sunt în cod

**Service Account:**

- ✅ Acces doar la Firebase App Distribution
- ✅ Nu poate șterge/modifica alte resurse
- ✅ Poate fi revocat oricând

---

## 📈 Next Steps

După ce funcționează:

1. **Adaugă mai mulți testeri:**
   - Firebase Console → App Distribution → Testers
   - Adaugă emails

2. **Creează grupuri:**
   - "alpha" - dezvoltatori
   - "beta" - testeri interni
   - "production" - clienți

3. **Automatizează versioning:**
   - Auto-increment build number
   - Semantic versioning (1.0.0 → 1.0.1)

4. **Adaugă teste:**
   - Unit tests
   - Widget tests
   - Integration tests

---

**Status**: ✅ Workflow configurat, așteaptă secrets
**Next**: Adaugă FIREBASE_APP_ID și FIREBASE_SERVICE_ACCOUNT în GitHub Secrets
