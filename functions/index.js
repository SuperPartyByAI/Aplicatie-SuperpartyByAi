const { onRequest, onCall } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineString, defineSecret } = require('firebase-functions/params');
const functions = require('firebase-functions'); // Keep v1 for existing functions

// Initialize Sentry
const { Sentry, logger } = require('./sentry');

// Initialize Better Stack (Logtail)
const logtail = require('./logtail');

// Initialize Memory Cache
const cache = require('./cache');

// Groq (Llama)
const Groq = require('groq-sdk');

// Set global options for v2 functions
setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
});

// Deployment marker
const BUILD_SHA = process.env.BUILD_SHA || process.env.K_REVISION || 'unknown';
console.log('🚀 Firebase Functions starting - BUILD_SHA=' + BUILD_SHA);
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const admin = require('firebase-admin');

// Initialize Firebase Admin at startup
if (!admin.apps.length) {
  admin.initializeApp();
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const WhatsAppManager = require('./whatsapp/manager');
const whatsappManager = new WhatsAppManager(io);

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'SuperParty WhatsApp on Firebase',
    version: '5.2.0',
    deployed: new Date().toISOString(),
    accounts: whatsappManager.getAccounts().length,
    endpoints: [
      'GET /',
      'GET /api/whatsapp/accounts',
      'POST /api/whatsapp/add-account',
      'DELETE /api/whatsapp/accounts/:id',
      'POST /api/whatsapp/send',
      'POST /api/whatsapp/send-message',
      'GET /api/whatsapp/messages',
      'GET /api/clients',
      'GET /health',
    ],
  });
});

app.get('/api/whatsapp/accounts', (req, res) => {
  // Try cache first (30 seconds TTL)
  const cacheKey = 'whatsapp:accounts';
  const cached = cache.get(cacheKey);
  
  if (cached) {
    return res.json({ success: true, accounts: cached, cached: true });
  }
  
  const accounts = whatsappManager.getAccounts();
  // Remove non-serializable fields (timers)
  const cleanAccounts = accounts.map(acc => {
    const { qrExpiryTimer, ...rest } = acc;
    return rest;
  });
  
  // Cache for 30 seconds
  cache.set(cacheKey, cleanAccounts, 30 * 1000);
  
  res.json({ success: true, accounts: cleanAccounts, cached: false });
});

app.post('/api/whatsapp/add-account', async (req, res) => {
  try {
    const { name, phone } = req.body;
    const account = await whatsappManager.addAccount(name, phone);
    logtail.info('WhatsApp account added', { accountId: account.id, name, phone });
    res.json({ success: true, account });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { endpoint: 'add-account', function: 'whatsappV4' },
      extra: { name, phone },
    });
    logtail.error('Failed to add WhatsApp account', { name, phone, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/whatsapp/accounts/:accountId/regenerate-qr', async (req, res) => {
  try {
    const { accountId } = req.params;
    const result = await whatsappManager.regenerateQR(accountId);
    res.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { endpoint: 'regenerate-qr', function: 'whatsappV4' },
      extra: { accountId: req.params.accountId },
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/whatsapp/accounts/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    await whatsappManager.removeAccount(accountId);
    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { accountId, to, message } = req.body;
    await whatsappManager.sendMessage(accountId, to, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Alias for send-message (frontend compatibility)
app.post('/api/whatsapp/send-message', async (req, res) => {
  try {
    const { accountId, to, message } = req.body;

    // Get first connected account if no accountId provided
    let targetAccountId = accountId;
    if (!targetAccountId) {
      const accounts = whatsappManager.getAccounts();
      const connected = accounts.find(acc => acc.status === 'connected');
      if (!connected) {
        return res.status(400).json({ success: false, error: 'No connected account found' });
      }
      targetAccountId = connected.id;
    }

    await whatsappManager.sendMessage(targetAccountId, to, message);
    res.json({ success: true, message: 'Message sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get messages for a client
app.get('/api/whatsapp/messages', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    // TODO: Implement message storage/retrieval
    res.json({ success: true, messages: [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get clients list
app.get('/api/clients', async (req, res) => {
  try {
    // TODO: Implement clients list from WhatsApp chats
    res.json({ success: true, clients: [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Connect page with QR code
app.get('/connect/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const qrData = await whatsappManager.getQRForWeb(accountId);

    if (!qrData) {
      return res.send(
        `<html><body style="font-family: Arial; text-align: center; padding: 50px;"><h1>Account not found</h1><p>ID: ${accountId}</p></body></html>`
      );
    }

    res.send(`
      <html>
        <head>
          <title>Connect WhatsApp - ${accountId}</title>
          <meta http-equiv="refresh" content="5">
          <style>
            body { font-family: Arial; text-align: center; padding: 20px; background: #f0f0f0; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            h1 { color: #25D366; }
            .qr-container img { max-width: 400px; border: 2px solid #25D366; border-radius: 10px; }
            .status { padding: 10px; margin: 10px 0; border-radius: 5px; font-weight: bold; }
            .status.qr_ready { background: #d4edda; color: #155724; }
            .status.connected { background: #d1ecf1; color: #0c5460; }
            .pairing-code { font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #25D366; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔗 Connect WhatsApp</h1>
            <div class="status ${qrData.status}">${qrData.status.toUpperCase()}</div>
            
            ${
              qrData.status === 'qr_ready' && qrData.qrCode
                ? `
              <div class="qr-container"><img src="${qrData.qrCode}" /></div>
              ${qrData.pairingCode ? `<p>Pairing code:</p><div class="pairing-code">${qrData.pairingCode}</div>` : ''}
              <p><em>Scan with WhatsApp → Settings → Linked Devices</em></p>
            `
                : qrData.status === 'connected'
                  ? `
              <h2>✅ Connected!</h2>
            `
                  : `
              <p>Waiting... (${qrData.status})</p>
            `
            }
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`<html><body><h1>Error: ${error.message}</h1></body></html>`);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: Date.now() });
});

// REMOVED: 1st Gen function - cannot upgrade to 2nd Gen
// Use whatsappV4 instead (2nd Gen)
// exports.whatsapp = functions.https.onRequest(app);

// 2nd Gen version with all endpoints (deprecated - use whatsappV4)
// exports.whatsappV2 = functions
//   .runWith({
//     timeoutSeconds: 540,
//     memory: '512MB'
//   })
//   .https.onRequest(app);

// Clean new function - no upgrade history (v1 - deprecated)
// exports.whatsappV3 = functions.https.onRequest(app);

// WhatsApp Backend v2 (2nd Gen)
exports.whatsappV4 = onRequest(
  {
    timeoutSeconds: 540,
    memory: '512MiB',
    maxInstances: 10,
  },
  app
);

// AI Chat with Groq/Llama + Smart Memory
const groqApiKey = defineSecret('GROQ_API_KEY');

exports.chatWithAI = onCall(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [groqApiKey],
  },
  async request => {
    const data = request.data;
    const context = request.auth;
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const userId = context?.uid;
      const userEmail = context?.token?.email;
      
      if (!userId) {
        console.error(`[${requestId}] User not authenticated`);
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      if (!data.messages || !Array.isArray(data.messages)) {
        console.error(`[${requestId}] Invalid input`);
        throw new functions.https.HttpsError('invalid-argument', 'Messages array required');
      }

      let groqKey = null;
      try {
        groqKey = groqApiKey.value();
      } catch (e) {
        groqKey = process.env.GROQ_API_KEY;
      }

      if (!groqKey) {
        throw new functions.https.HttpsError('failed-precondition', 'GROQ_API_KEY not configured');
      }

      groqKey = groqKey.trim().replace(/[\r\n\t]/g, '');

      console.log(`[${requestId}] chatWithAI called`, {
        userId,
        messageCount: data.messages?.length || 0,
      });

      const messagesRef = admin.firestore()
        .collection('aiChats')
        .doc(userId)
        .collection('messages')
        .where('important', '==', true)
        .orderBy('timestamp', 'desc')
        .limit(10);
      
      const snapshot = await messagesRef.get();
      const contextMessages = [];
      
      snapshot.forEach(doc => {
        const msgData = doc.data();
        contextMessages.unshift({
          role: 'user',
          content: msgData.userMessage
        });
        contextMessages.push({
          role: 'assistant',
          content: msgData.aiResponse
        });
      });

      const allMessages = [...contextMessages, ...data.messages.map(m => ({
        role: m.role,
        content: m.content
      }))];

      const Groq = require('groq-sdk');
      const groq = new Groq({ apiKey: groqKey });

      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-70b-versatile',
        messages: allMessages,
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0]?.message?.content || 'No response';
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const currentSessionId = data.sessionId || `session_${Date.now()}`;

      const userMessage = data.messages[data.messages.length - 1];
      const isImportant = userMessage.content.length > 20 && 
                         !['ok', 'da', 'nu', 'haha', 'lol'].includes(userMessage.content.toLowerCase());

      await admin.firestore().collection('aiChats').doc(userId).collection('messages').add({
        sessionId: currentSessionId,
        userMessage: userMessage.content,
        aiResponse: aiResponse,
        timestamp: timestamp,
        userEmail: userEmail,
        important: isImportant,
      });

      const userStatsRef = admin.firestore().collection('aiChats').doc(userId);
      const userStats = await userStatsRef.get();
      
      if (!userStats.exists) {
        await userStatsRef.set({
          userId,
          email: userEmail,
          totalMessages: 1,
          firstUsed: timestamp,
          lastUsed: timestamp,
        });
      } else {
        await userStatsRef.update({
          totalMessages: (userStats.data().totalMessages || 0) + 1,
          lastUsed: timestamp,
        });
      }

      const duration = Date.now() - startTime;
      console.log(`[${requestId}] Success (${duration}ms)`);

      return {
        success: true,
        message: aiResponse,
        sessionId: currentSessionId,
      };
    } catch (error) {
      console.error(`[${requestId}] Error:`, error.message);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError('internal', 'Failed to get AI response');
    }
  }
);

