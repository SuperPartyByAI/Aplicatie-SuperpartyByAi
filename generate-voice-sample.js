#!/usr/bin/env node

/**
 * Generate voice sample from ElevenLabs for cloning
 */

const ElevenLabs = require('@elevenlabs/elevenlabs-js').ElevenLabsClient;
const fs = require('fs');
const path = require('path');

async function generateSample() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = 'QtObtrglHRaER8xlDZsr'; // Kasya voice
  
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY not set');
    process.exit(1);
  }
  
  const client = new ElevenLabs({ apiKey });
  
  // Text for sample (varied emotions and tones)
  const sampleText = `Bună, sunt Kasya de la SuperParty. 
  Cu ce vă pot ajuta astăzi? 
  Perfect, am notat data și locația. 
  Vă sun înapoi cu confirmare în cel mai scurt timp. 
  Mulțumesc și o zi bună!`;
  
  console.log('🎤 Generating voice sample from ElevenLabs...');
  console.log(`   Voice ID: ${voiceId}`);
  console.log(`   Text length: ${sampleText.length} characters`);
  
  try {
    const audio = await client.textToSpeech.convert(voiceId, {
      text: sampleText,
      model_id: 'eleven_multilingual_v2'
    });
    
    // Save to file
    const outputPath = path.join(__dirname, 'kasya-voice-sample.mp3');
    const chunks = [];
    
    for await (const chunk of audio) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    fs.writeFileSync(outputPath, buffer);
    
    console.log('✅ Voice sample generated!');
    console.log(`   Saved to: ${outputPath}`);
    console.log(`   Size: ${(buffer.length / 1024).toFixed(2)} KB`);
    console.log('');
    console.log('📋 Next steps:');
    console.log('   1. Listen to the sample to verify quality');
    console.log('   2. Use this sample to train Coqui XTTS');
    console.log('   3. Test cloned voice quality');
    
  } catch (error) {
    console.error('❌ Error generating sample:', error.message);
    process.exit(1);
  }
}

generateSample();
