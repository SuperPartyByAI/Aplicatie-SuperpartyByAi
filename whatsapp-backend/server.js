const express = require('express');
const cors = require('cors');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Store active connections
const connections = new Map();
const messages = new Map();

// Ensure auth directory exists
const authDir = path.join(__dirname, '.baileys_auth');
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'SuperParty WhatsApp Backend',
    version: '1.0.0',
    accounts: connections.size,
    endpoints: [
      'GET /',
      'GET /api/whatsapp/accounts',
      'POST /api/whatsapp/add-account',
      'POST /api/whatsapp/send',
      'GET /api/whatsapp/messages',
      'DELETE /api/whatsapp/accounts/:id'
    ]
  });
});

// Get all accounts
app.get('/api/whatsapp/accounts', (req, res) => {
  const accounts = [];
  connections.forEach((conn, id) => {
    accounts.push({
      id,
      name: conn.name,
      phone: conn.phone,
      status: conn.status,
      qrCode: conn.qrCode,
      createdAt: conn.createdAt
    });
  });
  res.json({ success: true, accounts });
});

// Add new account
app.post('/api/whatsapp/add-account', async (req, res) => {
  try {
    const { name, phone } = req.body;
    const accountId = `account_${Date.now()}`;
    
    const sessionPath = path.join(authDir, accountId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' })
    });

    const account = {
      id: accountId,
      name,
      phone,
      status: 'connecting',
      qrCode: null,
      sock,
      createdAt: new Date().toISOString()
    };

    connections.set(accountId, account);
    messages.set(accountId, []);

    // QR Code handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const qrCode = await QRCode.toDataURL(qr);
        account.qrCode = qrCode;
        account.status = 'qr_ready';
        console.log(`📱 QR Code ready for ${accountId}`);
      }

      if (connection === 'open') {
        account.status = 'connected';
        account.qrCode = null;
        console.log(`✅ ${accountId} connected`);
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          account.status = 'reconnecting';
          console.log(`🔄 ${accountId} reconnecting...`);
        } else {
          account.status = 'logged_out';
          connections.delete(accountId);
          console.log(`❌ ${accountId} logged out`);
        }
      }
    });

    // Message handler
    sock.ev.on('messages.upsert', async ({ messages: newMessages, type }) => {
      if (type !== 'notify') return;
      
      for (const msg of newMessages) {
        if (!msg.message) continue;
        
        const messageData = {
          id: msg.key.id,
          from: msg.key.remoteJid,
          fromMe: msg.key.fromMe,
          text: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
          timestamp: msg.messageTimestamp,
          createdAt: new Date().toISOString()
        };

        const accountMessages = messages.get(accountId) || [];
        accountMessages.push(messageData);
        messages.set(accountId, accountMessages);

        console.log(`💬 [${accountId}] Message received from ${messageData.from}`);
      }
    });

    // Save credentials
    sock.ev.on('creds.update', saveCreds);

    res.json({ success: true, account: { id: accountId, name, phone, status: account.status } });
  } catch (error) {
    console.error('Error adding account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send message
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { accountId, chatId, message } = req.body;
    
    const account = connections.get(accountId);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    if (account.status !== 'connected') {
      return res.status(400).json({ success: false, error: 'Account not connected' });
    }

    await account.sock.sendMessage(chatId, { text: message });
    
    console.log(`📤 [${accountId}] Message sent to ${chatId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get messages
app.get('/api/whatsapp/messages', (req, res) => {
  const { accountId } = req.query;
  const accountMessages = messages.get(accountId) || [];
  res.json({ success: true, messages: accountMessages });
});

// Delete account
app.delete('/api/whatsapp/accounts/:id', (req, res) => {
  const { id } = req.params;
  const account = connections.get(id);
  
  if (account) {
    account.sock.end();
    connections.delete(id);
    messages.delete(id);
    
    // Delete session files
    const sessionPath = path.join(authDir, id);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
    
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'Account not found' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Backend running on port ${PORT}`);
});
