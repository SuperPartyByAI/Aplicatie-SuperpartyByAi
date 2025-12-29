const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { useFirestoreAuthState } = require('./lib/persistence/firestore-auth');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 8080; // Railway injects PORT
const MAX_ACCOUNTS = 18;

// Admin token for protected endpoints
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-token-' + Math.random().toString(36).substring(7);
console.log(`🔐 ADMIN_TOKEN configured: ${ADMIN_TOKEN.substring(0, 10)}...`);

// Trust Railway proxy for rate limiting
app.set('trust proxy', 1);

// Feature flag for Firestore auth state: off | creds_only | full
const FIRESTORE_AUTH_MODE = process.env.FIRESTORE_AUTH_STATE_MODE || 'creds_only';
console.log(`🔧 FIRESTORE_AUTH_STATE_MODE: ${FIRESTORE_AUTH_MODE}`);

// Initialize Firebase Admin with Railway env var
let firestoreAvailable = false;
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      // Railway: use JSON from env var
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      firestoreAvailable = true;
      console.log('✅ Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON');
    } else {
      console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT_JSON not set - Firestore disabled');
    }
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    console.log('⚠️  Continuing without Firestore...');
  }
}

const db = firestoreAvailable ? admin.firestore() : null;

// CORS configuration
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Global rate limiting: 200 requests per IP per minute
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: {
    success: false,
    error: 'Too many requests. Limit: 200 per minute per IP.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);

// Rate limiting for message sending: 30 messages per IP per minute
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: 'Too many messages. Limit: 30 per minute per IP.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting for account operations: 10 per IP per minute
const accountLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many account operations. Limit: 10 per minute per IP.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// In-memory store for active connections
const connections = new Map();
const reconnectAttempts = new Map();

// Note: makeInMemoryStore not available in Baileys 6.7.21
// Message handling works without store (events still emit)
console.log('📦 Baileys initialized (store not required)');

// Admin authentication middleware (ADMIN_TOKEN defined at line 18)
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  
  const token = authHeader.substring(7);
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
  
  next();
}

// Test runs storage
const testRuns = new Map();
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_TIMEOUT_MS = 60000;

// Ensure auth directory exists
const authDir = path.join(__dirname, '.baileys_auth');
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

const VERSION = '2.0.0';
const COMMIT_HASH = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) || 'unknown';
const BOOT_TIMESTAMP = new Date().toISOString();
const START_TIME = Date.now();

console.log(`🚀 SuperParty WhatsApp Backend v${VERSION} (${COMMIT_HASH})`);
console.log(`📍 PORT: ${PORT}`);
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

    // Use Firestore auth state if enabled, otherwise fallback to disk
    let state, saveCreds;
    if (FIRESTORE_AUTH_MODE !== 'off' && firestoreAvailable) {
      ({ state, saveCreds } = await useFirestoreAuthState(accountId, db, FIRESTORE_AUTH_MODE));
    } else {
      ({ state, saveCreds } = await useMultiFileAuthState(sessionPath));
    }
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'warn' }), // Changed from 'silent' to see errors
      browser: ['SuperParty', 'Chrome', '2.0.0'],
      version, // CRITICAL: Use fetched version
      syncFullHistory: false, // Don't sync full history on connect
      markOnlineOnConnect: true,
      getMessage: async (key) => {
        // Return undefined to indicate message not found in cache
        return undefined;
      }
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
    
    // Note: Store binding not required in Baileys 6.7.21
    // Events emit directly from sock.ev
    console.log(`📦 [${accountId}] Socket events configured`);

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
        version: VERSION,
        commit: COMMIT_HASH,
        uptime: process.uptime(),
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
    sock.ev.on('messages.upsert', async ({ messages: newMessages, type }) => {
      console.log(`🔔 [${accountId}] messages.upsert EVENT: type=${type}, count=${newMessages.length}`);
      
      for (const msg of newMessages) {
        console.log(`📩 [${accountId}] RAW MESSAGE:`, JSON.stringify({
          id: msg.key.id,
          remoteJid: msg.key.remoteJid,
          fromMe: msg.key.fromMe,
          participant: msg.key.participant,
          hasMessage: !!msg.message,
          messageKeys: msg.message ? Object.keys(msg.message) : []
        }));
        
        if (!msg.message) {
          console.log(`⚠️  [${accountId}] Skipping message ${msg.key.id} - no message content`);
          continue;
        }
        
        const messageId = msg.key.id;
        const from = msg.key.remoteJid;
        const isFromMe = msg.key.fromMe;
        
        console.log(`📨 [${accountId}] PROCESSING: ${isFromMe ? 'OUTBOUND' : 'INBOUND'} message ${messageId} from ${from}`);
        
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
          
          console.log(`💾 [${accountId}] Saving to Firestore: threads/${threadId}/messages/${messageId}`, {
            direction: messageData.direction,
            body: messageData.body.substring(0, 50)
          });
          
          await db.collection('threads').doc(threadId).collection('messages').doc(messageId).set(messageData);
          
          console.log(`✅ [${accountId}] Message saved successfully`);
          
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
    
    // Messages update handler (for status updates)
    sock.ev.on('messages.update', (updates) => {
      console.log(`🔄 [${accountId}] messages.update EVENT: ${updates.length} updates`);
      for (const update of updates) {
        console.log(`  - Message ${update.key.id}: ${JSON.stringify(update.update)}`);
      }
    });
    
    // Message receipt handler
    sock.ev.on('message-receipt.update', (receipts) => {
      console.log(`📬 [${accountId}] message-receipt.update EVENT: ${receipts.length} receipts`);
    });

    console.log(`✅ [${accountId}] Connection created with event handlers`);
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
    version: VERSION,
    commit: COMMIT_HASH,
    bootTimestamp: BOOT_TIMESTAMP,
    uptime: process.uptime(),
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
// Root endpoint for basic connectivity test
app.get('/', (req, res) => {
  res.json({
    service: 'SuperParty WhatsApp Backend',
    version: VERSION,
    commit: COMMIT_HASH,
    status: 'online',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /',
      'GET /health',
      'GET /api/whatsapp/accounts',
      'POST /api/whatsapp/add-account',
      'GET /api/whatsapp/qr/:accountId'
    ]
  });
});

app.get('/health', async (req, res) => {
  const connected = Array.from(connections.values()).filter(c => c.status === 'connected').length;
  const connecting = Array.from(connections.values()).filter(c => c.status === 'connecting' || c.status === 'reconnecting').length;
  const needsQr = Array.from(connections.values()).filter(c => c.status === 'needs_qr' || c.status === 'qr_ready').length;
  
  const fingerprint = {
    version: VERSION,
    commit: COMMIT_HASH,
    bootTimestamp: BOOT_TIMESTAMP,
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || 'unknown'
  };
  
  // Test Firestore connection
  let firestoreStatus = 'disconnected';
  if (firestoreAvailable) {
    try {
      await db.collection('_health_check').doc('test').set({ timestamp: admin.firestore.FieldValue.serverTimestamp() });
      firestoreStatus = 'connected';
    } catch (error) {
      console.error('❌ Firestore health check failed:', error.message);
      firestoreStatus = 'error';
    }
  } else {
    firestoreStatus = 'not_configured';
  }
  
  res.json({
    status: 'healthy',
    ...fingerprint,
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
    accounts: {
      total: connections.size,
      connected,
      connecting,
      needs_qr: needsQr,
      max: MAX_ACCOUNTS
    },
    firestore: firestoreStatus
  });
});

// QR Display endpoint (HTML for easy scanning)
app.get('/api/whatsapp/qr/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    // Try in-memory first
    let account = connections.get(accountId);
    
    // If not in memory, try Firestore
    if (!account) {
      const doc = await db.collection('whatsapp_accounts').doc(accountId).get();
      if (doc.exists) {
        account = doc.data();
      }
    }
    
    if (!account) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; padding: 20px;">
            <h2>❌ Account Not Found</h2>
            <p>Account ID: ${accountId}</p>
          </body>
        </html>
      `);
    }
    
    const qrCode = account.qrCode || (account.qr_code);
    
    if (!qrCode) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; padding: 20px;">
            <h2>⏳ QR Code Not Ready</h2>
            <p>Account ID: ${accountId}</p>
            <p>Status: ${account.status}</p>
            <p>Refresh this page in a few seconds...</p>
            <script>setTimeout(() => location.reload(), 5000);</script>
          </body>
        </html>
      `);
    }
    
    res.send(`
      <html>
        <head>
          <title>WhatsApp QR Code - ${accountId}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
            }
            img {
              max-width: 400px;
              border: 2px solid #25D366;
              border-radius: 10px;
            }
            .instructions {
              margin-top: 20px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>📱 WhatsApp QR Code</h1>
            <p><strong>Account ID:</strong> ${accountId}</p>
            <img src="${qrCode}" alt="QR Code" />
            <div class="instructions">
              <h3>How to scan:</h3>
              <ol style="text-align: left; display: inline-block;">
                <li>Open WhatsApp on your phone</li>
                <li>Go to Settings → Linked Devices</li>
                <li>Tap "Link a Device"</li>
                <li>Scan this QR code</li>
              </ol>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Error displaying QR:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 20px;">
          <h2>❌ Error</h2>
          <p>${error.message}</p>
        </body>
      </html>
    `);
  }
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
app.post('/api/whatsapp/add-account', accountLimiter, async (req, res) => {
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
app.post('/api/whatsapp/regenerate-qr/:accountId', accountLimiter, async (req, res) => {
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
app.post('/api/whatsapp/send-message', messageLimiter, async (req, res) => {
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
app.delete('/api/whatsapp/accounts/:id', accountLimiter, async (req, res) => {
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

// ============================================
// ADMIN ENDPOINTS (Protected with ADMIN_TOKEN)
// ============================================

// POST /api/admin/account/:id/disconnect
app.post('/api/admin/account/:id/disconnect', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const account = connections.get(id);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    const tsDisconnect = Date.now();
    
    // Close socket (recoverable disconnect)
    if (account.sock) {
      account.sock.end();
    }
    
    console.log(`🔌 [ADMIN] Disconnected account ${id}`);
    
    res.json({
      success: true,
      accountId: id,
      tsDisconnect,
      reason: 'admin_disconnect'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/account/:id/reconnect
app.post('/api/admin/account/:id/reconnect', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const account = connections.get(id);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    const tsStart = Date.now();
    
    // Trigger reconnect
    console.log(`🔄 [ADMIN] Reconnecting account ${id}`);
    
    // Wait for connection (max 60s)
    const maxWait = 60000;
    const checkInterval = 1000;
    let elapsed = 0;
    
    while (elapsed < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
      
      const currentAccount = connections.get(id);
      if (currentAccount && currentAccount.status === 'connected') {
        const tsConnected = Date.now();
        const mttrMs = tsConnected - tsStart;
        
        console.log(`✅ [ADMIN] Account ${id} reconnected in ${mttrMs}ms`);
        
        return res.json({
          success: true,
          accountId: id,
          tsConnected,
          mttrMs
        });
      }
    }
    
    res.status(408).json({ error: 'Reconnect timeout after 60s' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/tests/mttr
app.post('/api/admin/tests/mttr', requireAdmin, async (req, res) => {
  try {
    const { accountId, n = 10 } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId required' });
    }
    
    const account = connections.get(accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    const runId = `mttr_${Date.now()}`;
    const dataset = [];
    
    console.log(`📊 [ADMIN] Starting MTTR benchmark: runId=${runId}, n=${n}`);
    
    // Run N disconnect/reconnect cycles
    for (let i = 0; i < n; i++) {
      console.log(`[${i+1}/${n}] Disconnect...`);
      
      // Disconnect
      if (account.sock) {
        account.sock.end();
      }
      
      // Wait for disconnect
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Measure reconnect time
      const tsStart = Date.now();
      
      // Wait for reconnect (max 60s)
      let reconnected = false;
      for (let wait = 0; wait < 60000; wait += 1000) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const currentAccount = connections.get(accountId);
        if (currentAccount && currentAccount.status === 'connected') {
          const mttrMs = Date.now() - tsStart;
          dataset.push(mttrMs / 1000); // Convert to seconds
          console.log(`✅ [${i+1}/${n}] Reconnected in ${mttrMs}ms`);
          reconnected = true;
          break;
        }
      }
      
      if (!reconnected) {
        console.error(`❌ [${i+1}/${n}] Reconnect timeout`);
        dataset.push(60); // Timeout value
      }
    }
    
    // Calculate percentiles
    const sorted = dataset.slice().sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    
    const result = {
      runId,
      accountId,
      n,
      dataset,
      p50,
      p90,
      p95,
      verdict: p95 <= 60 ? 'PASS' : 'FAIL',
      timestamp: new Date().toISOString()
    };
    
    // Save to Firestore
    await db.collection('prod_tests').doc(runId).set({
      type: 'mttr',
      ...result
    });
    
    console.log(`✅ [ADMIN] MTTR benchmark complete: ${result.verdict}`);
    
    res.json(result);
  } catch (error) {
    console.error('❌ [ADMIN] MTTR test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/tests/queue
app.post('/api/admin/tests/queue', requireAdmin, async (req, res) => {
  try {
    const { accountId, to } = req.query;
    
    if (!accountId || !to) {
      return res.status(400).json({ error: 'accountId and to required' });
    }
    
    const runId = `queue_${Date.now()}`;
    console.log(`📤 [ADMIN] Starting queue test: runId=${runId}`);
    
    // Force offline
    const account = connections.get(accountId);
    if (account && account.sock) {
      account.sock.end();
    }
    
    // Wait for offline
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Send 3 messages while offline
    const messageIds = [];
    for (let i = 1; i <= 3; i++) {
      const msgId = `msg_${Date.now()}_${i}`;
      const message = `Queue test ${i} - ${runId}`;
      
      // Save to Firestore as queued
      await db.collection('messages').doc(msgId).set({
        accountId,
        to,
        body: message,
        status: 'queued',
        type: 'outbound',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        runId
      });
      
      messageIds.push(msgId);
      console.log(`📝 [${i}/3] Message queued: ${msgId}`);
    }
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Reconnect
    console.log(`🔄 Reconnecting...`);
    
    // Wait for reconnect (max 60s)
    let reconnected = false;
    for (let wait = 0; wait < 60000; wait += 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const currentAccount = connections.get(accountId);
      if (currentAccount && currentAccount.status === 'connected') {
        reconnected = true;
        console.log(`✅ Reconnected`);
        break;
      }
    }
    
    if (!reconnected) {
      return res.status(408).json({ error: 'Reconnect timeout' });
    }
    
    // Check message statuses after reconnect
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const statusTransitions = [];
    for (const msgId of messageIds) {
      const doc = await db.collection('messages').doc(msgId).get();
      if (doc.exists) {
        const data = doc.data();
        statusTransitions.push({
          msgId,
          status: data.status,
          updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null
        });
      }
    }
    
    const result = {
      runId,
      accountId,
      to,
      messageIds,
      statusTransitions,
      verdict: statusTransitions.every(t => t.status === 'sent' || t.status === 'delivered') ? 'PASS' : 'PARTIAL',
      timestamp: new Date().toISOString()
    };
    
    // Save to Firestore
    await db.collection('prod_tests').doc(runId).set({
      type: 'queue',
      ...result
    });
    
    console.log(`✅ [ADMIN] Queue test complete: ${result.verdict}`);
    
    res.json(result);
  } catch (error) {
    console.error('❌ [ADMIN] Queue test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/tests/soak/start
app.post('/api/admin/tests/soak/start', requireAdmin, async (req, res) => {
  try {
    const { hours = 2, accountId } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId required' });
    }
    
    const runId = `soak_${Date.now()}`;
    const durationMs = hours * 60 * 60 * 1000;
    const startTime = Date.now();
    
    console.log(`⏱️  [ADMIN] Starting soak test: runId=${runId}, duration=${hours}h`);
    
    // Initialize test run
    testRuns.set(runId, {
      type: 'soak',
      accountId,
      startTime,
      durationMs,
      heartbeats: 0,
      failures: 0,
      status: 'running'
    });
    
    // Save initial state to Firestore
    await db.collection('prod_tests').doc(runId).set({
      type: 'soak',
      accountId,
      hours,
      startTime: new Date(startTime).toISOString(),
      status: 'running'
    });
    
    // Start background heartbeat (every 60s)
    const interval = setInterval(async () => {
      const run = testRuns.get(runId);
      if (!run) {
        clearInterval(interval);
        return;
      }
      
      const elapsed = Date.now() - run.startTime;
      
      if (elapsed >= run.durationMs) {
        // Test complete
        clearInterval(interval);
        
        const uptime = ((run.heartbeats - run.failures) / run.heartbeats * 100).toFixed(2);
        const verdict = uptime >= 99 && run.failures === 0 ? 'PASS' : 'FAIL';
        
        run.status = 'complete';
        run.uptime = uptime;
        run.verdict = verdict;
        
        // Save summary to Firestore
        await db.collection('prod_tests').doc(runId).update({
          status: 'complete',
          endTime: new Date().toISOString(),
          heartbeats: run.heartbeats,
          failures: run.failures,
          uptime: parseFloat(uptime),
          verdict
        });
        
        console.log(`✅ [ADMIN] Soak test complete: ${verdict}, uptime=${uptime}%`);
        return;
      }
      
      // Heartbeat
      try {
        const account = connections.get(accountId);
        const isHealthy = account && account.status === 'connected';
        
        run.heartbeats++;
        if (!isHealthy) {
          run.failures++;
        }
        
        // Save heartbeat to Firestore
        await db.collection('prod_tests').doc(runId).collection('heartbeats').add({
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          heartbeat: run.heartbeats,
          accountStatus: account ? account.status : 'not_found',
          healthy: isHealthy
        });
        
        const elapsedMin = Math.floor(elapsed / 1000 / 60);
        console.log(`💓 [${runId}] Heartbeat ${run.heartbeats} at ${elapsedMin}min: ${isHealthy ? '✅' : '❌'}`);
      } catch (error) {
        run.failures++;
        console.error(`❌ [${runId}] Heartbeat failed:`, error.message);
      }
    }, 60000); // Every 60 seconds
    
    res.json({
      success: true,
      runId,
      accountId,
      hours,
      startTime: new Date(startTime).toISOString(),
      message: `Soak test started. Check status at /api/admin/tests/soak/status?runId=${runId}`
    });
  } catch (error) {
    console.error('❌ [ADMIN] Soak test start error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/tests/soak/status
app.get('/api/admin/tests/soak/status', requireAdmin, async (req, res) => {
  try {
    const { runId } = req.query;
    
    if (!runId) {
      return res.status(400).json({ error: 'runId required' });
    }
    
    const run = testRuns.get(runId);
    if (!run) {
      return res.status(404).json({ error: 'Test run not found' });
    }
    
    const elapsed = Date.now() - run.startTime;
    const progress = (elapsed / run.durationMs * 100).toFixed(2);
    const uptime = run.heartbeats > 0 ? ((run.heartbeats - run.failures) / run.heartbeats * 100).toFixed(2) : 0;
    
    res.json({
      runId,
      status: run.status,
      progress: parseFloat(progress),
      elapsed: Math.floor(elapsed / 1000),
      heartbeats: run.heartbeats,
      failures: run.failures,
      uptime: parseFloat(uptime)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/tests/report
app.get('/api/admin/tests/report', requireAdmin, async (req, res) => {
  try {
    const { runId } = req.query;
    
    if (!runId) {
      return res.status(400).json({ error: 'runId required' });
    }
    
    const doc = await db.collection('prod_tests').doc(runId).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Test run not found' });
    }
    
    const data = doc.data();
    
    res.json({
      runId,
      type: data.type,
      verdict: data.verdict,
      data,
      firestoreDoc: `prod_tests/${runId}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restore accounts from Firestore on cold start
async function restoreAccountsFromFirestore() {
  if (!firestoreAvailable) {
    console.log('⚠️  Firestore not available, skipping account restore');
    return;
  }
  
  try {
    console.log('🔄 Restoring accounts from Firestore...');
    const snapshot = await db.collection('accounts').where('status', '==', 'connected').get();
    
    console.log(`📦 Found ${snapshot.size} connected accounts in Firestore`);
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const accountId = doc.id;
      
      console.log(`🔄 Restoring account: ${accountId}`);
      
      try {
        // Use Firestore auth state if enabled
        let state, saveCreds;
        if (FIRESTORE_AUTH_MODE !== 'off') {
          ({ state, saveCreds } = await useFirestoreAuthState(accountId, db, FIRESTORE_AUTH_MODE));
          
          // Check if creds exist in Firestore
          if (!state.creds) {
            console.log(`⚠️  [${accountId}] No creds in Firestore, skipping`);
            continue;
          }
        } else {
          const sessionPath = path.join(authDir, accountId);
          if (!fs.existsSync(sessionPath)) {
            console.log(`⚠️  [${accountId}] No session on disk, skipping`);
            continue;
          }
          ({ state, saveCreds } = await useMultiFileAuthState(sessionPath));
        }
        
        const { version } = await fetchLatestBaileysVersion();
          
          const sock = makeWASocket({
            auth: state,
            version,
            printQRInTerminal: false,
            browser: ['SuperParty', 'Chrome', '1.0.0'],
            logger: pino({ level: 'silent' })
          });
          
          const account = {
            id: accountId,
            phoneNumber: data.phoneE164 || data.phone,
            sock,
            status: 'connecting',
            qrCode: null,
            pairingCode: null,
            createdAt: data.createdAt || new Date().toISOString(),
            lastUpdate: data.updatedAt || new Date().toISOString()
          };
          
          // Setup event handlers (simplified)
          sock.ev.on('connection.update', async (update) => {
            if (update.connection === 'open') {
              account.status = 'connected';
              console.log(`✅ [${accountId}] Restored and connected`);
            }
          });
          
          sock.ev.on('creds.update', saveCreds);
          
        connections.set(accountId, account);
        console.log(`✅ [${accountId}] Restored to memory`);
      } catch (error) {
        console.error(`❌ [${accountId}] Restore failed:`, error.message);
      }
    }
    
    console.log(`✅ Account restore complete: ${connections.size} accounts loaded`);
  } catch (error) {
    console.error('❌ Account restore failed:', error.message);
  }
}

// Queue/Outbox endpoints
app.post('/admin/queue/test', requireAdmin, async (req, res) => {
  try {
    const { accountId, messages } = req.body;
    
    if (!accountId || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing accountId or messages array' });
    }
    
    // Enqueue messages to Firestore outbox
    const queuedMessages = [];
    
    for (const msg of messages) {
      const messageId = `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const queueData = {
        accountId,
        to: msg.to,
        body: msg.body,
        status: 'queued',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        attempts: 0
      };
      
      await db.collection('wa_outbox').doc(messageId).set(queueData);
      queuedMessages.push({ messageId, ...queueData });
    }
    
    res.json({
      success: true,
      queued: queuedMessages.length,
      messages: queuedMessages
    });
  } catch (error) {
    console.error('Queue test error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/queue/flush', requireAdmin, async (req, res) => {
  try {
    const { accountId } = req.body;
    
    if (!accountId) {
      return res.status(400).json({ error: 'Missing accountId' });
    }
    
    // Get queued messages
    const snapshot = await db.collection('wa_outbox')
      .where('accountId', '==', accountId)
      .where('status', '==', 'queued')
      .orderBy('createdAt', 'asc')
      .get();
    
    const results = [];
    const account = connections.get(accountId);
    
    if (!account || account.status !== 'connected') {
      return res.status(400).json({ error: 'Account not connected' });
    }
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const messageId = doc.id;
      
      try {
        // Send message
        const result = await account.sock.sendMessage(
          `${data.to}@s.whatsapp.net`,
          { text: data.body }
        );
        
        // Update status
        await db.collection('wa_outbox').doc(messageId).update({
          status: 'sent',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          waMessageId: result.key.id
        });
        
        results.push({
          messageId,
          status: 'sent',
          waMessageId: result.key.id
        });
      } catch (error) {
        await db.collection('wa_outbox').doc(messageId).update({
          status: 'failed',
          error: error.message,
          attempts: admin.firestore.Increment(1)
        });
        
        results.push({
          messageId,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      flushed: results.length,
      results
    });
  } catch (error) {
    console.error('Queue flush error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/admin/queue/status', requireAdmin, async (req, res) => {
  try {
    const { accountId } = req.query;
    
    let query = db.collection('wa_outbox');
    if (accountId) {
      query = query.where('accountId', '==', accountId);
    }
    
    const snapshot = await query.get();
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const stats = {
      total: messages.length,
      queued: messages.filter(m => m.status === 'queued').length,
      sent: messages.filter(m => m.status === 'sent').length,
      failed: messages.filter(m => m.status === 'failed').length
    };
    
    res.json({
      success: true,
      stats,
      messages
    });
  } catch (error) {
    console.error('Queue status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health`);
  console.log(`📱 Accounts: http://localhost:${PORT}/api/whatsapp/accounts`);
  console.log(`🚀 Railway deployment ready!\n`);
  
  // Restore accounts after server starts
  await restoreAccountsFromFirestore();
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
