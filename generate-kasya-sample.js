#!/usr/bin/env node

/**
 * Generate perfect voice sample from ElevenLabs for Coqui cloning
 * This creates a 15-second sample with varied intonation
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = 'QtObtrglHRaER8xlDZsr'; // Kasya voice

// Text with varied emotions and intonations for better cloning
const SAMPLE_TEXT = `Bună ziua, sunt Kasya de la SuperParty. 
Cu ce vă pot ajuta astăzi? 
Perfect, am notat data și locația evenimentului. 
Pentru câte ore vă interesează pachetul? 
Excelent! Avem pachet cu doi personaje și confetti party la opt sute patruzeci lei. 
Vă sun înapoi cu confirmare în cel mai scurt timp. 
Mulțumesc frumos și o zi bună!`;

async function generateSample() {
  if (!ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY not set in environment');
    console.log('');
    console.log('Set it with:');
    console.log('export ELEVENLABS_API_KEY="your_key_here"');
    process.exit(1);
  }

  console.log('🎤 Generating Kasya voice sample from ElevenLabs...');
  console.log(`   Voice ID: ${VOICE_ID}`);
  console.log(`   Text length: ${SAMPLE_TEXT.length} characters`);
  console.log('');

  const postData = JSON.stringify({
    text: SAMPLE_TEXT,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true
    }
  });

  const options = {
    hostname: 'api.elevenlabs.io',
    port: 443,
    path: `/v1/text-to-speech/${VOICE_ID}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        console.error(`❌ HTTP ${res.statusCode}: ${res.statusMessage}`);
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const outputPath = path.join(__dirname, 'coqui-tts-service', 'models', 'kasya-reference.wav');
      
      // Create models directory if it doesn't exist
      const modelsDir = path.dirname(outputPath);
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }

      const fileStream = fs.createWriteStream(outputPath);
      let totalBytes = 0;

      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        fileStream.write(chunk);
      });

      res.on('end', () => {
        fileStream.end();
        console.log('✅ Voice sample generated successfully!');
        console.log(`   Saved to: ${outputPath}`);
        console.log(`   Size: ${(totalBytes / 1024).toFixed(2)} KB`);
        console.log('');
        console.log('📋 Next steps:');
        console.log('   1. Listen to verify quality: play coqui-tts-service/models/kasya-reference.wav');
        console.log('   2. Deploy Coqui service: cd coqui-tts-service && railway up');
        console.log('   3. Test voice cloning');
        resolve(outputPath);
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Run
generateSample().catch((error) => {
  console.error('❌ Failed:', error.message);
  process.exit(1);
});
