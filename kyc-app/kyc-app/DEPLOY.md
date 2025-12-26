# 🚀 Deploy Guide

## Quick Deploy

```bash
./deploy.sh
```

Acest script va:
1. Build aplicația (`npm run build`)
2. Retrieve token din Firebase Secret Manager
3. Deploy pe Firebase Hosting
4. Afișează URL-ul live

---

## 🔐 Secrets Management

### Toate Secretele Salvate În Firebase Secret Manager

Aplicația folosește **Firebase Secret Manager** pentru toate secretele sensibile:

#### 1. Deploy Token
- **Secret Name**: `DEPLOY_TOKEN`
- **Usage**: Automated deployment to Firebase Hosting
- **Access**: Deploy scripts și CI/CD

#### 2. OpenAI API Key
- **Secret Name**: `OPENAI_API_KEY`
- **Usage**: Cloud Functions (chatWithAI, extractKYCData, aiManager)
- **Access**: Doar Cloud Functions cu permisiuni

**Location**: Firebase Console → Functions → Secrets  
**Encryption**: AES-256-GCM (Google managed)  
**Access Control**: IAM Permissions

### Cum Accesez Token-ul

```bash
# Retrieve token
firebase functions:secrets:access DEPLOY_TOKEN

# Update token (dacă expiră)
firebase functions:secrets:set DEPLOY_TOKEN --data-file=- <<< "NEW_TOKEN_HERE"

# Delete token
firebase functions:secrets:destroy DEPLOY_TOKEN
```

### Backup Local (Optional)

Token-ul este salvat și în `.env.local` (nu se urcă pe GitHub):

```bash
# .env.local
FIREBASE_TOKEN=1//03aMrQra07U5j...
```

---

## 📋 Manual Deploy (Fără Script)

```bash
# 1. Build
npm run build

# 2. Deploy cu token din Secret Manager
DEPLOY_TOKEN=$(firebase functions:secrets:access DEPLOY_TOKEN)
firebase deploy --only hosting --token "$DEPLOY_TOKEN"

# SAU deploy cu token din .env.local
source .env.local
firebase deploy --only hosting --token "$FIREBASE_TOKEN"
```

---

## 🔄 Re-Deploy După Modificări

```bash
# 1. Modifică codul
# 2. Commit + push
git add .
git commit -m "feat: add new feature"
git push origin feature/ai-manager

# 3. Deploy
./deploy.sh
```

**Durată**: ~1-2 minute

---

## 🌐 URLs

- **Live App**: https://superparty-frontend.web.app
- **Firebase Console**: https://console.firebase.google.com/project/superparty-frontend
- **GitHub Repo**: https://github.com/SuperPartyByAI/kyc-app

---

## 🐛 Troubleshooting

### Error: "No deploy token found"

**Soluție 1**: Verifică că secretul există
```bash
firebase functions:secrets:access DEPLOY_TOKEN
```

**Soluție 2**: Recreează secretul
```bash
firebase login:ci  # Obține token nou
firebase functions:secrets:set DEPLOY_TOKEN --data-file=- <<< "NEW_TOKEN"
```

### Error: "Permission denied"

**Soluție**: Verifică că ești autentificat
```bash
firebase login
```

### Error: "Build failed"

**Soluție**: Verifică dependențele
```bash
npm install
npm run build
```

---

## 📊 Deploy History

Poți vedea toate deploy-urile în Firebase Console:
- Hosting → Release history
- Rollback la versiuni anterioare dacă e necesar

---

## 🔒 Security Notes

### Secrets Protection

- ✅ **Toate secretele** sunt în Firebase Secret Manager (encrypted AES-256)
- ✅ **Encryption at rest** - Secretele sunt encrypted în Google Cloud
- ✅ **Encryption in transit** - HTTPS/TLS 1.3 pentru toate comunicările
- ✅ **Access Control** - IAM permissions pentru fiecare secret
- ✅ **Audit Logs** - Toate accesările sunt loggate
- ✅ **No Exposure** - Secretele NU ajung în browser/frontend
- ✅ **Versioning** - Poți reveni la versiuni anterioare
- ✅ **Rotation** - Poți schimba secretele fără re-deploy

### Local Backup

- ✅ `.env.local` este în `.gitignore` (nu se urcă pe GitHub)
- ✅ Folosit doar ca fallback local
- ✅ Token-ul poate fi revocat oricând din Firebase Console

### Best Practices

1. **NU pune niciodată secrete în cod**
2. **NU commit-a fișiere .env pe GitHub**
3. **Folosește Firebase Secret Manager** pentru toate secretele
4. **Rotează secretele** periodic (la 3-6 luni)
5. **Revocă secretele** dacă sunt compromise

---

**Last Updated**: 2025-12-26
**Maintained By**: Ona AI Assistant
