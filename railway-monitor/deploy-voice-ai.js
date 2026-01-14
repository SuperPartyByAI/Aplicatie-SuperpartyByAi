/**
 * v7.0 AUTO-DEPLOY: Voice AI Centrala Telefonică
 *
 * Deploy-ează automat centrala cu vocea Kasya (Coqui)
 */

const { execSync } = require('child_process');
const path = require('path');

// Credențiale din SECRETS-READY.md
const CREDENTIALS = {
  OPENAI_API_KEY:
    process.env.OPENAI_API_KEY || '<OPENAI_API_KEY>',
  TWILIO_ACCOUNT_SID: 'AC17c88873d670aab4aa4a50fae230d2df',
  TWILIO_API_KEY: process.env.TWILIO_API_KEY || '<TWILIO_API_KEY>',
  TWILIO_API_SECRET: process.env.TWILIO_API_SECRET || '<TWILIO_API_SECRET>',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '<TWILIO_AUTH_TOKEN>',
  TWILIO_PHONE_NUMBER: '+12182204425',
  TWILIO_TWIML_APP_SID: 'AP8da932519a1d77f5c363edf4a411c87c',
  TWILIO_WHATSAPP_NUMBER: 'whatsapp:+14155238886',
  BACKEND_URL: 'https://web-production-f0714.up.railway.app',
  COQUI_API_URL: 'https://web-production-00dca9.up.railway.app',
  NODE_ENV: 'production',
  PORT: '5001',
};

class VoiceAIDeployer {
  async deploy() {
    console.log('');
    console.log('============================================================');
    console.log('🎤 v7.0 AUTO-DEPLOY: Voice AI Centrala Telefonică');
    console.log('============================================================');
    console.log('');

    try {
      const voiceBackendPath = path.join(__dirname, '../voice-backend');

      // 1. Commit voice-backend folder
      console.log('📦 Commit voice-backend...');
      execSync('git add voice-backend/', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
      execSync(
        'git commit -m "Add Voice AI backend with Kasya voice (Coqui)\n\nCo-authored-by: Ona <no-reply@ona.com>"',
        {
          cwd: path.join(__dirname, '..'),
          stdio: 'inherit',
        }
      );
      console.log('✅ Committed');
      console.log('');

      // 2. Push to GitHub
      console.log('🚀 Push to GitHub...');
      execSync('git push origin main', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
      console.log('✅ Pushed');
      console.log('');

      // 3. Afișează instrucțiuni pentru Railway
      console.log('============================================================');
      console.log('📋 NEXT STEPS - CONFIGURARE RAILWAY');
      console.log('============================================================');
      console.log('');
      console.log('1. Mergi la Railway Dashboard:');
      console.log('   https://railway.app');
      console.log('');
      console.log('2. Găsește serviciul: web-production-f0714.up.railway.app');
      console.log('');
      console.log('3. Click pe serviciu → Settings → Source');
      console.log('   Schimbă Root Directory la: voice-backend');
      console.log('');
      console.log('4. Click pe serviciu → Variables');
      console.log('   Adaugă aceste variabile:');
      console.log('');

      for (const [key, value] of Object.entries(CREDENTIALS)) {
        console.log(`   ${key}=${value}`);
      }

      console.log('');
      console.log('5. Railway va redeploya automat');
      console.log('');
      console.log('============================================================');
      console.log('✅ VOICE AI READY TO DEPLOY');
      console.log('============================================================');
      console.log('');
      console.log('După deploy (2-3 minute):');
      console.log(`📱 Sună la: ${CREDENTIALS.TWILIO_PHONE_NUMBER}`);
      console.log('🎤 Voce: Kasya (clonată cu Coqui XTTS)');
      console.log('🤖 AI: GPT-4o (operator telefonic uman)');
      console.log('');

      return true;
    } catch (error) {
      console.error('❌ Eroare:', error.message);
      return false;
    }
  }
}

// Run if called directly
if (require.main === module) {
  const deployer = new VoiceAIDeployer();
  deployer.deploy().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = VoiceAIDeployer;
