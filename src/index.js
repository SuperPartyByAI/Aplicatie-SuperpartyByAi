require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const WhatsAppManager = require('./whatsapp/manager');

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

// Initialize WhatsApp Manager
const whatsappManager = new WhatsAppManager(io);

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'SuperParty WhatsApp Backend',
    accounts: whatsappManager.getAccounts().length,
    maxAccounts: 20
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

// Socket.IO
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

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
║  🚀 SuperParty WhatsApp Backend                       ║
║  📡 Server running on port ${PORT}                       ║
║  📱 Max accounts: 20                                  ║
║  ✅ Ready to accept connections                       ║
╚═══════════════════════════════════════════════════════╝
  `);
});
