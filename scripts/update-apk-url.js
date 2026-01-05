const https = require('https');

const projectId = 'superparty-ai';
const apkUrl = 'https://firebasestorage.googleapis.com/v0/b/superparty-ai.appspot.com/o/apk%2Fsuperparty-signed.apk?alt=media';

// Get access token from gcloud
const { execSync } = require('child_process');

try {
  console.log('🔑 Obțin token de acces...');
  const token = execSync('firebase login:ci --no-localhost', { encoding: 'utf8' }).trim();
  
  console.log('📝 Actualizez Firestore...');
  
  const data = JSON.stringify({
    fields: {
      apk_url: {
        stringValue: apkUrl
      },
      last_updated: {
        timestampValue: new Date().toISOString()
      }
    }
  });

  const options = {
    hostname: 'firestore.googleapis.com',
    port: 443,
    path: `/v1/projects/${projectId}/databases/(default)/documents/app_config/update_config?updateMask.fieldPaths=apk_url&updateMask.fieldPaths=last_updated`,
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('✅ APK URL actualizat cu succes!');
        console.log('URL:', apkUrl);
      } else {
        console.error('❌ Eroare:', res.statusCode, body);
        process.exit(1);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Eroare:', error);
    process.exit(1);
  });

  req.write(data);
  req.end();

} catch (error) {
  console.error('❌ Eroare la obținerea token-ului:', error.message);
  console.log('\n📋 Alternativă: Actualizează manual în Firebase Console:');
  console.log('1. Deschide: https://console.firebase.google.com/project/superparty-ai/firestore');
  console.log('2. Navighează la: app_config > update_config');
  console.log('3. Editează câmpul apk_url cu:');
  console.log('   ', apkUrl);
  process.exit(1);
}
