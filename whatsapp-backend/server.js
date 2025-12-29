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

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const db = admin.firestore();

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

// Ensure auth directory exists
const authDir = path.join(__dirname, '.baileys_auth');
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

console.log(`🚀 SuperParty WhatsApp Backend v2.0.0`);
console.log(`📁 Auth directory: ${authDir}`);
console.log(`🔥 Firestore: ${admin.apps.length > 0 ? 'Connected' : 'Not connected'}`);
console.log(`📊 Max accounts: ${MAX_ACCOUNTS}`);

// Helper: Save account to Firestore
async function saveAccountToFirestore(accountId, data) {
  try {
    await db.collection('accounts').doc(accountId).set({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`💾 [${accountId}] Saved to Firestore`);
  } catch (error) {
    console.error(`❌ [${accountId}] Firestore save failed:`, error.message);
  }
}

// Helper: Log incident to Firestore
async function logIncident(accountId, type, details) {
  try {
    const incidentId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.collection('incidents').doc(incidentId).set({
      accountId,
      type,
      severity: type.includes('fail') || type.includes('error') ? 'high' : 'medium',
      details,
      ts: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`📝 [${accountId}] Incident logged: ${type}`);
  } catch (error) {
    console.error(`❌ [${accountId}] Incident logging failed:`, error.message);
  }
}

// Helper: Create WhatsApp connection
async function createConnection(accountId, name, phone) {
  try {
    console.log(`\n🔌 [${accountId}] Creating connection...`);
    
    const sessionPath = path.join(authDir, accountId);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    // Fetch latest Baileys version (CRITICAL FIX)
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`✅ [${accountId}] Baileys version: ${version.join('.')}, isLatest: ${isLatest}`);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['SuperParty', 'Chrome', '2.0.0'],
      version // CRITICAL: Use fetched version
    });

    const account = {
      id: accountId,
      name,
      phone,
      status: 'connecting',
      qrCode: null,
      pairingCode: null,
      sock,
      createdAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString()
    };

    connections.set(accountId, account);

    // Save to Firestore
    await saveAccountToFirestore(accountId, {
      accountId,
      name,
      phoneE164: phone,
      status: 'connecting',
      qrCode: null,
      pairingCode: null,
      createdAt: account.createdAt,
      worker: {
        service: 'railway',
        instanceId: process.env.RAILWAY_DEPLOYMENT_ID || 'local',
        version: '2.0.0',
        bootTs: new Date().toISOString()
      }
    });

    // Connection update handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      console.log(`🔔 [${accountId}] Connection update: ${connection || 'qr'}`);

      if (qr) {
        console.log(`📱 [${accountId}] QR Code generated (length: ${qr.length})`);
        
        try {
          const qrDataURL = await QRCode.toDataURL(qr);
          account.qrCode = qrDataURL;
          account.status = 'qr_ready';
          account.lastUpdate = new Date().toISOString();
          
          // Save QR to Firestore
          await saveAccountToFirestore(accountId, {
            qrCode: qrDataURL,
            qrUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'qr_ready'
          });
          
          console.log(`✅ [${accountId}] QR saved to Firestore`);
        } catch (error) {
          console.error(`❌ [${accountId}] QR generation failed:`, error.message);
          await logIncident(accountId, 'qr_generation_failed', { error: error.message });
        }
      }

      if (connection === 'open') {
        console.log(`✅ [${accountId}] Connected!`);
        account.status = 'connected';
        account.qrCode = null;
        account.phone = sock.user?.id?.split(':')[0] || phone;
        account.waJid = sock.user?.id;
        account.lastUpdate = new Date().toISOString();
        
        // Reset reconnect attempts
        reconnectAttempts.delete(accountId);
        
        // Save to Firestore
        await saveAccountToFirestore(accountId, {
          status: 'connected',
          waJid: account.waJid,
          phoneE164: account.phone,
          lastConnectedAt: admin.firestore.FieldValue.serverTimestamp(),
          qrCode: null
        });
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        const reason = lastDisconnect?.error?.output?.statusCode || 'unknown';
        
        console.log(`🔌 [${accountId}] Connection closed. Reason: ${reason}, Reconnect: ${shouldReconnect}`);
        
        account.status = shouldReconnect ? 'reconnecting' : 'logged_out';
        account.lastUpdate = new Date().toISOString();
        
        // Save to Firestore
        await saveAccountToFirestore(accountId, {
          status: account.status,
          lastDisconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastDisconnectReason: reason.toString(),
          lastDisconnectCode: reason
        });

        if (shouldReconnect) {
          const attempts = reconnectAttempts.get(accountId) || 0;
          
          if (attempts < MAX_RECONNECT_ATTEMPTS) {
            const backoff = Math.min(1000 * Math.pow(2, attempts), 30000);
            console.log(`🔄 [${accountId}] Reconnecting in ${backoff}ms (attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
            
            reconnectAttempts.set(accountId, attempts + 1);
            
            setTimeout(() => {
              if (connections.has(accountId)) {
                createConnection(accountId, account.name, account.phone);
              }
            }, backoff);
          } else {
            console.log(`❌ [${accountId}] Max reconnect attempts reached, generating new QR...`);
            account.status = 'needs_qr';
            
            await saveAccountToFirestore(accountId, {
              status: 'needs_qr'
            });
            
            await logIncident(accountId, 'max_reconnect_attempts', {
              attempts: MAX_RECONNECT_ATTEMPTS,
              lastReason: reason
            });
            
            // Clean up and regenerate
            connections.delete(accountId);
            reconnectAttempts.delete(accountId);
            
            setTimeout(() => {
              createConnection(accountId, account.name, account.phone);
            }, 5000);
          }
        } else {
          console.log(`❌ [${accountId}] Logged out, needs new QR`);
          account.status = 'needs_qr';
          
          await saveAccountToFirestore(accountId, {
            status: 'needs_qr'
          });
          
          await logIncident(accountId, 'logged_out', {
            reason: reason,
            requiresQR: true
          });
          
          // Clean up and regenerate
          connections.delete(accountId);
          
          setTimeout(() => {
            createConnection(accountId, account.name, account.phone);
          }, 5000);
        }
      }
    });

    // Creds update handler
    sock.ev.on('creds.update', saveCreds);

    // Messages handler
    sock.ev.on('messages.upsert', async ({ messages: newMessages }) => {
      for (const msg of newMessages) {
        if (!msg.message) continue;
        
        const messageId = msg.key.id;
        const from = msg.key.remoteJid;
        const isFromMe = msg.key.fromMe;
        
        console.log(`📨 [${accountId}] Message ${isFromMe ? 'sent' : 'received'}: ${messageId}`);
        
        // Save to Firestore
        try {
          const threadId = from;
          const messageData = {
            accountId,
            clientJid: from,
            direction: isFromMe ? 'outbound' : 'inbound',
            body: msg.message.conversation || msg.message.extendedTextMessage?.text || '',
            waMessageId: messageId,
            status: 'delivered',
            tsClient: new Date(msg.messageTimestamp * 1000).toISOString(),
            tsServer: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          await db.collection('threads').doc(threadId).collection('messages').doc(messageId).set(messageData);
          
          // Update thread
          await db.collection('threads').doc(threadId).set({
            accountId,
            clientJid: from,
            lastMessageAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          
          console.log(`💾 [${accountId}] Message saved to Firestore: ${messageId}`);
        } catch (error) {
          console.error(`❌ [${accountId}] Message save failed:`, error.message);
        }
      }
    });

    console.log(`✅ [${accountId}] Connection created`);
    return account;

  } catch (error) {
    console.error(`❌ [${accountId}] Connection creation failed:`, error.message);
    await logIncident(accountId, 'connection_creation_failed', { error: error.message });
    throw error;
  }
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'SuperParty WhatsApp Backend',
    version: '2.0.0',
    accounts: connections.size,
    maxAccounts: MAX_ACCOUNTS,
    firestore: admin.apps.length > 0 ? 'connected' : 'disconnected',
    endpoints: [
      'GET /',
      'GET /health',
      'GET /api/whatsapp/accounts',
      'POST /api/whatsapp/add-account',
      'POST /api/whatsapp/regenerate-qr/:accountId',
      'POST /api/whatsapp/send-message',
      'GET /api/whatsapp/messages',
      'DELETE /api/whatsapp/accounts/:id'
    ]
  });
});

// Health endpoint
app.get('/health', async (req, res) => {
  const connected = Array.from(connections.values()).filter(c => c.status === 'connected').length;
  const connecting = Array.from(connections.values()).filter(c => c.status === 'connecting' || c.status === 'reconnecting').length;
  const needsQr = Array.from(connections.values()).filter(c => c.status === 'needs_qr' || c.status === 'qr_ready').length;
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    accounts: {
      total: connections.size,
      connected,
      connecting,
      needsQr,
      max: MAX_ACCOUNTS
    },
    firestore: admin.apps.length > 0 ? 'connected' : 'disconnected'
  });
});

// Get all accounts
app.get('/api/whatsapp/accounts', async (req, res) => {
  try {
    const accounts = [];
    connections.forEach((conn, id) => {
      accounts.push({
        id,
        name: conn.name,
        phone: conn.phone,
        status: conn.status,
        qrCode: conn.qrCode,
        pairingCode: conn.pairingCode,
        createdAt: conn.createdAt,
        lastUpdate: conn.lastUpdate
      });
    });
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add new account
app.post('/api/whatsapp/add-account', async (req, res) => {
  try {
    const { name, phone } = req.body;
    
    if (connections.size >= MAX_ACCOUNTS) {
      return res.status(400).json({ 
        success: false, 
        error: `Maximum ${MAX_ACCOUNTS} accounts reached` 
      });
    }
    
    const accountId = `account_${Date.now()}`;
    
    // Create connection (async, will emit QR later)
    createConnection(accountId, name, phone).catch(err => {
      console.error(`❌ [${accountId}] Failed to create:`, err.message);
    });
    
    // Return immediately with connecting status
    res.json({ 
      success: true, 
      account: {
        id: accountId,
        name,
        phone,
        status: 'connecting',
        qrCode: null,
        pairingCode: null,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Regenerate QR
app.post('/api/whatsapp/regenerate-qr/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = connections.get(accountId);
    
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    // Clean up old connection
    if (account.sock) {
      try {
        account.sock.end();
      } catch (e) {
        // Ignore
      }
    }
    
    connections.delete(accountId);
    reconnectAttempts.delete(accountId);
    
    // Create new connection
    await createConnection(accountId, account.name, account.phone);
    
    res.json({ success: true, message: 'QR regeneration started' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send message
app.post('/api/whatsapp/send-message', async (req, res) => {
  try {
    const { accountId, to, message } = req.body;
    const account = connections.get(accountId);
    
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    if (account.status !== 'connected') {
      // Queue message in Firestore
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.collection('outbox').doc(messageId).set({
        accountId,
        toJid: to,
        payload: { message },
        status: 'queued',
        attempts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return res.json({ success: true, queued: true, messageId });
    }
    
    const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    const result = await account.sock.sendMessage(jid, { text: message });
    
    res.json({ success: true, messageId: result.key.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get messages
app.get('/api/whatsapp/messages', async (req, res) => {
  try {
    const { accountId, threadId, limit = 50 } = req.query;
    
    let query = db.collection('threads');
    
    if (accountId) {
      query = query.where('accountId', '==', accountId);
    }
    
    const threadsSnapshot = await query.limit(parseInt(limit)).get();
    const threads = [];
    
    for (const threadDoc of threadsSnapshot.docs) {
      const threadData = threadDoc.data();
      const messagesSnapshot = await threadDoc.ref.collection('messages')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      
      const messages = messagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      threads.push({
        id: threadDoc.id,
        ...threadData,
        messages
      });
    }
    
    res.json({ success: true, threads });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete account
app.delete('/api/whatsapp/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const account = connections.get(id);
    
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    // Close connection
    if (account.sock) {
      try {
        account.sock.end();
      } catch (e) {
        // Ignore
      }
    }
    
    connections.delete(id);
    reconnectAttempts.delete(id);
    
    // Update Firestore
    await saveAccountToFirestore(id, {
      status: 'deleted',
      deletedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health`);
  console.log(`📱 Accounts: http://localhost:${PORT}/api/whatsapp/accounts\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing connections...');
  connections.forEach((account, id) => {
    if (account.sock) {
      try {
        account.sock.end();
      } catch (e) {
        // Ignore
      }
    }
  });
  process.exit(0);
});
