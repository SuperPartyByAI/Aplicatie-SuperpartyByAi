# Codemagic Setup - Build Android APK/AAB

## De ce Codemagic?

- ✅ **500 minute/lună gratis**
- ✅ **Buildează Android + iOS**
- ✅ **Fără probleme Maven/Gradle**
- ✅ **Mai rapid decât GitHub Actions**

## Setup (5 minute)

### 1. Creează cont Codemagic

1. Mergi la [https://codemagic.io/signup](https://codemagic.io/signup)
2. Sign up cu GitHub
3. Autorizează accesul la repository

### 2. Adaugă repository-ul

1. Click **"Add application"**
2. Selectează **"SuperPartyByAI/Aplicatie-SuperpartyByAi"**
3. Selectează **"Flutter App"**
4. Click **"Finish: Add application"**

### 3. Configurează keystore

1. În Codemagic, mergi la **Application settings** → **Environment variables**
2. Adaugă variabilele (din GitHub Secrets):

```
CM_KEYSTORE_PASSWORD = <password-ul tău>
CM_KEY_PASSWORD = <password-ul tău>
CM_KEY_ALIAS = superparty-key
```

3. Upload keystore:
   - Click **"Upload file"**
   - Selectează `superparty-release-key.jks`
   - Salvează ca `CM_KEYSTORE_PATH`

### 4. Start build

1. Click **"Start new build"**
2. Selectează workflow **"android-release"**
3. Click **"Start new build"**

Build-ul durează ~5-7 minute.

### 5. Descarcă APK/AAB

După ce build-ul se termină:

1. Click pe build
2. Scroll down la **"Artifacts"**
3. Download:
   - `app-release.apk` - pentru instalare directă
   - `app-release.aab` - pentru Google Play Console

## Automatizare

Codemagic va builda automat la fiecare push pe `main` (dacă activezi webhook-ul).

## Costuri

- **Free tier**: 500 minute/lună
- **Un build**: ~5-7 minute
- **Poți face**: ~70 builds/lună gratis

## Pentru iOS (când cumperi Mac)

Codemagic poate builda și iOS, dar ai nevoie de:

- Apple Developer Account ($99/an)
- Certificat de signing
- Provisioning profile

## Troubleshooting

### Build eșuează

- Verifică că keystore-ul e uploadat corect
- Verifică că variabilele de environment sunt setate

### Nu găsește codemagic.yaml

- Asigură-te că fișierul e în root-ul repository-ului
- Commit și push fișierul

## Alternative

Dacă Codemagic nu merge:

- **Bitrise**: Similar cu Codemagic
- **AppCenter**: Microsoft, free tier
- **CircleCI**: 6000 minute/lună gratis
