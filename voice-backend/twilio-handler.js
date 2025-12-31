const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;
const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

class TwilioHandler {
  constructor(voiceAI) {
    this.voiceAI = voiceAI;
    this.activeCalls = new Map();
  }

  /**
   * Generate Twilio Access Token for browser client
   */
  generateAccessToken(req, res) {
    const { identity } = req.body;
    
    if (!identity) {
      return res.status(400).json({ success: false, error: 'Identity required' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

    if (!accountSid || !apiKey || !apiSecret) {
      return res.status(500).json({ 
        success: false, 
        error: 'Twilio credentials not configured' 
      });
    }

    // Create access token
    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: identity,
      ttl: 3600 // 1 hour
    });

    // Create voice grant
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true
    });

    token.addGrant(voiceGrant);

    res.json({
      success: true,
      token: token.toJwt(),
      identity: identity
    });
  }

  /**
   * Handle incoming call
   */
  handleIncomingCall(req, res) {
    const { CallSid, From, To } = req.body;

    console.log('[Twilio] Incoming call:', { callSid: CallSid, from: From });

    this.activeCalls.set(CallSid, {
      callId: CallSid,
      from: From,
      to: To,
      status: 'ringing',
      createdAt: new Date().toISOString()
    });

    const twiml = new VoiceResponse();
    
    // Wait for 3 rings before answering (approximately 9 seconds)
    // Each ring is about 3 seconds
    twiml.pause({ length: 9 });
    
    // Direct to AI conversation
    twiml.redirect({
      method: 'POST'
    }, `${process.env.BACKEND_URL}/api/voice/ai-conversation?CallSid=${CallSid}&From=${From}&initial=true`);

    res.type('text/xml');
    res.send(twiml.toString());
  }

  /**
   * Handle AI conversation
   */
  async handleAIConversation(req, res) {
    try {
      const { CallSid, From, SpeechResult, initial } = req.body;
      
      const twiml = new VoiceResponse();
      
      if (initial === 'true') {
        // First message - greeting
        const greeting = 'Bună ziua, SuperParty, cu ce vă ajut?';
        
        // Try to get audio from Coqui
        let audioUrl = null;
        if (this.voiceAI.coqui?.isConfigured()) {
          audioUrl = await this.voiceAI.coqui.generateSpeech(greeting);
        }
        
        if (audioUrl) {
          // Use Kasya voice from Coqui
          console.log('[Voice] Using Coqui XTTS (Kasya voice)');
          const fullUrl = `${process.env.COQUI_API_URL || 'https://web-production-00dca9.up.railway.app'}${audioUrl}`;
          twiml.play(fullUrl);
        } else {
          // Fallback to Google voice (more natural than Polly)
          console.log('[Voice] Using Google Wavenet (fallback)');
          twiml.say({
            voice: 'Google.ro-RO-Wavenet-A',
            language: 'ro-RO'
          }, greeting);
        }
        
        // Gather speech input
        const gather = twiml.gather({
          input: 'speech',
          language: 'ro-RO',
          speechTimeout: 'auto',
          action: `${process.env.BACKEND_URL}/api/voice/ai-conversation`,
          method: 'POST'
        });
        
      } else if (SpeechResult) {
        // Process user input
        const result = await this.voiceAI.processConversation(CallSid, SpeechResult);
        
        if (result.completed) {
          // Conversation complete
          if (result.audioUrl) {
            const fullUrl = `${process.env.COQUI_API_URL || 'https://web-production-00dca9.up.railway.app'}${result.audioUrl}`;
            twiml.play(fullUrl);
          } else {
            twiml.say({
              voice: 'Google.ro-RO-Wavenet-A',
              language: 'ro-RO'
            }, result.response);
          }
          
          twiml.hangup();
          
          // Clean up
          this.voiceAI.endConversation(CallSid);
          this.activeCalls.delete(CallSid);
          
        } else {
          // Continue conversation
          if (result.audioUrl) {
            const fullUrl = `${process.env.COQUI_API_URL || 'https://web-production-00dca9.up.railway.app'}${result.audioUrl}`;
            twiml.play(fullUrl);
          } else {
            twiml.say({
              voice: 'Google.ro-RO-Wavenet-A',
              language: 'ro-RO'
            }, result.response);
          }
          
          // Gather next input
          const gather = twiml.gather({
            input: 'speech',
            language: 'ro-RO',
            speechTimeout: 'auto',
            action: `${process.env.BACKEND_URL}/api/voice/ai-conversation`,
            method: 'POST'
          });
        }
      } else {
        // No input - repeat
        twiml.say({
          voice: 'Google.ro-RO-Wavenet-A',
          language: 'ro-RO'
        }, 'Nu am primit nicio informație. Vă rog să repetați.');
        
        const gather = twiml.gather({
          input: 'speech',
          language: 'ro-RO',
          speechTimeout: 'auto',
          action: `${process.env.BACKEND_URL}/api/voice/ai-conversation`,
          method: 'POST'
        });
      }

      res.type('text/xml');
      res.send(twiml.toString());
      
    } catch (error) {
      console.error('[Twilio] Error in AI conversation:', error);
      
      const twiml = new VoiceResponse();
      twiml.say({
        voice: 'Google.ro-RO-Wavenet-A',
        language: 'ro-RO'
      }, 'Ne pare rău, a apărut o eroare. Vă rugăm să sunați din nou.');
      twiml.hangup();
      
      res.type('text/xml');
      res.send(twiml.toString());
    }
  }

  /**
   * Handle IVR response (not used, direct to AI)
   */
  handleIVRResponse(req, res) {
    const twiml = new VoiceResponse();
    twiml.redirect({
      method: 'POST'
    }, `${process.env.BACKEND_URL}/api/voice/ai-conversation?initial=true`);
    
    res.type('text/xml');
    res.send(twiml.toString());
  }

  /**
   * Handle call status
   */
  handleCallStatus(req, res) {
    const { CallSid, CallStatus, CallDuration } = req.body;

    console.log('[Twilio] Call status:', { callSid: CallSid, status: CallStatus });

    const callData = this.activeCalls.get(CallSid);
    if (callData) {
      callData.status = CallStatus;
      callData.duration = parseInt(CallDuration) || 0;

      if (CallStatus === 'completed' || CallStatus === 'failed') {
        this.activeCalls.delete(CallSid);
      }
    }

    res.sendStatus(200);
  }

  /**
   * Get active calls
   */
  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }
}

module.exports = TwilioHandler;
