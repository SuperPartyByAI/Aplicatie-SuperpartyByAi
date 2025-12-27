const { onRequest } = require('firebase-functions/v2/https');
const express = require('express');
const cors = require('cors');
const socketIO = require('socket.io');

const TwilioHandler = require('./voice/twilio-handler');
const CallStorage = require('./voice/call-storage');
const TokenGenerator = require('./voice/token-generator');
const VoiceAIHandler = require('./voice/voice-ai-handler');
const ReservationStorage = require('./voice/reservation-storage');
const WhatsAppNotifier = require('./voice/whatsapp-notifier');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize WhatsApp Manager (optional)
let whatsappManager = null;
try {
  const WhatsAppManager = require('./whatsapp/manager');
  // Socket.io will be initialized by Firebase Functions
  whatsappManager = new WhatsAppManager(null); // Pass null for now
  console.log('✅ WhatsApp Manager initialized');
} catch (error) {
  console.log('⚠️  WhatsApp Manager disabled:', error.message);
}

// Initialize Voice managers
const callStorage = new CallStorage();
const reservationStorage = new ReservationStorage();
const whatsappNotifier = new WhatsAppNotifier();
const voiceAI = new VoiceAIHandler();
const twilioHandler = new TwilioHandler(null, callStorage, voiceAI); // Socket.io later
const tokenGenerator = new TokenGenerator();

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'SuperParty Backend - WhatsApp + Voice (Firebase Functions)',
    accounts: whatsappManager ? whatsappManager.getAccounts().length : 0,
    maxAccounts: 20,
    activeCalls: twilioHandler.getActiveCalls().length,
    whatsappEnabled: whatsappManager !== null
  });
});

// WhatsApp API Routes (if available)
if (whatsappManager) {
  app.post('/api/accounts/add', async (req, res) => {
    try {
      const { accountId } = req.body;
      const qr = await whatsappManager.addAccount(accountId);
      res.json({ success: true, qr });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/accounts', (req, res) => {
    try {
      const accounts = whatsappManager.getAccounts();
      res.json({ success: true, accounts });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/accounts/:accountId', async (req, res) => {
    try {
      const { accountId } = req.params;
      await whatsappManager.removeAccount(accountId);
      res.json({ success: true });
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
} else {
  app.all('/api/accounts*', (req, res) => {
    res.status(503).json({ success: false, error: 'WhatsApp not available' });
  });
}

// Voice API Routes
app.post('/api/voice/ivr-response', (req, res) => {
  twilioHandler.handleIVRResponse(req, res);
});

app.post('/api/voice/ai-conversation', async (req, res) => {
  try {
    const { CallSid, From, SpeechResult, Digits } = req.body;
    
    const twiml = new VoiceResponse();
    const userInput = SpeechResult || Digits || '';
    
    if (!userInput) {
      const gather = twiml.gather({
        input: 'speech',
        language: 'ro-RO',
        speechTimeout: 'auto',
        action: `${process.env.BACKEND_URL}/api/voice/ai-conversation`,
        method: 'POST'
      });
      
      gather.say({
        voice: 'Polly.Carmen',
        language: 'ro-RO'
      }, 'Buna ziua! Sunt asistentul virtual SuperParty. Va ajut sa faceti o rezervare. Pentru ce data doriti sa rezervati?');
      
    } else {
      const result = await voiceAI.processConversation(CallSid, userInput);
      
      if (result.completed) {
        try {
          const reservation = await reservationStorage.saveReservation(CallSid, result.data, From);
          
          if (whatsappNotifier.isConfigured()) {
            await whatsappNotifier.sendReservationConfirmation(From, reservation);
          }
        } catch (error) {
          console.error('[Voice AI] Error:', error);
        }
        
        twiml.say({
          voice: 'Polly.Carmen',
          language: 'ro-RO'
        }, 'Multumesc! Rezervarea dumneavoastra a fost inregistrata. Veti primi o confirmare pe WhatsApp. O zi buna!');
        
        twiml.hangup();
      } else {
        const gather = twiml.gather({
          input: 'speech',
          language: 'ro-RO',
          speechTimeout: 'auto',
          action: `${process.env.BACKEND_URL}/api/voice/ai-conversation`,
          method: 'POST'
        });
        
        gather.say({
          voice: 'Polly.Carmen',
          language: 'ro-RO'
        }, result.response);
      }
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('[Voice AI] Error:', error);
    const twiml = new VoiceResponse();
    twiml.say({
      voice: 'Polly.Carmen',
      language: 'ro-RO'
    }, 'Ne pare rau, a aparut o eroare. Va rugam sa sunati din nou.');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

app.post('/api/voice/token', (req, res) => {
  try {
    const { identity } = req.body;
    if (!identity) {
      return res.status(400).json({ success: false, error: 'Identity required' });
    }
    if (!tokenGenerator.isConfigured()) {
      return res.status(503).json({ success: false, error: 'Twilio Voice not configured' });
    }
    const token = tokenGenerator.generateToken(identity);
    res.json({ success: true, token });
  } catch (error) {
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
  twilioHandler.handleRecordingStatus(req, res);
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
    const limit = parseInt(req.query.limit) || 50;
    const calls = await callStorage.getRecentCalls(limit);
    res.json({ success: true, calls });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/voice/calls/stats', async (req, res) => {
  try {
    const stats = await callStorage.getCallStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/voice/calls/:callId/recording', async (req, res) => {
  try {
    const { callId } = req.params;
    const call = await callStorage.getCall(callId);
    
    if (!call || !call.recordingUrl) {
      return res.status(404).json({ success: false, error: 'Recording not found' });
    }
    
    res.json({ success: true, recordingUrl: call.recordingUrl });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reservation API Routes
app.get('/api/reservations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const reservations = await reservationStorage.getRecentReservations(limit);
    res.json({ success: true, reservations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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

app.get('/api/reservations/stats/summary', async (req, res) => {
  try {
    const stats = await reservationStorage.getReservationStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// WhatsApp Notification Routes
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

app.post('/api/reservations/:reservationId/resend-whatsapp', async (req, res) => {
  try {
    const { reservationId } = req.params;
    const reservation = await reservationStorage.getReservation(reservationId);
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }
    const result = await whatsappNotifier.sendReservationConfirmation(reservation.phoneNumber, reservation);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = app;
