const { ElevenLabsClient } = require('elevenlabs');

class ElevenLabsHandler {
  constructor() {
    this.client = null;
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Default: Sarah (Romanian)
    this.enabled = false;

    if (process.env.ELEVENLABS_API_KEY) {
      try {
        this.client = new ElevenLabsClient({
          apiKey: process.env.ELEVENLABS_API_KEY
        });
        this.enabled = true;
        console.log('[ElevenLabs] Initialized with voice:', this.voiceId);
      } catch (error) {
        console.error('[ElevenLabs] Initialization failed:', error.message);
      }
    } else {
      console.warn('[ElevenLabs] API key not configured');
    }
  }

  isConfigured() {
    return this.enabled && this.client;
  }

  /**
   * Generate speech from text using ElevenLabs
   */
  async generateSpeech(text) {
    if (!this.isConfigured()) {
      console.warn('[ElevenLabs] Service not available');
      return null;
    }

    try {
      console.log(`[ElevenLabs] Generating speech (${text.length} chars)`);

      const audio = await this.client.generate({
        voice: this.voiceId,
        text: text,
        model_id: 'eleven_turbo_v2_5', // Fastest, best for real-time
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      });

      // Convert audio stream to buffer
      const chunks = [];
      for await (const chunk of audio) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Return as base64 data URL for Twilio
      const base64Audio = buffer.toString('base64');
      const dataUrl = `data:audio/mpeg;base64,${base64Audio}`;

      console.log(`[ElevenLabs] Generated ${buffer.length} bytes`);
      return dataUrl;

    } catch (error) {
      console.error('[ElevenLabs] Generation failed:', error.message);
      return null;
    }
  }

  /**
   * List available voices
   */
  async listVoices() {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const voices = await this.client.voices.getAll();
      return voices.voices || [];
    } catch (error) {
      console.error('[ElevenLabs] Failed to list voices:', error.message);
      return [];
    }
  }
}

module.exports = ElevenLabsHandler;
