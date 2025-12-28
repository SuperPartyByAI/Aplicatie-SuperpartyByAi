/**
 * v7.0 - AUTO-DEPLOY VOICE AI COMPLET
 * Deploy-ează totul automat fără intervenție umană
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CREDENTIALS = {
  OPENAI_API_KEY: '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',
  TWILIO_ACCOUNT_SID: 'AC17c88873d670aab4aa4a50fae230d2df',
  TWILIO_AUTH_TOKEN: '5c6670d39a1dbf46d47ecdaa244b91d9',
  TWILIO_PHONE_NUMBER: '+12182204425',
  BACKEND_URL: 'https://web-production-f0714.up.railway.app',
  COQUI_API_URL: 'https://web-production-00dca9.up.railway.app',
  NODE_ENV: 'production',
  PORT: '5001'
};

async function deploy() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎤 v7.0 AUTO-DEPLOY: Voice AI cu Kasya');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  try {
    // 1. Creează .env file pentru Railway
    console.log('📝 Creez .env pentru Railway...');
    const envContent = Object.entries(CREDENTIALS)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    const envPath = path.join(__dirname, '../voice-backend/.env');
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env creat');
    console.log('');

    // 2. Creează railway.toml cu toate setările
    console.log('📝 Creez railway.toml...');
    const railwayToml = `[build]
builder = "NIXPACKS"

[deploy]
startCommand = "node server.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
healthcheckPath = "/"
healthcheckTimeout = 100
healthcheckInterval = 10

[env]
${Object.entries(CREDENTIALS).map(([key, value]) => `${key} = "${value}"`).join('\n')}
`;
    
    const tomlPath = path.join(__dirname, '../voice-backend/railway.toml');
    fs.writeFileSync(tomlPath, railwayToml);
    console.log('✅ railway.toml creat');
    console.log('');

    // 3. Update git (skip .env, doar railway.toml)
    console.log('📦 Commit și push...');
    execSync('git add -f voice-backend/railway.toml', { 
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit' 
    });
    
    try {
      execSync('git commit -m "Add Voice AI railway config\n\nCo-authored-by: Ona <no-reply@ona.com>"', { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit' 
      });
      
      execSync('git push origin main', { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit' 
      });
      console.log('✅ Pushed to GitHub');
    } catch (e) {
      console.log('⚠️  Nothing to commit or already pushed');
    }
    console.log('');

    // 4. Instrucțiuni finale
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ VOICE AI READY!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('ULTIMII 2 PAȘI (1 minut):');
    console.log('');
    console.log('1. Railway Dashboard:');
    console.log('   https://railway.app');
    console.log('   Serviciu: web-production-f0714.up.railway.app');
    console.log('   Settings → Source → Connect Repo:');
    console.log('   SuperPartyByAI/superparty-ai-backend (branch: master)');
    console.log('');
    console.log('2. Twilio Console:');
    console.log('   https://console.twilio.com/');
    console.log('   Phone Numbers → +1 (218) 220-4425');
    console.log('   A call comes in:');
    console.log('   https://web-production-f0714.up.railway.app/api/voice/incoming');
    console.log('');
    console.log('Apoi sună la: +1 (218) 220-4425');
    console.log('Voce: Kasya (Coqui XTTS)');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');

    return true;

  } catch (error) {
    console.error('❌ Eroare:', error.message);
    return false;
  }
}

// Run
if (require.main === module) {
  deploy().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { deploy };
