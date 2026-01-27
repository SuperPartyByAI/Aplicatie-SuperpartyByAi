#!/usr/bin/env node

/**
 * Script simplu pentru a genera Firebase ID token
 * Rulează: node scripts/generate-token-simple.js <email> <password>
 */

const https = require('https');

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyC...'; // Setează API key-ul tău
const FIREBASE_PROJECT_ID = 'superparty-frontend';

async function getFirebaseIdToken(email, password) {
  if (!FIREBASE_API_KEY || FIREBASE_API_KEY === 'AIzaSyC...') {
    console.error('❌ Setează FIREBASE_API_KEY!');
    console.error('Obține-l din: https://console.firebase.google.com/project/superparty-frontend/settings/general');
    console.error('Apoi rulează: export FIREBASE_API_KEY="your-key"');
    process.exit(1);
  }

  try {
    // Step 1: Sign in with email/password
    const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
    
    const signInData = JSON.stringify({
      email: email,
      password: password,
      returnSecureToken: true,
    });

    console.log('🔐 Autentificare cu email/password...');

    const signInResponse = await makeRequest(signInUrl, signInData);
    
    if (!signInResponse.ok) {
      const error = JSON.parse(signInResponse.data);
      console.error('❌ Eroare la autentificare:', error.error?.message || error.error);
      
      if (error.error?.message?.includes('INVALID_PASSWORD') || error.error?.message?.includes('EMAIL_NOT_FOUND')) {
        console.error('\n💡 Sugestii:');
        console.error('1. Verifică că email-ul și parola sunt corecte');
        console.error('2. Dacă nu ai parolă, resetează-o din Firebase Console');
        console.error('3. Sau folosește metoda din browser (F12 → Console)');
      }
      process.exit(1);
    }

    const signInResult = JSON.parse(signInResponse.data);
    const idToken = signInResult.idToken;

    console.log('\n✅ Token generat cu succes!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ID TOKEN:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(idToken);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📋 Exemplu de utilizare:');
    console.log(`ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443"`);
    console.log(`ID_TOKEN="${idToken}"`);
    console.log(`ssh root@37.27.34.179 "curl -sS -X POST -H 'Authorization: Bearer \${ID_TOKEN}' 'http://127.0.0.1:8080/api/whatsapp/regenerate-qr/\${ACCOUNT_ID}'"`);

    return idToken;
  } catch (error) {
    console.error('❌ Eroare:', error.message);
    process.exit(1);
  }
}

function makeRequest(url, data) {
  return new Promise((resolve, reject) => {
    const { URL } = require('url');
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          data: responseData,
        });
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Main
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('❌ Email și parolă necesare!');
  console.error('\nUsage:');
  console.error('  node scripts/generate-token-simple.js <email> <password>');
  console.error('\nSau cu variabile de mediu:');
  console.error('  export FIREBASE_API_KEY="your-api-key"');
  console.error('  node scripts/generate-token-simple.js your@email.com yourpassword');
  console.error('\n💡 Obține FIREBASE_API_KEY din:');
  console.error('   https://console.firebase.google.com/project/superparty-frontend/settings/general');
  process.exit(1);
}

getFirebaseIdToken(email, password).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
