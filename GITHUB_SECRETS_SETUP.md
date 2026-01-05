# 🔐 GitHub Secrets Setup - Instrucțiuni Complete

## ⚠️ IMPORTANT

Secretele GitHub trebuie adăugate manual deoarece nu există un token de autentificare disponibil în acest environment.

## 📋 Pași de Urmat

### 1. Accesează GitHub Secrets

Deschide: [https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/settings/secrets/actions](https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/settings/secrets/actions)

### 2. Adaugă Cele 3 Secrete

#### Secret 1: `KEYSTORE_BASE64`

**Nume:** `KEYSTORE_BASE64`

**Valoare:** (copiază din fișierul `/tmp/keystore_base64.txt`)

```bash
# Pentru a vedea valoarea:
cat /tmp/keystore_base64.txt
```

Sau folosește această comandă pentru a copia în clipboard (dacă ai acces la terminal):

```bash
cat /tmp/keystore_base64.txt | xclip -selection clipboard
```

---

#### Secret 2: `KEYSTORE_PASSWORD`

**Nume:** `KEYSTORE_PASSWORD`

**Valoare:**

```
SuperParty2024!
```

---

#### Secret 3: `FIREBASE_SERVICE_ACCOUNT`

**Nume:** `FIREBASE_SERVICE_ACCOUNT`

**Valoare:** (copiază din fișierul `/tmp/firebase_service_account.json`)

```bash
# Pentru a vedea valoarea:
cat /tmp/firebase_service_account.json
```

Sau folosește această comandă pentru a copia în clipboard:

```bash
cat /tmp/firebase_service_account.json | xclip -selection clipboard
```

---

## 3. Verificare

După ce ai adăugat toate cele 3 secrete, verifică că sunt listate în pagina de secrets:

- ✅ KEYSTORE_BASE64
- ✅ KEYSTORE_PASSWORD
- ✅ FIREBASE_SERVICE_ACCOUNT

## 4. Trigger GitHub Action

După ce secretele sunt adăugate, GitHub Action va rula automat la următorul push.

Sau poți rula manual:

1. Mergi la: [https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions](https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions)
2. Selectează workflow-ul "Build Signed APK"
3. Click pe "Run workflow"
4. Selectează branch-ul `main`
5. Click "Run workflow"

## 5. Monitorizare Build

Urmărește progresul build-ului în GitHub Actions:
[https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions](https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions)

Build-ul va:

1. ✅ Checkout code
2. ✅ Setup Java & Flutter
3. ✅ Decode keystore din KEYSTORE_BASE64
4. ✅ Create key.properties cu credențialele
5. ✅ Build APK semnat
6. ✅ Upload APK în Firebase Storage la `apk/superparty-signed.apk`

## 6. Verificare Finală

După ce build-ul se termină cu succes:

1. **Verifică APK în Firebase Storage:**
   - URL: `https://firebasestorage.googleapis.com/v0/b/superparty-ai.appspot.com/o/apk%2Fsuperparty-signed.apk?alt=media`

2. **Actualizează Firestore:**

   ```bash
   # Rulează scriptul de actualizare (sau manual în Firebase Console)
   node scripts/update-apk-url.js
   ```

3. **Test pe telefon:**
   - Descarcă APK-ul
   - Instalează
   - Verifică că NU mai apare warning-ul de "virus"

## 📞 Suport

Dacă întâmpini probleme:

1. Verifică că toate cele 3 secrete sunt adăugate corect
2. Verifică logs-urile din GitHub Actions pentru erori
3. Consultă `APK_SIGNING_SETUP.md` pentru troubleshooting detaliat

---

## 🎯 Rezumat Rapid

```bash
# 1. Copiază valorile secretelor
cat /tmp/keystore_base64.txt          # Pentru KEYSTORE_BASE64
echo "SuperParty2024!"                # Pentru KEYSTORE_PASSWORD
cat /tmp/firebase_service_account.json # Pentru FIREBASE_SERVICE_ACCOUNT

# 2. Adaugă-le manual în GitHub la:
# https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/settings/secrets/actions

# 3. Trigger build manual sau așteaptă următorul push

# 4. După build, actualizează Firestore:
node scripts/update-apk-url.js
```
