# 💾 Backup & Recovery Configuration

Configurații importante și proceduri de backup pentru SuperParty WhatsApp Backend.

---

## 🔐 Secrets & Credentials

### Firebase Service Account

**Location:** `.secrets/firebase-service-account.json`

**Backup:**
```bash
# Local backup
cp .secrets/firebase-service-account.json ~/Backups/superparty-firebase-$(date +%Y%m%d).json

# Encrypted backup
gpg -c .secrets/firebase-service-account.json
# Output: .secrets/firebase-service-account.json.gpg
```

**Recovery:**
```bash
# From backup
cp ~/Backups/superparty-firebase-20241227.json .secrets/firebase-service-account.json

# From encrypted
gpg -d .secrets/firebase-service-account.json.gpg > .secrets/firebase-service-account.json
```

**Railway Environment Variable:**
```bash
# Export current value
railway variables get FIREBASE_SERVICE_ACCOUNT > firebase-backup.json

# Restore
railway variables set FIREBASE_SERVICE_ACCOUNT="$(cat firebase-backup.json)"
```

### GitHub Token

**Location:** `.secrets/github-token.txt`

**Backup:**
```bash
cp .secrets/github-token.txt ~/Backups/github-token-$(date +%Y%m%d).txt
```

**Recovery:**
```bash
cp ~/Backups/github-token-20241227.txt .secrets/github-token.txt
```

---

## 📦 WhatsApp Sessions

### Baileys Auth Sessions

**Location:** `.baileys_auth/{accountId}/`

**Structure:**
```
.baileys_auth/
├── account1/
│   └── creds.json          # Authentication credentials
├── account2/
│   └── creds.json
└── ...
```

**Backup:**
```bash
# Backup all sessions
tar -czf baileys-sessions-$(date +%Y%m%d).tar.gz .baileys_auth/

# Backup specific account
tar -czf account1-session-$(date +%Y%m%d).tar.gz .baileys_auth/account1/
```

**Recovery:**
```bash
# Restore all sessions
tar -xzf baileys-sessions-20241227.tar.gz

# Restore specific account
tar -xzf account1-session-20241227.tar.gz
```

**⚠️ Important:**
- Sessions expire după 30 zile inactivitate
- Backup săptămânal recomandat
- Nu commita în git (gitignored)

---

## 🗄️ Database Backup

### Firestore Export

**Manual Export:**
```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash

# Login
gcloud auth login

# Set project
gcloud config set project superparty-frontend

# Export Firestore
gcloud firestore export gs://superparty-backups/$(date +%Y%m%d)
```

**Automated Backup (Firebase Console):**
1. Firebase Console → Firestore
2. Import/Export tab
3. Schedule exports → Daily at 2 AM UTC
4. Destination: Cloud Storage bucket

**Recovery:**
```bash
# Import from backup
gcloud firestore import gs://superparty-backups/20241227
```

### Firestore Structure Backup

**Export schema:**
```bash
# Create backup script
cat > backup-firestore-schema.js << 'EOF'
const admin = require('firebase-admin');
const fs = require('fs');

admin.initializeApp({
  credential: admin.credential.cert(require('./.secrets/firebase-service-account.json'))
});

const db = admin.firestore();

async function backupSchema() {
  const collections = ['accounts'];
  const schema = {};
  
  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName).limit(1).get();
    if (!snapshot.empty) {
      schema[collectionName] = Object.keys(snapshot.docs[0].data());
    }
  }
  
  fs.writeFileSync('firestore-schema.json', JSON.stringify(schema, null, 2));
  console.log('Schema backed up to firestore-schema.json');
}

backupSchema();
EOF

# Run backup
node backup-firestore-schema.js
```

---

## ⚙️ Configuration Files

### Critical Files to Backup

**Backend:**
- `package.json` - Dependencies
- `Dockerfile` - Container config
- `railway.json` - Railway config
- `.env.example` - Environment template
- `src/whatsapp/manager.js` - Core logic
- `src/firebase/firestore.js` - Database service

**Frontend:**
- `kyc-app/kyc-app/package.json` - Dependencies
- `kyc-app/kyc-app/firebase.json` - Firebase config
- `kyc-app/kyc-app/.firebaserc` - Firebase project
- `kyc-app/kyc-app/src/config.js` - API URLs

**Backup Script:**
```bash
#!/bin/bash
# backup-configs.sh

BACKUP_DIR=~/Backups/superparty-$(date +%Y%m%d)
mkdir -p $BACKUP_DIR

# Backend configs
cp package.json $BACKUP_DIR/
cp Dockerfile $BACKUP_DIR/
cp railway.json $BACKUP_DIR/
cp .env.example $BACKUP_DIR/
cp -r src/ $BACKUP_DIR/src/

# Frontend configs
cp kyc-app/kyc-app/package.json $BACKUP_DIR/frontend-package.json
cp kyc-app/kyc-app/firebase.json $BACKUP_DIR/
cp kyc-app/kyc-app/.firebaserc $BACKUP_DIR/

# Secrets (encrypted)
gpg -c .secrets/firebase-service-account.json -o $BACKUP_DIR/firebase-service-account.json.gpg
gpg -c .secrets/github-token.txt -o $BACKUP_DIR/github-token.txt.gpg

# Sessions
tar -czf $BACKUP_DIR/baileys-sessions.tar.gz .baileys_auth/

echo "✅ Backup complete: $BACKUP_DIR"
```

**Usage:**
```bash
chmod +x backup-configs.sh
./backup-configs.sh
```

---

## 🚀 Deployment Configs

### Railway

**Project Info:**
```
Project ID: 79acdd18-4ffb-4043-a95c-b4a4845b7e14
Project Name: aplicatie-superpartybyai-production
Region: us-west1
```

**Environment Variables:**
```bash
# Export all variables
railway variables > railway-vars-$(date +%Y%m%d).txt

# Backup specific variable
railway variables get FIREBASE_SERVICE_ACCOUNT > firebase-railway-$(date +%Y%m%d).json
```

**Railway Config (`railway.json`):**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "node src/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Firebase

**Project Info:**
```
Project ID: superparty-frontend
Project Name: SuperParty Frontend
Region: europe-west
```

**Firebase Config (`.firebaserc`):**
```json
{
  "projects": {
    "default": "superparty-frontend"
  }
}
```

**Hosting Config (`firebase.json`):**
```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

---

## 🔄 Recovery Procedures

### Complete System Recovery

**Scenario:** Pierdere completă server/laptop

**Steps:**

1. **Clone Repository:**
```bash
git clone https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi.git
cd Aplicatie-SuperpartyByAi
```

2. **Restore Secrets:**
```bash
mkdir -p .secrets
cp ~/Backups/superparty-20241227/firebase-service-account.json.gpg .secrets/
gpg -d .secrets/firebase-service-account.json.gpg > .secrets/firebase-service-account.json
```

3. **Restore Sessions:**
```bash
tar -xzf ~/Backups/superparty-20241227/baileys-sessions.tar.gz
```

4. **Install Dependencies:**
```bash
npm install
cd kyc-app/kyc-app && npm install && cd ../..
```

5. **Deploy Backend:**
```bash
railway login
railway link 79acdd18-4ffb-4043-a95c-b4a4845b7e14
railway variables set FIREBASE_SERVICE_ACCOUNT="$(cat .secrets/firebase-service-account.json)"
git push origin main
```

6. **Deploy Frontend:**
```bash
firebase login
cd kyc-app/kyc-app
npm run build
firebase deploy --only hosting
```

**✅ System recovered!**

### Partial Recovery

**Lost WhatsApp Session:**
```bash
# Remove old session
rm -rf .baileys_auth/account1/

# Re-add account via UI
# GM Mode → Add Account → Pairing Code
```

**Lost Firebase Credentials:**
```bash
# Download new service account
# Firebase Console → Project Settings → Service Accounts
# Generate New Private Key

# Update Railway
railway variables set FIREBASE_SERVICE_ACCOUNT="$(cat new-service-account.json)"
```

**Lost Database:**
```bash
# Restore from Firestore export
gcloud firestore import gs://superparty-backups/20241227
```

---

## 📊 Backup Schedule

### Recommended Schedule

**Daily (Automated):**
- ✅ Firestore export (2 AM UTC)
- ✅ Railway logs archive

**Weekly (Manual):**
- 📦 Baileys sessions backup
- 📦 Configuration files backup
- 📦 Secrets backup (encrypted)

**Monthly (Manual):**
- 📦 Complete system backup
- 📦 Test recovery procedure
- 📦 Update documentation

### Automated Backup Script

```bash
#!/bin/bash
# automated-backup.sh

BACKUP_ROOT=~/Backups/superparty
DATE=$(date +%Y%m%d)
BACKUP_DIR=$BACKUP_ROOT/$DATE

mkdir -p $BACKUP_DIR

# Baileys sessions
tar -czf $BACKUP_DIR/baileys-sessions.tar.gz .baileys_auth/

# Configs
cp package.json $BACKUP_DIR/
cp Dockerfile $BACKUP_DIR/
cp railway.json $BACKUP_DIR/

# Secrets (encrypted)
gpg -c .secrets/firebase-service-account.json -o $BACKUP_DIR/firebase.json.gpg

# Railway vars
railway variables > $BACKUP_DIR/railway-vars.txt

# Cleanup old backups (keep 30 days)
find $BACKUP_ROOT -type d -mtime +30 -exec rm -rf {} \;

echo "✅ Backup complete: $BACKUP_DIR"
```

**Setup Cron:**
```bash
# Edit crontab
crontab -e

# Add daily backup at 3 AM
0 3 * * * cd /path/to/Aplicatie-SuperpartyByAi && ./automated-backup.sh
```

---

## 🔍 Verification

### Backup Integrity Check

```bash
#!/bin/bash
# verify-backup.sh

BACKUP_DIR=$1

echo "🔍 Verifying backup: $BACKUP_DIR"

# Check files exist
FILES=(
  "package.json"
  "Dockerfile"
  "railway.json"
  "baileys-sessions.tar.gz"
  "firebase.json.gpg"
)

for file in "${FILES[@]}"; do
  if [ -f "$BACKUP_DIR/$file" ]; then
    echo "✅ $file"
  else
    echo "❌ $file MISSING"
  fi
done

# Check archive integrity
tar -tzf $BACKUP_DIR/baileys-sessions.tar.gz > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ baileys-sessions.tar.gz valid"
else
  echo "❌ baileys-sessions.tar.gz CORRUPTED"
fi

# Check GPG file
gpg --list-packets $BACKUP_DIR/firebase.json.gpg > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ firebase.json.gpg valid"
else
  echo "❌ firebase.json.gpg CORRUPTED"
fi

echo "✅ Verification complete"
```

**Usage:**
```bash
chmod +x verify-backup.sh
./verify-backup.sh ~/Backups/superparty-20241227
```

---

## 📝 Backup Checklist

### Before Major Changes

- [ ] Backup Baileys sessions
- [ ] Backup Firebase credentials
- [ ] Export Firestore data
- [ ] Backup Railway environment variables
- [ ] Backup configuration files
- [ ] Test backup integrity
- [ ] Document changes

### After Deployment

- [ ] Verify deployment successful
- [ ] Create post-deployment backup
- [ ] Update backup documentation
- [ ] Test recovery procedure

### Monthly Maintenance

- [ ] Review backup schedule
- [ ] Test full recovery
- [ ] Clean old backups (>30 days)
- [ ] Update backup scripts
- [ ] Verify backup storage space

---

## 🆘 Emergency Contacts

**Developer:** Ona AI  
**Admin:** Andrei (ursache.andrei1995@gmail.com)  

**Railway Support:** https://railway.app/help  
**Firebase Support:** https://firebase.google.com/support  

**Repository:** https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi  

---

## 📚 Related Documentation

- [README.md](README.md) - Main documentation
- [QUICK-START.md](QUICK-START.md) - Setup guide
- [SESSION-REPORT-2024-12-27.md](SESSION-REPORT-2024-12-27.md) - Implementation details

---

**Created:** 2024-12-27  
**Version:** 1.0  
**Ona AI** ✅
