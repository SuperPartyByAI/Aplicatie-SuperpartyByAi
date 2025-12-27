require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const WhatsAppManager = require('./whatsapp/manager');
const TwilioHandler = require('./voice/twilio-handler');
const CallStorage = require('./voice/call-storage');

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

// Initialize managers
const whatsappManager = new WhatsAppManager(io);
const callStorage = new CallStorage();
const twilioHandler = new TwilioHandler(io, callStorage);

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'SuperParty WhatsApp Backend + Voice',
    accounts: whatsappManager.getAccounts().length,
    maxAccounts: 20,
    activeCalls: twilioHandler.getActiveCalls().length
  });
});

// API Routes
app.get('/api/accounts', (req, res) => {
  try {
    const accounts = whatsappManager.getAccounts();
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/accounts/add', async (req, res) => {
  try {
    const { name } = req.body;
    const account = await whatsappManager.addAccount(name);
    res.json({ success: true, account });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/accounts/:accountId', async (req, res) => {
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
app.post('/api/voice/incoming', (req, res) => {
  twilioHandler.handleIncomingCall(req, res);
});

app.post('/api/voice/status', (req, res) => {
  twilioHandler.handleCallStatus(req, res);
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
