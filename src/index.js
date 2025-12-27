require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
const TwilioHandler = require('./voice/twilio-handler');
const CallStorage = require('./voice/call-storage');
const TokenGenerator = require('./voice/token-generator');
const VoiceAIHandler = require('./voice/voice-ai-handler');
const ReservationStorage = require('./voice/reservation-storage');
const WhatsAppNotifier = require('./voice/whatsapp-notifier');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

// Initialize Firebase Admin
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin initialized');
  } else {
    console.warn('⚠️  Firebase Admin not configured - running in memory mode');
  }
} catch (error) {
  console.error('❌ Firebase Admin initialization failed:', error.message);
  console.warn('⚠️  Running in memory mode');
}

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For Twilio webhooks

// Initialize WhatsApp Manager (optional - only if dependencies available)
let whatsappManager = null;
try {
  const WhatsAppManager = require('./whatsapp/manager');
  whatsappManager = new WhatsAppManager(io);
  console.log('✅ WhatsApp Manager initialized');
} catch (error) {
  console.log('⚠️  WhatsApp Manager disabled (dependencies not installed)');
}

// Initialize Voice managers
const callStorage = new CallStorage();
const reservationStorage = new ReservationStorage();
const whatsappNotifier = new WhatsAppNotifier();
const voiceAI = new VoiceAIHandler();
const twilioHandler = new TwilioHandler(io, callStorage, voiceAI);
const tokenGenerator = new TokenGenerator();

// Serve ElevenLabs audio files
app.use('/audio', express.static(path.join(__dirname, '../temp')));

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'SuperParty Backend - WhatsApp + Voice',
    accounts: whatsappManager ? whatsappManager.getAccounts().length : 0,
    maxAccounts: 20,
    activeCalls: twilioHandler.getActiveCalls().length,
    whatsappEnabled: whatsappManager !== null
  });
});

// WhatsApp API Routes (only if WhatsApp is enabled)
app.get('/api/accounts', (req, res) => {
  if (!whatsappManager) {
    return res.status(503).json({ success: false, error: 'WhatsApp not available' });
  }
  try {
    const accounts = whatsappManager.getAccounts();
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/accounts/add', async (req, res) => {
  if (!whatsappManager) {
    return res.status(503).json({ success: false, error: 'WhatsApp Manager not available' });
  }
  try {
    const { name } = req.body;
    const account = await whatsappManager.addAccount(name);
    res.json({ success: true, account });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/accounts/:accountId', async (req, res) => {
  if (!whatsappManager) {
    return res.status(503).json({ success: false, error: 'WhatsApp Manager not available' });
  }
  try {
    const { accountId } = req.params;
    await whatsappManager.removeAccount(accountId);
    res.json({ success: true, message: 'Account removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/accounts/:accountId/chats', async (req, res) => {
  try {
    const { accountId } = req.params;
    const chats = await whatsappManager.getChats(accountId);
    res.json({ success: true, chats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/accounts/:accountId/chats/:chatId/messages', async (req, res) => {
  try {
    const { accountId, chatId } = req.params;
    const { limit } = req.query;
    const messages = await whatsappManager.getMessages(accountId, chatId, parseInt(limit) || 50);
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/accounts/:accountId/send', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { chatId, message } = req.body;
    await whatsappManager.sendMessage(accountId, chatId, message);
    res.json({ success: true, message: 'Message sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Client management endpoints
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await whatsappManager.getAllClients();
    res.json({ success: true, clients });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/clients/:clientId/messages', async (req, res) => {
  try {
    const { clientId } = req.params;
    const messages = await whatsappManager.getClientMessages(clientId);
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/clients/:clientId/messages', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { message } = req.body;
    const sentMessage = await whatsappManager.sendClientMessage(clientId, message);
    res.json({ success: true, message: sentMessage });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch('/api/clients/:clientId/status', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { status } = req.body;
    await whatsappManager.updateClientStatus(clientId, status);
    res.json({ success: true, message: 'Status updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Voice API Routes

// IVR menu response handler
app.post('/api/voice/ivr-response', (req, res) => {
  twilioHandler.handleIVRResponse(req, res);
});

// Voice AI conversation handler
app.post('/api/voice/ai-conversation', async (req, res) => {
  try {
    const { CallSid, From, SpeechResult, Digits } = req.body;
    
    console.log('[Voice AI] Processing:', {
      callSid: CallSid,
      from: From,
      speech: SpeechResult,
      digits: Digits
    });

    const twiml = new VoiceResponse();
    
    // Get user input (speech or digits)
    const userInput = SpeechResult || Digits || '';
    
    if (!userInput) {
      // First interaction - greet and ask first question with ElevenLabs
      const gather = twiml.gather({
        input: 'speech',
        language: 'ro-RO',
        speechTimeout: 0.5, // 0.5 second pause (minimum)
        action: `${process.env.BACKEND_URL || 'https://web-production-f0714.up.railway.app'}/api/voice/ai-conversation`,
        method: 'POST'
      });
      
      // Generate first message with ElevenLabs
      const firstMessage = 'Bună ziua! SuperParty. Cu ce vă pot ajuta?';
      const audioUrl = await voiceAI.elevenLabs.textToSpeech(firstMessage);
      
      if (audioUrl) {
        console.log('[Voice AI] Using ElevenLabs for first message');
        gather.play(`${process.env.BACKEND_URL || 'https://web-production-f0714.up.railway.app'}${audioUrl}`);
      } else {
        console.log('[Voice AI] ElevenLabs failed, using fallback');
        gather.say({
          voice: 'Polly.Ioana-Neural',
          language: 'ro-RO'
        }, firstMessage);
      }
      
    } else {
      // Process conversation with AI
      const result = await voiceAI.processConversation(CallSid, userInput);
      
      if (result.completed) {
        // Conversation complete - save reservation
        console.log('[Voice AI] Reservation complete:', result.data);
        
        // Save to Firestore
        try {
          const reservation = await reservationStorage.saveReservation(
            CallSid,
            result.data,
            From
          );
          console.log('[Voice AI] Reservation saved:', reservation.reservationId);
          
          // Send WhatsApp confirmation
          if (whatsappNotifier.isConfigured()) {
            const whatsappResult = await whatsappNotifier.sendReservationConfirmation(
              From,
              reservation
            );
            
            if (whatsappResult.success) {
              console.log('[Voice AI] WhatsApp sent:', whatsappResult.messageSid);
            } else {
              console.error('[Voice AI] WhatsApp failed:', whatsappResult.error);
            }
          } else {
            console.warn('[Voice AI] WhatsApp not configured - skipping notification');
          }
          
        } catch (error) {
          console.error('[Voice AI] Error saving reservation:', error);
        }
        
        // Use ElevenLabs if available, fallback to Azure Neural TTS
        if (result.audioUrl) {
          twiml.play(`${process.env.BACKEND_URL || 'https://web-production-f0714.up.railway.app'}${result.audioUrl}`);
        } else {
          twiml.say({
            voice: 'Polly.Ioana-Neural', // Azure Neural - voce feminină română naturală
            language: 'ro-RO'
          }, `Multumesc! Rezervarea dumneavoastra a fost inregistrata. Veti primi o confirmare pe WhatsApp. O zi buna!`);
        }
        
        twiml.hangup();
        
      } else {
        // Continue conversation
        const gather = twiml.gather({
          input: 'speech',
          language: 'ro-RO',
          speechTimeout: 0.5, // 0.5 second pause (minimum)
          action: `${process.env.BACKEND_URL || 'https://web-production-f0714.up.railway.app'}/api/voice/ai-conversation`,
          method: 'POST'
        });
        
        // Use ElevenLabs if available, fallback to Azure Neural TTS
        if (result.audioUrl) {
          gather.play(`${process.env.BACKEND_URL || 'https://web-production-f0714.up.railway.app'}${result.audioUrl}`);
        } else {
          gather.say({
            voice: 'Polly.Ioana-Neural', // Azure Neural - voce feminină română naturală
            language: 'ro-RO'
          }, result.response);
        }
      }
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('[Voice AI] Error:', error);
    
    const twiml = new VoiceResponse();
    twiml.say({
      voice: 'Google.ro-RO-Wavenet-A',
      language: 'ro-RO'
    }, 'Ne pare rau, a aparut o eroare. Va rugam sa sunati din nou.');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Generate Access Token for Twilio Client
app.post('/api/voice/token', (req, res) => {
  try {
    const { identity } = req.body;
    
    if (!identity) {
      return res.status(400).json({ success: false, error: 'Identity required' });
    }

    if (!tokenGenerator.isConfigured()) {
      return res.status(503).json({ 
        success: false, 
        error: 'Twilio Voice not configured. Missing API keys or TwiML App SID.' 
      });
    }

    const token = tokenGenerator.generateToken(identity);
    res.json({ success: true, token });
  } catch (error) {
    console.error('[Voice] Error generating token:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/voice/incoming', (req, res) => {
  twilioHandler.handleIncomingCall(req, res);
});

app.post('/api/voice/status', (req, res) => {
  twilioHandler.handleCallStatus(req, res);
});

app.post('/api/voice/recording-status', (req, res) => {
  const { CallSid, RecordingSid, RecordingUrl, RecordingDuration, RecordingStatus } = req.body;
  
  console.log('[Voice] Recording webhook received:', {
    callSid: CallSid,
    recordingSid: RecordingSid,
    recordingUrl: RecordingUrl,
    duration: RecordingDuration,
    status: RecordingStatus
  });

  // Only update when recording is completed
  if (RecordingStatus === 'completed' && RecordingUrl) {
    console.log('[Voice] Updating call with recording URL');
    callStorage.updateCall(CallSid, {
      recordingSid: RecordingSid,
      recordingUrl: RecordingUrl,
      recordingDuration: parseInt(RecordingDuration) || 0
    }).then(() => {
      console.log('[Voice] Recording saved successfully for CallSid:', CallSid);
    }).catch(err => {
      console.error('[Voice] Error updating call with recording:', err);
    });
  } else {
    console.log('[Voice] Recording not completed yet, status:', RecordingStatus);
  }

  res.sendStatus(200);
});

app.get('/api/voice/calls', (req, res) => {
  try {
    const calls = twilioHandler.getActiveCalls();
    res.json({ success: true, calls });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/voice/calls/recent', async (req, res) => {
  try {
    const { limit } = req.query;
    const calls = await callStorage.getRecentCalls(parseInt(limit) || 100);
    res.json({ success: true, calls });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/voice/calls/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    const stats = await callStorage.getCallStats(start, end);
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/voice/calls/:callId/recording', async (req, res) => {
  try {
    const { callId } = req.params;
    console.log('[Recording] Fetching recording for CallSid:', callId);
    
    const call = await callStorage.getCall(callId);
    console.log('[Recording] Call found:', call ? 'yes' : 'no');
    
    if (!call) {
      console.log('[Recording] Call not found in database');
      return res.status(404).json({ success: false, error: 'Call not found' });
    }
    
    if (!call.recordingUrl) {
      console.log('[Recording] Recording URL not available yet');
      return res.status(404).json({ success: false, error: 'Recording not available yet' });
    }
    
    console.log('[Recording] Recording URL:', call.recordingUrl);

    // Return authenticated recording URL
    // Twilio recording URLs require Basic Auth with Account SID and Auth Token
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const recordingUrl = call.recordingUrl;
    
    // Add .mp3 extension for audio format
    const audioUrl = recordingUrl + '.mp3';
    
    res.json({ 
      success: true, 
      recordingUrl: audioUrl,
      recordingSid: call.recordingSid,
      duration: call.recordingDuration,
      // Provide auth for client to use
      auth: {
        username: accountSid,
        password: authToken
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/voice/calls/:callId/answer', (req, res) => {
  try {
    const { callId } = req.params;
    const { operatorId } = req.body;
    const call = twilioHandler.answerCall(callId, operatorId);
    res.json({ success: true, call });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/voice/calls/:callId/reject', (req, res) => {
  try {
    const { callId } = req.params;
    const { reason } = req.body;
    const call = twilioHandler.rejectCall(callId, reason);
    res.json({ success: true, call });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reservation API Routes

// Get recent reservations
app.get('/api/reservations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const reservations = await reservationStorage.getRecentReservations(limit);
    res.json({ success: true, reservations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get reservation by ID
app.get('/api/reservations/:reservationId', async (req, res) => {
  try {
    const { reservationId } = req.params;
    const reservation = await reservationStorage.getReservation(reservationId);
    
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }
    
    res.json({ success: true, reservation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update reservation status
app.patch('/api/reservations/:reservationId/status', async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { status, notes } = req.body;
    
    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    
    const success = await reservationStorage.updateReservationStatus(reservationId, status, notes);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get reservation statistics
app.get('/api/reservations/stats/summary', async (req, res) => {
  try {
    const stats = await reservationStorage.getReservationStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// WhatsApp Notification Routes

// Send test WhatsApp message
app.post('/api/whatsapp/test', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Phone number required' });
    }
    
    const result = await whatsappNotifier.sendTestMessage(phoneNumber);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resend reservation confirmation
app.post('/api/reservations/:reservationId/resend-whatsapp', async (req, res) => {
  try {
    const { reservationId } = req.params;
    
    const reservation = await reservationStorage.getReservation(reservationId);
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }
    
    const result = await whatsappNotifier.sendReservationConfirmation(
      reservation.phoneNumber,
      reservation
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Handle call answer from client
  socket.on('call:answer', ({ callId, operatorId }) => {
    try {
      twilioHandler.answerCall(callId, operatorId);
    } catch (error) {
      socket.emit('call:error', { error: error.message });
    }
  });

  // Handle call reject from client
  socket.on('call:reject', ({ callId, reason }) => {
    try {
      twilioHandler.rejectCall(callId, reason);
    } catch (error) {
      socket.emit('call:error', { error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  await whatsappManager.destroy();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  await whatsappManager.destroy();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║  🚀 SuperParty Backend - WhatsApp + Voice             ║
║  📡 Server running on port ${PORT}                       ║
║  📱 Max WhatsApp accounts: 20                         ║
║  📞 Voice calls: Enabled                              ║
║  ✅ Ready to accept connections                       ║
╚═══════════════════════════════════════════════════════╝
  `);
});
