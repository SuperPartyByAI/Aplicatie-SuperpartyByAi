const functions = require('firebase-functions');
// const { defineString } = require('firebase-functions/params'); // Temporarily disabled for compatibility
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
  cors: { origin: '*', methods: ['GET', 'POST'] }
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
      'GET /health'
    ]
  });
});

app.get('/api/whatsapp/accounts', (req, res) => {
  const accounts = whatsappManager.getAccounts();
  res.json({ success: true, accounts });
});

app.post('/api/whatsapp/add-account', async (req, res) => {
  try {
    const { name, phone } = req.body;
    const account = await whatsappManager.addAccount(name, phone);
    res.json({ success: true, account });
  } catch (error) {
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: Date.now() });
});

// Keep 1st Gen - works with existing deployment
exports.whatsapp = functions.https.onRequest(app);

// 2nd Gen version with all endpoints
exports.whatsappV2 = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '512MB'
  })
  .https.onRequest(app);

// Clean new function - no upgrade history
exports.whatsappV3 = functions.https.onRequest(app);

// AI Chat Function
exports.chatWithAI = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '256MB'
  })
  .https.onCall(async (data, context) => {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[${requestId}] chatWithAI called`, {
      hasAuth: !!context.auth,
      messageCount: data.messages?.length || 0
    });
    
    try {
      // Validate input
      if (!data.messages || !Array.isArray(data.messages)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Messages array is required'
        );
      }
      
      // Get OpenAI API key from environment
      const openaiKey = process.env.OPENAI_API_KEY;
      
      if (!openaiKey) {
        console.error(`[${requestId}] OpenAI API key not configured`);
        throw new functions.https.HttpsError(
          'failed-precondition',
          'AI service not configured. Contact administrator.'
        );
      }
      
      // Call OpenAI API
      const https = require('https');
      const response = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: data.messages,
          max_tokens: 500,
          temperature: 0.7
        });
        
        const options = {
          hostname: 'api.openai.com',
          port: 443,
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 30000 // 30s timeout
        };
        
        const req = https.request(options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              
              if (res.statusCode !== 200) {
                console.error(`[${requestId}] OpenAI error`, {
                  status: res.statusCode,
                  error: parsed.error
                });
                
                if (res.statusCode === 401) {
                  reject(new functions.https.HttpsError(
                    'unauthenticated',
                    'Invalid API key'
                  ));
                } else if (res.statusCode === 429) {
                  reject(new functions.https.HttpsError(
                    'resource-exhausted',
                    'Rate limit exceeded. Try again later.'
                  ));
                } else {
                  reject(new functions.https.HttpsError(
                    'unavailable',
                    'AI service temporarily unavailable'
                  ));
                }
                return;
              }
              
              resolve(parsed);
            } catch (e) {
              reject(new functions.https.HttpsError(
                'internal',
                'Failed to parse AI response'
              ));
            }
          });
        });
        
        req.on('error', (e) => {
          console.error(`[${requestId}] Request error:`, e.message);
          reject(new functions.https.HttpsError(
            'unavailable',
            'Network error communicating with AI service'
          ));
        });
        
        req.on('timeout', () => {
          req.destroy();
          console.error(`[${requestId}] Request timeout`);
          reject(new functions.https.HttpsError(
            'deadline-exceeded',
            'AI request timed out. Try again.'
          ));
        });
        
        req.write(postData);
        req.end();
      });
      
      const duration = Date.now() - startTime;
      const message = response.choices[0]?.message?.content || 'No response';
      
      console.log(`[${requestId}] Success`, {
        duration: `${duration}ms`,
        responseLength: message.length
      });
      
      return {
        success: true,
        message: message
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.error(`[${requestId}] Error`, {
        duration: `${duration}ms`,
        code: error.code,
        message: error.message
      });
      
      // Re-throw HttpsError as-is
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      // Wrap other errors
      throw new functions.https.HttpsError(
        'internal',
        'Internal error processing AI request'
      );
    }
  });

// AI Manager Function (for image validation, etc.)
exports.aiManager = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '512MB'
  })
  .https.onCall(async (data, context) => {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[${requestId}] aiManager called`, {
      action: data.action,
      hasAuth: !!context.auth
    });
    
    try {
      const { action } = data;
      
      if (!action) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Action is required'
        );
      }
      
      // For now, return mock response
      // TODO: Implement actual AI manager logic
      const duration = Date.now() - startTime;
      
      console.log(`[${requestId}] Success (mock)`, {
        duration: `${duration}ms`,
        action
      });
      
      return {
        success: true,
        message: 'AI Manager response (mock)',
        action: action
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.error(`[${requestId}] Error`, {
        duration: `${duration}ms`,
        code: error.code,
        message: error.message
      });
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        'Internal error processing AI manager request'
      );
    }
  });
