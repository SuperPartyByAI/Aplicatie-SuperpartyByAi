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

// REMOVED: 1st Gen test function - cannot upgrade to 2nd Gen
// exports.testAI = functions.https.onRequest((req, res) => {
//   res.json({ success: true, message: 'Test AI function works!' });
// });

// Define OpenAI API key as secret
const openaiApiKey = defineSecret('OPENAI_API_KEY');

// AI Chat Function (v2)
exports.chatWithAI = onCall(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [openaiApiKey],
  },
  async request => {
    const data = request.data;
    const context = request.auth;
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Validate input
      if (!data.messages || !Array.isArray(data.messages)) {
        console.error(`[${requestId}] Invalid input - messages not array`);
        throw new functions.https.HttpsError('invalid-argument', 'Messages array is required');
      }

      // Get OpenAI API key with detailed logging
      let openaiKey = null;
      let keySource = 'none';
      
      try {
        openaiKey = openaiApiKey.value();
        if (openaiKey) keySource = 'secret';
      } catch (secretError) {
        console.warn(`[${requestId}] Secret access failed:`, secretError.message);
      }
      
      if (!openaiKey) {
        openaiKey = process.env.OPENAI_API_KEY;
        if (openaiKey) keySource = 'env';
      }

      if (!openaiKey) {
        console.error(`[${requestId}] OpenAI API key not configured - no secret or env var`);
        throw new functions.https.HttpsError(
          'failed-precondition',
          'AI service not configured. OPENAI_API_KEY secret missing.'
        );
      }

      // Clean the key - remove whitespace, newlines, etc.
      openaiKey = openaiKey.trim().replace(/[\r\n\t]/g, '');

      console.log(`[${requestId}] chatWithAI called`, {
        hasAuth: !!context,
        messageCount: data.messages?.length || 0,
        keySource: keySource,
        keyLength: openaiKey.length,
        keyPrefix: openaiKey.substring(0, 10) + '...',
        keySuffix: '...' + openaiKey.substring(openaiKey.length - 10),
        timestamp: new Date().toISOString(),
      });

      // Call OpenAI API
      const https = require('https');
      const response = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({
          model: 'gpt-4o-mini',
          messages: data.messages,
          max_tokens: 1000,
          temperature: 0.7,
        });

        const options = {
          hostname: 'api.openai.com',
          port: 443,
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 30000, // 30s timeout
        };

        const req = https.request(options, res => {
          let data = '';

          res.on('data', chunk => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);

              if (res.statusCode !== 200) {
                console.error(`[${requestId}] OpenAI error`, {
                  status: res.statusCode,
                  error: parsed.error,
                });

                if (res.statusCode === 401) {
                  reject(new functions.https.HttpsError('unauthenticated', 'Invalid API key'));
                } else if (res.statusCode === 429) {
                  reject(
                    new functions.https.HttpsError(
                      'resource-exhausted',
                      'Rate limit exceeded. Try again later.'
                    )
                  );
                } else {
                  reject(
                    new functions.https.HttpsError(
                      'unavailable',
                      'AI service temporarily unavailable'
                    )
                  );
                }
                return;
              }

              resolve(parsed);
            } catch (e) {
              reject(new functions.https.HttpsError('internal', 'Failed to parse AI response'));
            }
          });
        });

        req.on('error', e => {
          console.error(`[${requestId}] Request error:`, e.message);
          reject(
            new functions.https.HttpsError(
              'unavailable',
              'Network error communicating with AI service'
            )
          );
        });

        req.on('timeout', () => {
          req.destroy();
          console.error(`[${requestId}] Request timeout`);
          reject(
            new functions.https.HttpsError('deadline-exceeded', 'AI request timed out. Try again.')
          );
        });

        req.write(postData);
        req.end();
      });

      const duration = Date.now() - startTime;
      const message = response.choices[0]?.message?.content || 'No response';

      console.log(`[${requestId}] Success`, {
        duration: `${duration}ms`,
        responseLength: message.length,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: message,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error(`[${requestId}] Error`, {
        duration: `${duration}ms`,
        code: error.code,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        timestamp: new Date().toISOString(),
      });

      // Re-throw HttpsError as-is
      if (error.code && error.code.startsWith('functions/')) {
        throw error;
      }

      // Wrap other errors with more context
      throw new functions.https.HttpsError(
        'internal',
        `AI request failed: ${error.message || 'Unknown error'}`
      );
    }
  }
);

// AI Manager Function (v2)
exports.aiManager = onCall(
  {
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async request => {
    const data = request.data;
    const context = request.auth;
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[${requestId}] aiManager called`, {
      action: data.action,
      hasAuth: !!context,
    });

    try {
      const { action } = data;

      if (!action) {
        throw new functions.https.HttpsError('invalid-argument', 'Action is required');
      }

      // For now, return mock response
      // TODO: Implement actual AI manager logic
      const duration = Date.now() - startTime;

      console.log(`[${requestId}] Success (mock)`, {
        duration: `${duration}ms`,
        action,
      });

      return {
        success: true,
        message: 'AI Manager response (mock)',
        action: action,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error(`[${requestId}] Error`, {
        duration: `${duration}ms`,
        code: error.code,
        message: error.message,
      });

      if (error instanceof Error) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Internal error processing AI manager request'
      );
    }
  }
);

// ============================================
// KEEP-ALIVE SYSTEM - Push Notifications
// ============================================

// OPTION A: Keep-alive every 30 minutes (~8% battery/day)
exports.keepAlive30min = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async (context) => {
    console.log('⏰ Keep-alive 30min triggered');
    await sendKeepAliveNotifications('30min');
    return null;
  });

// OPTION B: Keep-alive every 1 hour (~4% battery/day)
exports.keepAlive1hour = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    console.log('⏰ Keep-alive 1hour triggered');
    await sendKeepAliveNotifications('1hour');
    return null;
  });

// OPTION C: Smart keep-alive (only during work hours, only active users)
exports.keepAliveSmart = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async (context) => {
    console.log('⏰ Keep-alive smart triggered');
    
    // Only run during work hours (9-22)
    const hour = new Date().getHours();
    if (hour < 9 || hour > 22) {
      console.log('⏭️ Outside work hours, skipping');
      return null;
    }

    await sendKeepAliveNotifications('smart');
    return null;
  });

// Send keep-alive notifications to active users
async function sendKeepAliveNotifications(mode) {
  try {
    const db = admin.firestore();
    const now = Date.now();
    const twoHoursAgo = now - (2 * 60 * 60 * 1000);

    // Get active users with FCM tokens
    let query = db.collection('users')
      .where('notificationsEnabled', '==', true)
      .where('fcmToken', '!=', null);

    // For smart mode, only get recently active users
    if (mode === 'smart') {
      query = query.where('lastActive', '>', new Date(twoHoursAgo));
    }

    const snapshot = await query.get();
    
    if (snapshot.empty) {
      console.log('No users to notify');
      return;
    }

    console.log(`Sending keep-alive to ${snapshot.size} users`);

    // Send notifications in batches
    const batch = [];
    snapshot.forEach(doc => {
      const user = doc.data();
      if (user.fcmToken) {
        batch.push(sendKeepAliveToUser(user.fcmToken, mode));
      }
    });

    await Promise.allSettled(batch);
    console.log(`✅ Keep-alive sent to ${batch.length} users`);

  } catch (error) {
    console.error('Keep-alive error:', error);
  }
}

// Send keep-alive notification to single user (optimized)
async function sendKeepAliveToUser(token, mode) {
  try {
    const message = {
      token: token,
      data: {
        type: 'keep-alive',
        mode: mode,
        timestamp: Date.now().toString()
      },
      android: {
        priority: 'normal', // Not 'high' to save battery
        ttl: 3600, // 1 hour TTL
      },
      apns: {
        headers: {
          'apns-priority': '5', // Low priority
        },
        payload: {
          aps: {
            'content-available': 1, // Silent notification
          }
        }
      },
      webpush: {
        headers: {
          Urgency: 'low',
          TTL: '3600'
        }
      }
    };

    await admin.messaging().send(message);
  } catch (error) {
    // Token might be invalid, log but don't throw
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      console.log('Invalid token, will be cleaned up');
    } else {
      console.error('Send error:', error);
    }
  }
}

// AI Chat Function
exports.chatWithAI = onCall(async (request) => {
  const groqKey = defineSecret('GROQ_API_KEY');
  
  try {
    const { messages, sessionId } = request.data;
    const userId = request.auth?.uid;
    const userEmail = request.auth?.token?.email;
    
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    if (!messages || !Array.isArray(messages)) {
      throw new Error('Invalid messages format');
    }

    // Load last 5 important messages from Firestore for context
    const messagesRef = admin.firestore()
      .collection('aiChats')
      .doc(userId)
      .collection('messages')
      .where('important', '==', true)
      .orderBy('timestamp', 'desc')
      .limit(5);
    
    const snapshot = await messagesRef.get();
    const contextMessages = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      contextMessages.unshift({
        role: 'user',
        content: data.userMessage
      });
      contextMessages.push({
        role: 'assistant',
        content: data.aiResponse
      });
    });

    // Combine context + new messages
    const allMessages = [...contextMessages, ...messages.map(m => ({
      role: m.role,
      content: m.content
    }))];

    const groq = new Groq({
      apiKey: groqKey.value(),
    });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-70b-versatile',
      messages: allMessages,
      max_tokens: 500,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const currentSessionId = sessionId || `session_${Date.now()}`;

    // Determine if message is important (simple heuristic)
    const userMessage = messages[messages.length - 1];
    const isImportant = userMessage.content.length > 20 && 
                       !['ok', 'da', 'nu', 'haha', 'lol'].includes(userMessage.content.toLowerCase());

    // Save conversation to Firestore
    await admin.firestore().collection('aiChats').doc(userId).collection('messages').add({
      sessionId: currentSessionId,
      userMessage: userMessage.content,
      aiResponse: aiResponse,
      timestamp: timestamp,
      userEmail: userEmail,
      important: isImportant,
    });

    // Update user analytics
    const userStatsRef = admin.firestore().collection('aiChats').doc(userId);
    const userStats = await userStatsRef.get();
    
    if (!userStats.exists) {
      await userStatsRef.set({
        userId: userId,
        email: userEmail,
        totalMessages: 1,
        firstUsed: timestamp,
        lastUsed: timestamp,
        specialCommands: [],
      });
    } else {
      const data = userStats.data();
      await userStatsRef.update({
        totalMessages: (data.totalMessages || 0) + 1,
        lastUsed: timestamp,
      });
    }

    return {
      message: aiResponse,
      sessionId: currentSessionId,
    };
  } catch (error) {
    console.error('AI Chat error:', error);
    throw new Error('Failed to get AI response');
  }
});
