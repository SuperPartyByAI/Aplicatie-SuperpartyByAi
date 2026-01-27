#!/usr/bin/env node

/**
 * Script pentru a obține Firebase ID token din terminal
 * Rulează: node scripts/get-id-token-terminal.js <email>
 */

const https = require('https');

async function getTokenFromServer(email) {
  console.log('🔑 Obținere Firebase ID Token...');
  console.log(`📧 Email: ${email}`);
  console.log('🖥️  Conectare la server...\n');

  // Rulează pe server unde există credențialele
  // Folosim base64 encoding pentru a evita problemele cu escaping
  const script = `
const admin = require('firebase-admin');
const { loadServiceAccount } = require('./firebaseCredentials');

async function getToken() {
  try {
    const { serviceAccount } = loadServiceAccount();
    if (!serviceAccount) {
      console.error('ERROR: No service account');
      process.exit(1);
    }

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
    }

    const email = '${email.replace(/'/g, "'\\''")}';
    const user = await admin.auth().getUserByEmail(email);
    const customToken = await admin.auth().createCustomToken(user.uid);
    
    // Exchange custom token for ID token
    const apiKey = '${(process.env.FIREBASE_API_KEY || '').replace(/'/g, "'\\''")}';
    if (!apiKey || apiKey === '') {
      console.log('CUSTOM_TOKEN:' + customToken);
      console.log('NOTE: Pentru ID token real, folosește metoda din browser sau setează FIREBASE_API_KEY');
      process.exit(0);
    }

    const https = require('https');
    const { URL } = require('url');
    const url = new URL('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + apiKey);
    
    const postData = JSON.stringify({
      token: customToken,
      returnSecureToken: true,
    });

    const response = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({ ok: res.statusCode === 200, data });
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    if (response.ok) {
      const result = JSON.parse(response.data);
      console.log('ID_TOKEN:' + result.idToken);
    } else {
      console.error('ERROR: ' + response.data);
      console.log('CUSTOM_TOKEN:' + customToken);
    }
  } catch (error) {
    console.error('ERROR: ' + error.message);
    process.exit(1);
  }
}

getToken();
`;

  // Execută pe server - folosim base64 encoding pentru a evita problemele cu escaping
  const { execSync } = require('child_process');
  const scriptBase64 = Buffer.from(script.trim()).toString('base64');
  
  try {
    // Scriem scriptul într-un fișier temporar în directorul backend, apoi îl rulăm cu GOOGLE_APPLICATION_CREDENTIALS
    const result = execSync(
      `ssh root@37.27.34.179 'cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend 2>/dev/null || cd /root/whatsapp-backend 2>/dev/null || { echo "ERROR: Directory not found"; exit 1; } && echo "${scriptBase64}" | base64 -d > ./get-token-temp.js && GOOGLE_APPLICATION_CREDENTIALS=/etc/whatsapp-backend/firebase-sa.json node ./get-token-temp.js && rm -f ./get-token-temp.js'`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );

    const output = result.trim();
    
    if (output.includes('ID_TOKEN:')) {
      const idToken = output.split('ID_TOKEN:')[1].trim();
      console.log('\n✅ Token obținut cu succes!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('ID TOKEN:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(idToken);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return idToken;
    } else if (output.includes('CUSTOM_TOKEN:')) {
      const customToken = output.split('CUSTOM_TOKEN:')[1].trim();
      console.log('\n⚠️  Custom token obținut (nu ID token real)\n');
      console.log('Custom Token:', customToken);
      console.log('\n💡 Pentru ID token real, folosește metoda din browser sau setează FIREBASE_API_KEY\n');
      return null;
    } else if (output.includes('ERROR:')) {
      const error = output.split('ERROR:')[1].trim();
      console.error('\n❌ Eroare:', error);
      if (error.includes('user-not-found')) {
        console.error('\n💡 User-ul nu există. Creează-l în Firebase Console → Authentication → Users');
      }
      return null;
    } else {
      console.log('Output:', output);
      return null;
    }
  } catch (error) {
    console.error('\n❌ Eroare la conectare la server:', error.message);
    console.error('\n💡 Verifică că:');
    console.error('   1. SSH key este configurat');
    console.error('   2. Server-ul este accesibil');
    console.error('   3. Backend-ul este instalat pe server');
    return null;
  }
}

// Main
const email = process.argv[2];

if (!email) {
  console.error('❌ Email necesar!');
  console.error('\nUsage:');
  console.error('  node scripts/get-id-token-terminal.js your@email.com');
  console.error('\nOpțional (pentru ID token real, nu doar custom token):');
  console.error('  export FIREBASE_API_KEY="your-api-key"');
  console.error('  node scripts/get-id-token-terminal.js your@email.com');
  process.exit(1);
}

getTokenFromServer(email).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
