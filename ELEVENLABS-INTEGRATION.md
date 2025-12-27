# Integrare ElevenLabs pentru Voce Naturală

## 🎯 Obiectiv
Înlocuiește Amazon Polly (robotizat) cu ElevenLabs (ultra-natural) pentru Voice AI.

---

## 📋 Pași

### 1. Creează cont ElevenLabs

1. Mergi la: https://elevenlabs.io
2. Sign up (free trial sau Starter $5/lună)
3. Copiază API Key din Settings

### 2. Alege voce română

1. Voice Library → Search "Romanian"
2. Recomandări:
   - **"Matilda"** - Voce feminină, caldă, profesională
   - **"Rachel"** - Voce feminină, prietenoasă
   - **"Adam"** - Voce masculină (dacă preferi)
3. Testează fiecare și alege
4. Copiază Voice ID

### 3. Adaugă în Railway

Railway Dashboard → Variables:

```
ELEVENLABS_API_KEY=your_api_key_here
ELEVENLABS_VOICE_ID=voice_id_here
```

### 4. Instalează dependență

```bash
npm install elevenlabs
```

### 5. Creează handler ElevenLabs

**Fișier:** `src/voice/elevenlabs-handler.js`

```javascript
const { ElevenLabsClient } = require('elevenlabs');

class ElevenLabsHandler {
  constructor() {
    this.client = null;
    this.voiceId = process.env.ELEVENLABS_VOICE_ID;
    
    if (process.env.ELEVENLABS_API_KEY) {
      this.client = new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY
      });
      console.log('[ElevenLabs] Initialized');
    } else {
      console.warn('[ElevenLabs] API key missing');
    }
  }

  /**
   * Generate speech from text
   */
  async textToSpeech(text) {
    if (!this.client) {
      throw new Error('ElevenLabs not configured');
    }

    try {
      const audio = await this.client.generate({
        voice: this.voiceId,
        text: text,
        model_id: 'eleven_multilingual_v2', // Suportă română
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true
        }
      });

      return audio;
    } catch (error) {
      console.error('[ElevenLabs] Error:', error);
      throw error;
    }
  }

  /**
   * Stream speech to Twilio
   */
  async streamToTwilio(text, callSid) {
    const audio = await this.textToSpeech(text);
    
    // Convert to format Twilio expects
    // Return audio stream URL or base64
    return audio;
  }
}

module.exports = ElevenLabsHandler;
```

### 6. Actualizează Voice AI handler

**Fișier:** `src/voice/voice-ai-handler.js`

```javascript
const ElevenLabsHandler = require('./elevenlabs-handler');

class VoiceAIHandler {
  constructor() {
    // ... existing code ...
    this.elevenLabs = new ElevenLabsHandler();
  }

  async processConversation(callSid, userMessage) {
    // ... existing GPT-4o logic ...
    
    const response = result.response;
    
    // Generate natural speech with ElevenLabs
    const audioUrl = await this.elevenLabs.streamToTwilio(response, callSid);
    
    return {
      response: response,
      audioUrl: audioUrl, // Pentru Twilio
      completed: result.completed,
      data: result.data
    };
  }
}
```

### 7. Actualizează Twilio TwiML

**Fișier:** `src/index.js` - endpoint `/api/voice/ai-conversation`

```javascript
// În loc de:
gather.say({
  voice: 'Polly.Carmen',
  language: 'ro-RO'
}, result.response);

// Folosește:
if (result.audioUrl) {
  gather.play(result.audioUrl); // ElevenLabs audio
} else {
  // Fallback la Polly dacă ElevenLabs eșuează
  gather.say({
    voice: 'Polly.Carmen',
    language: 'ro-RO'
  }, result.response);
}
```

---

## 💰 Costuri ElevenLabs

### Free Tier:
- 10,000 caractere/lună
- ~20-30 apeluri
- Voce naturală

### Starter ($5/lună):
- 30,000 caractere/lună
- ~60-90 apeluri
- Toate vocile

### Creator ($22/lună):
- 100,000 caractere/lună
- ~200-300 apeluri
- Voice cloning

**Estimare pentru tine:** Starter $5/lună (suficient pentru 60-90 apeluri)

---

## 🎯 Alternativă SIMPLĂ (fără cod):

### Twilio Voice AI Assistant (BETA)

Twilio tocmai a lansat Voice AI Assistant cu voce naturală built-in!

**Avantaje:**
- ✅ Voce naturală (Google WaveNet)
- ✅ Fără cod extra
- ✅ Integrare directă
- ✅ Cost: $0.06/min (similar cu ce ai acum)

**Dezavantaj:**
- ⚠️ BETA (poate avea bugs)
- ⚠️ Mai puțin control decât ElevenLabs

**Setup:** 15 minute în Twilio Console

---

## ❓ Ce preferi?

**A)** ElevenLabs (voce ULTRA naturală, $5/lună, 30 min integrare)

**B)** Twilio Voice AI Assistant (voce naturală, $0.06/min, 15 min setup, BETA)

**C)** Google WaveNet (voce bună, $4-16/lună, 1 oră integrare)

**Spune-mi și implementez!**
