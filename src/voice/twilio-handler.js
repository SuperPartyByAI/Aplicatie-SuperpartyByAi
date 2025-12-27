const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

class TwilioHandler {
  constructor(io, callStorage, voiceAI) {
    this.io = io;
    this.callStorage = callStorage;
    this.voiceAI = voiceAI;
    this.activeCalls = new Map();
  }

  /**
   * Handle incoming call webhook from Twilio
   */
  handleIncomingCall(req, res) {
    const { CallSid, From, To, CallStatus } = req.body;

    console.log('[Twilio] Incoming call:', {
      callSid: CallSid,
      from: From,
      to: To,
      status: CallStatus
    });

    // Create call record
    const callData = {
      callId: CallSid,
      from: From,
      to: To,
      direction: 'inbound',
      status: CallStatus,
      createdAt: new Date().toISOString()
    };

    // Store in memory
    this.activeCalls.set(CallSid, callData);

    // Notify frontend via Socket.io
    this.io.emit('call:incoming', callData);

    // Save to Firestore
    this.callStorage.saveCall(callData).catch(err => {
      console.error('[Twilio] Error saving call:', err);
    });

    // Redirect directly to Voice AI (no IVR menu)
    const twiml = new VoiceResponse();
    twiml.redirect({
      method: 'POST'
    }, `${process.env.BACKEND_URL || 'https://web-production-f0714.up.railway.app'}/api/voice/ai-conversation?CallSid=${CallSid}&From=${From}`);

    res.type('text/xml');
    res.send(twiml.toString());
  }

  /**
   * Handle IVR menu selection
   */
  handleIVRResponse(req, res) {
    const { Digits, CallSid, From } = req.body;
    
    console.log('[Twilio] IVR selection:', {
      callSid: CallSid,
      digits: Digits,
      from: From
    });

    const twiml = new VoiceResponse();

    if (Digits === '1') {
      // Option 1: Voice AI reservation with recording
      
      // Start recording using Twilio REST API
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const client = require('twilio')(accountSid, authToken);
      
      client.calls(CallSid)
        .recordings
        .create({
          recordingStatusCallback: `${process.env.BACKEND_URL || 'https://web-production-f0714.up.railway.app'}/api/voice/recording-status`,
          recordingStatusCallbackMethod: 'POST'
        })
        .then(recording => {
          console.log('[Twilio] Recording started:', recording.sid);
        })
        .catch(err => {
          console.error('[Twilio] Failed to start recording:', err);
        });
      
      twiml.say({
        voice: 'Google.ro-RO-Wavenet-A',
        language: 'ro-RO'
      }, 'Va conectez cu asistentul virtual pentru rezervare.');
      
      // Redirect to Voice AI handler
      twiml.redirect({
        method: 'POST'
      }, `${process.env.BACKEND_URL || 'https://web-production-f0714.up.railway.app'}/api/voice/ai-conversation?CallSid=${CallSid}&From=${From}`);
      
    } else if (Digits === '2') {
      // Option 2: Connect to operator
      twiml.say({
        voice: 'Google.ro-RO-Wavenet-A',
        language: 'ro-RO'
      }, 'Va conectez cu un operator. Va rugam asteptati.');
      
      const dial = twiml.dial({
        timeout: 30,
        callerId: From,
        record: 'record-from-answer',
        recordingStatusCallback: `${process.env.BACKEND_URL || 'https://web-production-f0714.up.railway.app'}/api/voice/recording-status`,
        recordingStatusCallbackMethod: 'POST',
        action: `${process.env.BACKEND_URL || 'https://web-production-f0714.up.railway.app'}/api/voice/status`,
        method: 'POST'
      });
      
      dial.client('operator');
      
      // If no answer
      twiml.say({
        voice: 'Google.ro-RO-Wavenet-A',
        language: 'ro-RO'
      }, 'Ne pare rau, toti operatorii sunt ocupati. Va rugam sa sunati mai tarziu.');
      
    } else {
      // Invalid selection
      twiml.say({
        voice: 'Google.ro-RO-Wavenet-A',
        language: 'ro-RO'
      }, 'Selectie invalida. Va rugam sa sunati din nou.');
    }

    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }

  /**
   * Handle call status updates from Twilio
   */
  handleCallStatus(req, res) {
    const { CallSid, CallStatus, CallDuration } = req.body;

    console.log('[Twilio] Call status update:', {
      callSid: CallSid,
      status: CallStatus,
      duration: CallDuration
    });

    // Update call record
    const callData = this.activeCalls.get(CallSid);
    if (callData) {
      callData.status = CallStatus;
      callData.duration = parseInt(CallDuration) || 0;
      callData.updatedAt = new Date().toISOString();

      // Notify frontend
      this.io.emit('call:status', callData);

      // Update in Firestore
      this.callStorage.updateCall(CallSid, {
        status: CallStatus,
        duration: callData.duration,
        updatedAt: callData.updatedAt
      }).catch(err => {
        console.error('[Twilio] Error updating call:', err);
      });

      // Remove from active calls if completed
      if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
        this.activeCalls.delete(CallSid);
        this.io.emit('call:ended', callData);
      }
    }

    res.sendStatus(200);
  }

  /**
   * Answer call from dashboard
   */
  answerCall(callSid, operatorId) {
    const callData = this.activeCalls.get(callSid);
    if (!callData) {
      throw new Error('Call not found');
    }

    console.log('[Twilio] Call answered by operator:', {
      callSid,
      operatorId
    });

    callData.status = 'in-progress';
    callData.answeredBy = operatorId;
    callData.answeredAt = new Date().toISOString();

    // Notify frontend
    this.io.emit('call:answered', callData);

    // Update in Firestore
    this.callStorage.updateCall(callSid, {
      status: 'in-progress',
      answeredBy: operatorId,
      answeredAt: callData.answeredAt
    }).catch(err => {
      console.error('[Twilio] Error updating call:', err);
    });

    return callData;
  }

  /**
   * Reject call from dashboard
   */
  rejectCall(callSid, reason) {
    const callData = this.activeCalls.get(callSid);
    if (!callData) {
      throw new Error('Call not found');
    }

    console.log('[Twilio] Call rejected:', {
      callSid,
      reason
    });

    callData.status = 'rejected';
    callData.rejectedReason = reason;
    callData.rejectedAt = new Date().toISOString();

    // Remove from active calls
    this.activeCalls.delete(callSid);

    // Notify frontend
    this.io.emit('call:rejected', callData);

    // Update in Firestore
    this.callStorage.updateCall(callSid, {
      status: 'rejected',
      rejectedReason: reason,
      rejectedAt: callData.rejectedAt
    }).catch(err => {
      console.error('[Twilio] Error updating call:', err);
    });

    return callData;
  }

  /**
   * Get active calls
   */
  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Get call by ID
   */
  getCall(callSid) {
    return this.activeCalls.get(callSid);
  }
}

module.exports = TwilioHandler;
