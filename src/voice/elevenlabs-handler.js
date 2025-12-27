const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const fs = require('fs');
const path = require('path');

class ElevenLabsHandler {
  constructor() {
    this.client = null;
    this.apiKey = null;
    // Voce feminină română - Jane (Professional Audiobook Reader)
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'QtObtrglHRaER8xlDZsr'; // Jane
    
    if (process.env.ELEVENLABS_API_KEY) {
      this.apiKey = process.env.ELEVENLABS_API_KEY;
      this.client = new ElevenLabsClient({
        apiKey: this.apiKey
      });
      console.log('[ElevenLabs] Initialized with voice:', this.voiceId);
    } else {
      console.warn('[ElevenLabs] API key missing - using fallback voice');
    }
  }

  /**
   * Generate speech from text and return audio URL
   */
  async textToSpeech(text) {
    if (!this.client || !this.apiKey) {
      return null; // Fallback to Google Wavenet
    }

    try {
      console.log(`[ElevenLabs] Generating speech: "${text.substring(0, 50)}..."`);
      
      // Use textToSpeech method from SDK v2
      const audio = await this.client.textToSpeech.convert(this.voiceId, {
        text: text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: {
          stability: 0.50,
          similarity_boost: 0.75
        }
      });

      // Save audio to temporary file
      const tempDir = path.join(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const filename = `speech_${Date.now()}.mp3`;
      const filepath = path.join(tempDir, filename);
      
      // Write audio stream to file
      const chunks = [];
      for await (const chunk of audio) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      fs.writeFileSync(filepath, buffer);

      console.log(`[ElevenLabs] Audio saved: ${filename}`);
      
      // Return public URL (trebuie să servim fișierul)
      return `/audio/${filename}`;
      
    } catch (error) {
      console.error('[ElevenLabs] Error:', error.message);
      return null; // Fallback to Google Wavenet
    }
  }

  /**
   * Check if ElevenLabs is configured
   */
  isConfigured() {
    return this.client !== null;
  }

  /**
   * Cleanup old audio files (older than 1 hour)
   */
  cleanupOldFiles() {
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) return;

    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    files.forEach(file => {
      const filepath = path.join(tempDir, file);
      const stats = fs.statSync(filepath);
      if (now - stats.mtimeMs > oneHour) {
        fs.unlinkSync(filepath);
        console.log(`[ElevenLabs] Cleaned up old file: ${file}`);
      }
    });
  }
}

module.exports = ElevenLabsHandler;
