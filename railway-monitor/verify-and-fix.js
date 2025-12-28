/**
 * v7.0 - Verifică și repară deployment-ul
 */

const https = require('https');

async function verify() {
  console.log('');
  console.log('🔍 v7.0 - Verificare deployment...');
  console.log('');

  // Test backend
  const response = await new Promise((resolve) => {
    https.get('https://web-production-f0714.up.railway.app/', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: data });
        }
      });
    }).on('error', (e) => {
      resolve({ error: e.message });
    });
  });

  console.log('Backend response:', response);
  console.log('');

  if (response.service && response.service.includes('Voice')) {
    console.log('✅ Voice AI backend activ!');
    console.log('');
    console.log('🎯 Testează acum:');
    console.log('   Sună la: +1 (218) 220-4425');
    console.log('');
    return true;
  }

  console.log('❌ Backend-ul VECHI încă rulează!');
  console.log('');
  console.log('Problema: Railway nu a deploy-at repo-ul corect.');
  console.log('');
  console.log('SOLUȚIE:');
  console.log('1. Railway → web-production-f0714.up.railway.app');
  console.log('2. Settings → Source');
  console.log('3. Verifică că e conectat la:');
  console.log('   Repo: SuperPartyByAI/superparty-ai-backend');
  console.log('   Branch: main (NU master!)');
  console.log('');
  console.log('4. Dacă e altceva:');
  console.log('   - Disconnect');
  console.log('   - Connect Repo → SuperPartyByAI/superparty-ai-backend');
  console.log('   - Branch: main');
  console.log('');
  console.log('5. Deployments → Trigger Deploy (dacă nu pornește automat)');
  console.log('');

  return false;
}

verify();
