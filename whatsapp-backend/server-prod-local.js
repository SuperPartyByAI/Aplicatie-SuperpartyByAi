// Production-ready server for local testing (simulates Railway deployment)
const express = require('express');
const cors = require('cors');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 8080;
const MAX_ACCOUNTS = 18;

// Initialize Firebase Admin with service account
const serviceAccount = require('../.github/secrets-backup/firebase-service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const VERSION = '2.0.0-prod-local';
const COMMIT_HASH = '60f37638';
const START_TIME = Date.now();

console.log(`🚀 SuperParty WhatsApp Backend v${VERSION} (${COMMIT_HASH})`);
console.log(`🔥 Firestore: Connected to ${serviceAccount.project_id}`);
console.log(`📊 Max accounts: ${MAX_ACCOUNTS}`);
console.log(`⏰ Started at: ${new Date(START_TIME).toISOString()}`);

// CORS configuration
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// In-memory store for active connections
const connections = new Map();
const reconnectAttempts = new Map();
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_TIMEOUT_MS = 60000;
const CONNECTION_TIMEOUT_MS = 30000;

// Ensure auth directory exists
const authDir = path.join(__dirname, '.baileys_auth');
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

// Health endpoint
app.get('/health', (req, res) => {
  const uptime = (Date.now() - START_TIME) / 1000;
  const connectedCount = Array.from(connections.values()).filter(c => c.status === 'connected').length;
  
  res.json({
    status: 'healthy',
    version: VERSION,
    commit: COMMIT_HASH,
    uptime: Math.floor(uptime),
    timestamp: new Date().toISOString(),
    accounts: {
      total: connections.size,
      connected: connectedCount
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'SuperParty WhatsApp Backend',
    version: VERSION,
    commit: COMMIT_HASH,
    endpoints: [
      'GET /health',
      'GET /api/whatsapp/accounts',
      'POST /api/whatsapp/add-account',
      'POST /api/whatsapp/send-message',
      'DELETE /api/whatsapp/account/:accountId'
    ]
  });
});

// Get all accounts
app.get('/api/whatsapp/accounts', async (req, res) => {
  try {
    const accounts = Array.from(connections.values()).map(conn => ({
      id: conn.id,
      phoneNumber: conn.phoneNumber,
      status: conn.status,
      qrCode: conn.qrCode || null,
      pairingCode: conn.pairingCode || null,
      createdAt: conn.createdAt,
      connectedAt: conn.connectedAt || null,
      lastSeen: conn.lastSeen || null
    }));
    
    res.json({ accounts });
  } catch (error) {
    console.error('❌ Error fetching accounts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add account
app.post('/api/whatsapp/add-account', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber required' });
    }
    
    if (connections.size >= MAX_ACCOUNTS) {
      return res.status(400).json({ error: `Max ${MAX_ACCOUNTS} accounts` });
    }
    
    const accountId = `account_${Date.now()}`;
    const sessionPath = path.join(authDir, accountId);
    
    console.log(`📱 [${accountId}] Creating account for ${phoneNumber}`);
    
    // Create session directory
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }
    
    // Initialize WhatsApp socket
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(`✅ [${accountId}] Baileys version: ${version.join('.')}, isLatest: ${isLatest}`);
    
    const sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      browser: ['SuperParty', 'Chrome', '1.0.0'],
      logger: pino({ level: 'silent' })
    });
    
    const connection = {
      id: accountId,
      phoneNumber,
      sock,
      status: 'connecting',
      qrCode: null,
      pairingCode: null,
      createdAt: new Date().toISOString(),
      connectedAt: null,
      lastSeen: null,
      connectStartTime: Date.now()
    };
    
    // Connection timeout
    const timeoutId = setTimeout(() => {
      if (connection.status === 'connecting') {
        console.log(`⚠️ [${accountId}] Connection timeout after ${CONNECTION_TIMEOUT_MS}ms`);
        connection.status = 'needs_qr';
        
        // Log incident to Firestore
        db.collection('whatsapp_incidents').add({
          accountId,
          type: 'connection_timeout',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          details: { timeout_ms: CONNECTION_TIMEOUT_MS }
        });
      }
    }, CONNECTION_TIMEOUT_MS);
    
    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection: connStatus, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log(`📱 [${accountId}] QR Code generated`);
        const qrDataURL = await QRCode.toDataURL(qr);
        connection.qrCode = qrDataURL;
        connection.status = 'qr_ready';
        
        clearTimeout(timeoutId);
        
        // Save to Firestore
        await db.collection('whatsapp_accounts').doc(accountId).set({
          phoneNumber,
          qrCode: qrDataURL,
          status: 'qr_ready',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      if (connStatus === 'open') {
        const mttr = Date.now() - connection.connectStartTime;
        console.log(`✅ [${accountId}] Connected in ${mttr}ms`);
        
        connection.status = 'connected';
        connection.qrCode = null;
        connection.connectedAt = new Date().toISOString();
        connection.lastSeen = new Date().toISOString();
        
        clearTimeout(timeoutId);
        
        // Save to Firestore
        await db.collection('whatsapp_accounts').doc(accountId).update({
          status: 'connected',
          connectedAt: admin.firestore.FieldValue.serverTimestamp(),
          mttr_ms: mttr
        });
        
        // Log MTTR metric
        await db.collection('whatsapp_metrics').add({
          accountId,
          type: 'mttr',
          value_ms: mttr,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      if (connStatus === 'close') {
        console.log(`❌ [${accountId}] Disconnected`);
        connection.status = 'disconnected';
        
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          console.log(`🔄 [${accountId}] Will reconnect...`);
          connection.status = 'reconnecting';
        } else {
          console.log(`🚪 [${accountId}] Logged out - needs new QR`);
          connection.status = 'needs_qr';
          connection.qrCode = null;
          
          // Log incident
          await db.collection('whatsapp_incidents').add({
            accountId,
            type: 'logged_out',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    });
    
    // Handle credentials update
    sock.ev.on('creds.update', saveCreds);
    
    // Handle messages (for inbound test)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const msg of messages) {
        if (type === 'notify' && !msg.key.fromMe) {
          console.log(`📨 [${accountId}] Inbound message: ${msg.key.id}`);
          
          // Save to Firestore with dedupe
          const messageRef = db.collection('whatsapp_messages').doc(msg.key.id);
          const existing = await messageRef.get();
          
          if (!existing.exists) {
            await messageRef.set({
              accountId,
              waMessageId: msg.key.id,
              from: msg.key.remoteJid,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              type: 'inbound',
              body: msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
            });
            console.log(`✅ [${accountId}] Message saved (dedupe OK)`);
          } else {
            console.log(`⏭️ [${accountId}] Message already exists (dedupe skip)`);
          }
        }
      }
    });
    
    connections.set(accountId, connection);
    
    res.json({
      success: true,
      account: {
        id: accountId,
        phoneNumber,
        status: connection.status,
        createdAt: connection.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error adding account:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send message
app.post('/api/whatsapp/send-message', async (req, res) => {
  try {
    const { accountId, to, message } = req.body;
    
    if (!accountId || !to || !message) {
      return res.status(400).json({ error: 'accountId, to, message required' });
    }
    
    const connection = connections.get(accountId);
    if (!connection) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    const messageId = `msg_${Date.now()}`;
    
    if (connection.status !== 'connected') {
      // Queue message
      console.log(`📤 [${accountId}] Queuing message (status: ${connection.status})`);
      
      await db.collection('whatsapp_messages').doc(messageId).set({
        accountId,
        to,
        body: message,
        status: 'queued',
        type: 'outbound',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return res.json({
        success: true,
        messageId,
        status: 'queued',
        note: 'Message queued, will send on reconnect'
      });
    }
    
    // Send immediately
    console.log(`📤 [${accountId}] Sending message to ${to}`);
    
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    await connection.sock.sendMessage(jid, { text: message });
    
    await db.collection('whatsapp_messages').doc(messageId).set({
      accountId,
      to,
      body: message,
      status: 'sent',
      type: 'outbound',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ [${accountId}] Message sent`);
    
    res.json({
      success: true,
      messageId,
      status: 'sent'
    });
    
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete account
app.delete('/api/whatsapp/account/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    const connection = connections.get(accountId);
    if (!connection) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Close socket
    if (connection.sock) {
      await connection.sock.logout();
    }
    
    connections.delete(accountId);
    
    // Delete from Firestore
    await db.collection('whatsapp_accounts').doc(accountId).delete();
    
    console.log(`🗑️ [${accountId}] Account deleted`);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Error deleting account:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log(`📍 Accounts: http://localhost:${PORT}/api/whatsapp/accounts`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, closing connections...');
  for (const [accountId, connection] of connections) {
    if (connection.sock) {
      await connection.sock.logout();
    }
  }
  process.exit(0);
});
