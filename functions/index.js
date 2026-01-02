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

      console.log(`[${requestId}] chatWithAI called`, {
        hasAuth: !!context,
        messageCount: data.messages?.length || 0,
        keySource: keySource,
        keyLength: openaiKey ? openaiKey.length : 0,
        timestamp: new Date().toISOString(),
      });

      if (!openaiKey) {
        console.error(`[${requestId}] OpenAI API key not configured - no secret or env var`);
        throw new functions.https.HttpsError(
          'failed-precondition',
          'AI service not configured. OPENAI_API_KEY secret missing.'
        );
      }

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
