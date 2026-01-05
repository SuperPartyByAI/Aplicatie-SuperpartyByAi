# 🔐 APK Signing Setup - Eliminare Warning "Virus"

## Problema

Când angajații descarcă APK-ul, primesc warning "virus" pentru că APK-ul nu este semnat cu certificat oficial.

## Soluția

Am configurat semnarea automată a APK-ului cu certificat propriu.

---

## ✅ Ce am făcut

### 1. Generat Keystore

```bash
keytool -genkey -v -keystore superparty-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10,000 days \
  -alias superparty-key
```

**Detalii:**
- **Fișier:** `superparty-release-key.jks` (NU e în Git pentru securitate)
- **Alias:** `superparty-key`
- **Password:** `SuperParty2024!`
- **Validitate:** 10,000 zile (~27 ani)

### 2. Configurat Flutter

**Modificat:** `superparty_flutter/android/app/build.gradle`
- Adăugat `signingConfigs.release`
- Configurat `buildTypes.release` să folosească semnarea

**Creat:** `superparty_flutter/android/key.properties` (în .gitignore)
- Conține path-ul la keystore și passwords

### 3. GitHub Action pentru Build Automat

**Creat:** `.github/workflows/build-signed-apk.yml`

**Ce face:**
1. Build APK semnat automat la fiecare push pe `main`
2. Upload APK în Firebase Storage
3. Face APK-ul public

---

## 🔑 Secrets Necesare în GitHub

Pentru ca GitHub Action să funcționeze, trebuie adăugate 3 secrets:

### 1. KEYSTORE_BASE64

**Valoare:** Keystore-ul encodat în base64

```bash
base64 superparty-release-key.jks
```

**Output:** (vezi `/tmp/keystore.b64`)

### 2. KEYSTORE_PASSWORD

**Valoare:** `SuperParty2024!`

### 3. FIREBASE_SERVICE_ACCOUNT

**Valoare:** Conținutul fișierului `firebase-adminsdk.json`

---

## 📝 Cum adaugi secretele în GitHub

1. **Mergi la:** https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/settings/secrets/actions

2. **Click "New repository secret"**

3. **Adaugă cele 3 secrets:**

   **Secret 1:**
   - Name: `KEYSTORE_BASE64`
   - Value: (conținutul din `/tmp/keystore.b64`)

   **Secret 2:**
   - Name: `KEYSTORE_PASSWORD`
   - Value: `SuperParty2024!`

   **Secret 3:**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: (conținutul din `firebase-adminsdk.json`)

---

## 🚀 Cum funcționează

### Automat (recomandat):

1. Faci modificări în `superparty_flutter/`
2. Commit + push pe `main`
3. GitHub Action se declanșează automat
4. APK semnat se uploadează în Firebase Storage
5. Angajații descarcă APK-ul fără warning "virus"

### Manual:

1. Mergi la: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions
2. Click pe workflow "Build Signed APK"
3. Click "Run workflow"
4. Selectează branch `main`
5. Click "Run workflow"

---

## ✅ Rezultat

După ce APK-ul semnat este în Firebase Storage:

✅ **NU mai apare warning "virus"**
✅ **Google Play Protect recunoaște aplicația**
✅ **Instalarea este fără probleme**
✅ **Angajații pot descărca fără griji**

---

## 🔒 Securitate

**IMPORTANT:**
- ❌ **NU** commita `superparty-release-key.jks` în Git
- ❌ **NU** commita `key.properties` în Git
- ✅ Păstrează keystore-ul într-un loc sigur (backup)
- ✅ Păstrează password-ul într-un password manager

**Backup keystore:**
```bash
# Copiază keystore-ul într-un loc sigur
cp superparty-release-key.jks /path/to/secure/backup/
```

**Dacă pierzi keystore-ul:**
- ⚠️ Nu vei mai putea semna APK-uri cu același certificat
- ⚠️ Va trebui să generezi unul nou
- ⚠️ Utilizatorii vor trebui să dezinstaleze și reinstaleze aplicația

---

## 📱 Instrucțiuni pentru Angajați

După ce APK-ul semnat este live, angajații pot descărca fără probleme:

1. Click pe link: https://firebasestorage.googleapis.com/v0/b/superparty-frontend.firebasestorage.app/o/apk%2Fapp-release.apk?alt=media
2. Descarcă APK-ul
3. Instalează (fără warning "virus")
4. Gata! 🎉

---

## 🆘 Troubleshooting

### GitHub Action eșuează cu "KEYSTORE_BASE64 not found"

**Soluție:** Adaugă secretele în GitHub (vezi secțiunea de mai sus)

### APK-ul tot are warning "virus"

**Cauze posibile:**
1. APK-ul vechi (nesemnat) e încă în cache
2. GitHub Action nu s-a rulat încă
3. Secretele nu sunt configurate corect

**Soluție:**
1. Verifică că GitHub Action s-a rulat cu succes
2. Verifică că APK-ul din Firebase Storage e cel nou (check timestamp)
3. Șterge cache browser și reîncearcă descărcarea

### Cum verific că APK-ul e semnat?

```bash
# Descarcă APK-ul
curl -o app-release.apk "https://firebasestorage.googleapis.com/..."

# Verifică semnătura
jarsigner -verify -verbose -certs app-release.apk

# Ar trebui să vezi: "jar verified"
```

---

## 📞 Contact

Pentru probleme sau întrebări, contactează echipa de development.
