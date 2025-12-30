const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

class TwilioHandler {
  constructor(voiceAI, humeHandler) {
    this.voiceAI = voiceAI;
    this.humeHandler = humeHandler;
    this.activeCalls = new Map();
    this.callEmotions = new Map(); // Store emotions per call
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
        
        // Gather speech input with recording for emotion analysis
        const gather = twiml.gather({
          input: 'speech',
          language: 'ro-RO',
          speechTimeout: 'auto',
          action: `${process.env.BACKEND_URL}/api/voice/ai-conversation`,
          method: 'POST',
          speechModel: 'phone_call'
        });
        
        // Record for emotion analysis (Hume AI)
        if (this.humeHandler) {
          twiml.record({
            maxLength: 30,
            recordingStatusCallback: `${process.env.BACKEND_URL}/api/voice/recording-callback`,
            recordingStatusCallbackMethod: 'POST'
          });
        }
        
      } else if (SpeechResult) {
        // Get emotions for this call (if available)
        const emotions = this.callEmotions.get(CallSid);
        
        // Process user input with emotions
        const result = await this.voiceAI.processConversation(CallSid, SpeechResult, emotions);
        
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

  /**
   * Handle recording callback from Twilio
   */
  async handleRecordingCallback(req, res) {
    try {
      const { CallSid, RecordingUrl, RecordingSid } = req.body;
      
      if (!this.humeHandler) {
        return res.status(200).send('OK');
      }

      console.log(`[Hume] Processing recording for call ${CallSid}: ${RecordingUrl}`);

      // Download and analyze audio with Hume AI
      const emotions = await this.humeHandler.analyzeAudio(RecordingUrl);
      
      if (emotions) {
        // Store emotions for this call
        this.callEmotions.set(CallSid, emotions);
        console.log(`[Hume] Detected emotions for ${CallSid}:`, emotions);
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('[Hume] Recording callback error:', error);
      res.status(500).send('Error processing recording');
    }
  }
}

module.exports = TwilioHandler;
