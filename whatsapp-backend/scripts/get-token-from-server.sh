#!/bin/bash

# Script pentru a obține Firebase ID token folosind credențialele de pe server

echo "🔑 Obținere Firebase ID Token de pe server..."
echo ""

# Verifică dacă email-ul este dat
if [ -z "$1" ]; then
  echo "❌ Email necesar!"
  echo ""
  echo "Usage:"
  echo "  ./scripts/get-token-from-server.sh your@email.com"
  echo ""
  exit 1
fi

EMAIL="$1"

echo "📧 Email: $EMAIL"
echo "🖥️  Conectare la server..."
echo ""

# Rulează scriptul pe server
ssh root@37.27.34.179 << EOF
cd /root/whatsapp-backend 2>/dev/null || cd /opt/whatsapp-backend 2>/dev/null || {
  echo "❌ Directorul backend nu a fost găsit pe server"
  exit 1
}

# Verifică dacă există Node.js și firebase-admin
if ! command -v node &> /dev/null; then
  echo "❌ Node.js nu este instalat pe server"
  exit 1
fi

# Creează script temporar pentru a genera token
cat > /tmp/get-token-temp.js << 'NODE_SCRIPT'
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Încearcă să încarce service account
let serviceAccount = null;

// Verifică variabile de mediu
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (e) {
    // Poate e path
    if (fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) {
      serviceAccount = JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, 'utf8'));
    }
  }
}

// Verifică path-uri comune
const possiblePaths = [
  '/root/whatsapp-backend/serviceAccountKey.json',
  '/opt/whatsapp-backend/serviceAccountKey.json',
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
];

for (const p of possiblePaths) {
  if (p && fs.existsSync(p)) {
    serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
    break;
  }
}

if (!serviceAccount) {
  console.error('❌ Firebase service account nu a fost găsit pe server');
  process.exit(1);
}

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const email = process.argv[2];
if (!email) {
  console.error('❌ Email necesar');
  process.exit(1);
}

admin.auth().getUserByEmail(email)
  .then(user => {
    return admin.auth().createCustomToken(user.uid);
  })
  .then(customToken => {
    console.log('✅ Custom token generat');
    console.log('⚠️  Pentru ID token real, folosește metoda din browser sau exchange custom token');
    console.log('');
    console.log('Custom Token:');
    console.log(customToken);
    console.log('');
    console.log('💡 Pentru ID token, folosește metoda din browser (F12 → Console):');
    console.log('   firebase.auth().currentUser.getIdToken().then(token => console.log(token));');
  })
  .catch(error => {
    if (error.code === 'auth/user-not-found') {
      console.error('❌ User not found:', email);
      console.error('Creează user-ul în Firebase Console → Authentication → Users');
    } else {
      console.error('❌ Eroare:', error.message);
    }
    process.exit(1);
  });
NODE_SCRIPT

node /tmp/get-token-temp.js "$EMAIL"
rm -f /tmp/get-token-temp.js
EOF
