const { HumeClient } = require('hume');
const FormData = require('form-data');

class HumeEmotionHandler {
  constructor() {
    this.client = null;
    
    if (process.env.HUME_API_KEY && process.env.HUME_SECRET_KEY) {
      this.client = new HumeClient({
        apiKey: process.env.HUME_API_KEY,
        secretKey: process.env.HUME_SECRET_KEY
      });
      console.log('✅ Hume AI initialized');
    } else {
      console.log('⚠️  Hume AI disabled (missing API keys)');
    }
  }

  /**
   * Analyze emotions from audio buffer
   * @param {Buffer} audioBuffer - Audio data (WAV/MP3)
   * @returns {Object} Emotion analysis with top emotions
   */
  async analyzeEmotions(audioBuffer) {
    if (!this.client) {
      console.log('⚠️  Hume AI not configured, skipping emotion analysis');
      return null;
    }

    try {
      console.log('🎭 Analyzing emotions with Hume AI...');
      
      // Create form data with audio
      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: 'audio.wav',
        contentType: 'audio/wav'
      });

      // Call Hume API
      const response = await this.client.expressionMeasurement.batch.startInferenceJob({
        models: {
          prosody: {}
        },
        files: [audioBuffer]
      });

      // Wait for job completion
      const jobId = response.jobId;
      let result = await this.client.expressionMeasurement.batch.getJobDetails(jobId);
      
      // Poll until complete (max 30s)
      let attempts = 0;
      while (result.state === 'RUNNING' && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        result = await this.client.expressionMeasurement.batch.getJobDetails(jobId);
        attempts++;
      }

      if (result.state !== 'COMPLETED') {
        console.error('❌ Hume job failed or timeout:', result.state);
        return null;
      }

      // Extract emotions
      const predictions = result.predictions?.[0]?.results?.predictions?.[0];
      if (!predictions || !predictions.emotions) {
        console.log('⚠️  No emotions detected');
        return null;
      }

      // Get top emotions
      const emotions = predictions.emotions
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const emotionData = {
        topEmotion: emotions[0].name,
        topScore: emotions[0].score,
        emotions: emotions.map(e => ({
          name: e.name,
          score: Math.round(e.score * 100)
        })),
        prosody: {
          pitch: predictions.prosody?.pitch || 'unknown',
          energy: predictions.prosody?.energy || 'unknown',
          speechRate: predictions.prosody?.speechRate || 'unknown'
        }
      };

      console.log('✅ Emotions detected:', emotionData.emotions.map(e => `${e.name}:${e.score}%`).join(', '));
      
      return emotionData;
    } catch (error) {
      console.error('❌ Hume emotion analysis error:', error.message);
      return null;
    }
  }

  /**
   * Determine client style from emotions
   * @param {Object} emotionData - Emotion analysis from Hume
   * @returns {String} Client style: formal|casual|stressed|confused|excited
   */
  determineClientStyle(emotionData) {
    if (!emotionData) {
      return 'neutral';
    }

    const { topEmotion, topScore, emotions } = emotionData;
    const emotionMap = {};
    emotions.forEach(e => emotionMap[e.name.toLowerCase()] = e.score);

    // Detect stressed/anxious
    if (emotionMap['anxiety'] > 60 || emotionMap['stress'] > 60 || emotionMap['fear'] > 50) {
      return 'stressed';
    }

    // Detect confused/uncertain
    if (emotionMap['confusion'] > 60 || emotionMap['doubt'] > 60 || emotionMap['uncertainty'] > 60) {
      return 'confused';
    }

    // Detect excited/happy
    if (emotionMap['joy'] > 70 || emotionMap['excitement'] > 70 || emotionMap['amusement'] > 60) {
      return 'excited';
    }

    // Detect sad/disappointed
    if (emotionMap['sadness'] > 60 || emotionMap['disappointment'] > 60) {
      return 'sad';
    }

    // Detect calm/neutral (formal)
    if (emotionMap['calmness'] > 60 || emotionMap['contentment'] > 60) {
      return 'formal';
    }

    // Default to casual
    return 'casual';
  }

  /**
   * Get voice parameters based on emotions
   * @param {Object} emotionData - Emotion analysis
   * @returns {Object} Voice control parameters
   */
  getVoiceParameters(emotionData) {
    if (!emotionData) {
      return {
        style: 'neutral',
        rate: 1.0,
        energy: 0.5,
        pitch: 0,
        pauses: 'normal'
      };
    }

    const style = this.determineClientStyle(emotionData);
    const prosody = emotionData.prosody;

    // Map client style to voice parameters
    const styleMap = {
      'formal': {
        style: 'neutral',
        rate: 0.95,
        energy: 0.45,
        pitch: 0,
        pauses: 'normal'
      },
      'casual': {
        style: 'warm',
        rate: 1.0,
        energy: 0.6,
        pitch: 0,
        pauses: 'light'
      },
      'stressed': {
        style: 'neutral',
        rate: 1.1,
        energy: 0.55,
        pitch: 0,
        pauses: 'light'
      },
      'confused': {
        style: 'reassuring',
        rate: 0.9,
        energy: 0.45,
        pitch: -1,
        pauses: 'normal'
      },
      'excited': {
        style: 'cheerful',
        rate: 1.05,
        energy: 0.65,
        pitch: 1,
        pauses: 'light'
      },
      'sad': {
        style: 'reassuring',
        rate: 0.95,
        energy: 0.5,
        pitch: -1,
        pauses: 'normal'
      }
    };

    return styleMap[style] || styleMap['casual'];
  }

  /**
   * Analyze audio from Twilio recording URL
   * @param {string} recordingUrl - Twilio recording URL
   * @returns {Object} Emotion analysis with client style
   */
  async analyzeAudio(recordingUrl) {
    if (!this.client) {
      return null;
    }

    try {
      // Download audio from Twilio
      const https = require('https');
      const audioBuffer = await new Promise((resolve, reject) => {
        https.get(recordingUrl, (res) => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }).on('error', reject);
      });

      console.log(`[Hume] Downloaded audio: ${audioBuffer.length} bytes`);

      // Analyze emotions
      const emotionData = await this.analyzeEmotions(audioBuffer);
      
      if (!emotionData) {
        return null;
      }

      // Determine client style
      const clientStyle = this.determineClientStyle(emotionData);
      
      return {
        ...emotionData,
        clientStyle,
        topEmotions: emotionData.emotions
      };
    } catch (error) {
      console.error('[Hume] Error analyzing audio from URL:', error.message);
      return null;
    }
  }
}

module.exports = HumeEmotionHandler;
