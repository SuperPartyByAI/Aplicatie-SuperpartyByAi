const { onRequest, onCall } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const functions = require('firebase-functions'); // Keep v1 for existing functions

// Initialize Sentry
const { Sentry } = require('./sentry');

// Initialize Better Stack (Logtail)
const logtail = require('./logtail');

// Initialize Memory Cache
const cache = require('./cache');

// Groq (Llama) - Initialize once for connection pooling
const Groq = require('groq-sdk');
let groqClient = null;

// Get or create Groq client (connection pooling)
function getGroqClient(apiKey) {
  if (!groqClient || groqClient._apiKey !== apiKey) {
    groqClient = new Groq({
      apiKey,
      maxRetries: 2,
      timeout: 25000, // 25s timeout
    });
    groqClient._apiKey = apiKey; // Track key for reuse
  }
  return groqClient;
}

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

// Lazy-load WhatsAppManager to avoid ESM analysis at module load time
// This prevents Firebase emulator from trying to analyze Baileys (ESM) during startup
let WhatsAppManagerClass = null;
let whatsappManager = null;

/**
 * Lazy-load WhatsAppManager only when needed (on first request)
 * This avoids ESM/CJS mismatch errors during Firebase emulator analysis
 */
function getWhatsAppManager() {
  if (!whatsappManager) {
    if (!WhatsAppManagerClass) {
      WhatsAppManagerClass = require('./whatsapp/manager');
    }
    whatsappManager = new WhatsAppManagerClass(io);
  }
  return whatsappManager;
}

// -----------------------------------------------------------------------------
// Staff Settings + Admin callables (TypeScript build output)
// -----------------------------------------------------------------------------
// These functions are implemented in `functions/src/index.ts` and compiled to `functions/dist/index.js`.
// We explicitly re-export them here so Firebase deploy picks them up from this entrypoint.
try {
  // eslint-disable-next-line global-require
  const staffCallables = require('./dist/index.js');
  exports.allocateStaffCode = staffCallables.allocateStaffCode;
  exports.finalizeStaffSetup = staffCallables.finalizeStaffSetup;
  exports.updateStaffPhone = staffCallables.updateStaffPhone;
  exports.changeUserTeam = staffCallables.changeUserTeam;
  exports.setUserStatus = staffCallables.setUserStatus;
  console.log('✅ Staff/Admin callables exported');
} catch (e) {
  console.warn('⚠️ Staff/Admin callables not loaded (dist/index.js missing?)', e?.message || e);
}

app.get('/', (req, res) => {
  const manager = getWhatsAppManager();
  res.json({
    status: 'online',
    service: 'SuperParty WhatsApp on Firebase',
    version: '5.2.0',
    deployed: new Date().toISOString(),
    accounts: manager.getAccounts().length,
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

  const manager = getWhatsAppManager();
  const accounts = manager.getAccounts();
  // Remove non-serializable fields (timers)
  const cleanAccounts = accounts.map(acc => {
    const { qrExpiryTimer: _qrExpiryTimer, ...rest } = acc;
    return rest;
  });

  // Cache for 30 seconds
  cache.set(cacheKey, cleanAccounts, 30 * 1000);

  res.json({ success: true, accounts: cleanAccounts, cached: false });
});

app.post('/api/whatsapp/add-account', async (req, res) => {
  try {
    const { name, phone } = req.body;
    const manager = getWhatsAppManager();
    const account = await manager.addAccount(name, phone);
    logtail.info('WhatsApp account added', { accountId: account.id, name, phone });
    res.json({ success: true, account });
  } catch (error) {
    const { name, phone } = req.body || {};
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
    const manager = getWhatsAppManager();
    const result = await manager.regenerateQR(accountId);
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
    const manager = getWhatsAppManager();
    await manager.removeAccount(accountId);
    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { accountId, to, message } = req.body;
    const manager = getWhatsAppManager();
    await manager.sendMessage(accountId, to, message);
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
    const manager = getWhatsAppManager();
    let targetAccountId = accountId;
    if (!targetAccountId) {
      const accounts = manager.getAccounts();
      const connected = accounts.find(acc => acc.status === 'connected');
      if (!connected) {
        return res.status(400).json({ success: false, error: 'No connected account found' });
      }
      targetAccountId = connected.id;
    }

    await manager.sendMessage(targetAccountId, to, message);
    res.json({ success: true, message: 'Message sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get messages for a client
app.get('/api/whatsapp/messages', (req, res) => {
  try {
    const { limit: _limit = 50 } = req.query;
    // TODO: Implement message storage/retrieval
    res.json({ success: true, messages: [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get clients list
app.get('/api/clients', (req, res) => {
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
    const manager = getWhatsAppManager();
    const qrData = await manager.getQRForWeb(accountId);

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
    timeoutSeconds: 30, // Reduced from 60s
    memory: '512MiB', // Increased for faster processing
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

      console.log(`[${requestId}] Auth context:`, {
        hasContext: !!context,
        hasUid: !!userId,
        hasEmail: !!userEmail,
        uid: userId,
      });

      if (!userId) {
        console.error(`[${requestId}] User not authenticated - context:`, context);
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated. Please log in to the app.'
        );
      }

      if (!data.messages || !Array.isArray(data.messages)) {
        console.error(`[${requestId}] Invalid input`);
        throw new functions.https.HttpsError('invalid-argument', 'Messages array required');
      }

      let groqKey = null;
      try {
        groqKey = groqApiKey.value();
        console.log(`[${requestId}] GROQ_API_KEY loaded from secrets`);
      } catch (e) {
        console.warn(
          `[${requestId}] Failed to load GROQ_API_KEY from secrets, trying env:`,
          e.message
        );
        groqKey = process.env.GROQ_API_KEY;
      }

      // Clean key: trim whitespace and newlines
      if (groqKey) {
        groqKey = groqKey.trim().replace(/[\r\n\t]/g, '');
        console.log(`[${requestId}] GROQ_API_KEY cleaned (length: ${groqKey.length})`);
      }

      if (!groqKey) {
        console.error(`[${requestId}] GROQ_API_KEY not configured - neither in secrets nor env`);
        throw new functions.https.HttpsError(
          'failed-precondition',
          'GROQ_API_KEY not configured. Please set the secret: firebase functions:secrets:set GROQ_API_KEY'
        );
      }

      console.log(`[${requestId}] chatWithAI called`, {
        userId,
        messageCount: data.messages?.length || 0,
      });

      const userMessage = data.messages[data.messages.length - 1];
      const currentSessionId = data.sessionId || `session_${Date.now()}`;
      const userText = userMessage.content.toLowerCase().trim();

      // Check for event creation intent
      const eventIntentPatterns = [
        'vreau sa notez', 'vreau sa adaug', 'vreau sa creez',
        'trebuie sa notez', 'am de notat', 'pot sa notez',
        'vreau eveniment', 'vreau petrecere', 'am o petrecere',
        'noteaza', 'adauga', 'creeaza'
      ];
      const hasEventIntent = eventIntentPatterns.some(p => userText.includes(p));

      // Get or create conversation state from Firestore
      const db = admin.firestore();
      const stateRef = db.collection('conversationStates').doc(currentSessionId);
      const stateDoc = await stateRef.get();
      let conversationState = stateDoc.exists ? stateDoc.data() : null;

      // INTERACTIVE EVENT CREATION FLOW
      if (hasEventIntent && !conversationState) {
        // Start interactive flow
        conversationState = {
          mode: 'collecting_event',
          step: 'name',
          data: {},
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await stateRef.set(conversationState);
        
        return {
          success: true,
          message: 'Perfect! 🎉 Pentru cine este petrecerea? (spune-mi numele)',
          sessionId: currentSessionId,
          conversationState: 'collecting_event'
        };
      }

      // Continue interactive flow if in collecting mode
      if (conversationState && conversationState.mode === 'collecting_event') {
        const step = conversationState.step;
        const eventData = conversationState.data || {};

        if (step === 'name') {
          eventData.sarbatoritNume = userMessage.content.trim();
          conversationState.step = 'age';
          conversationState.data = eventData;
          await stateRef.update(conversationState);
          
          return {
            success: true,
            message: `Super! Câți ani are ${eventData.sarbatoritNume}?`,
            sessionId: currentSessionId,
            conversationState: 'collecting_event'
          };
        }

        if (step === 'age') {
          const age = parseInt(userText.match(/\d+/)?.[0] || '0');
          if (age > 0) {
            eventData.sarbatoritVarsta = age;
            conversationState.step = 'date';
            conversationState.data = eventData;
            await stateRef.update(conversationState);
            
            return {
              success: true,
              message: 'Excelent! Ce dată va fi petrecerea? (format DD-MM-YYYY, ex: 15-01-2026)',
              sessionId: currentSessionId,
              conversationState: 'collecting_event'
            };
          } else {
            return {
              success: true,
              message: 'Te rog să specifici vârsta (un număr, ex: 5)',
              sessionId: currentSessionId,
              conversationState: 'collecting_event'
            };
          }
        }

        if (step === 'date') {
          const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
          const dateMatch = userText.match(/\d{2}-\d{2}-\d{4}/);
          
          if (dateMatch && dateRegex.test(dateMatch[0])) {
            eventData.date = dateMatch[0];
            conversationState.step = 'address';
            conversationState.data = eventData;
            await stateRef.update(conversationState);
            
            return {
              success: true,
              message: 'Perfect! Unde va fi petrecerea? (adresa completă)',
              sessionId: currentSessionId,
              conversationState: 'collecting_event'
            };
          } else {
            return {
              success: true,
              message: 'Te rog să specifici data în format DD-MM-YYYY (ex: 15-01-2026)',
              sessionId: currentSessionId,
              conversationState: 'collecting_event'
            };
          }
        }

        if (step === 'address') {
          eventData.address = userMessage.content.trim();
          conversationState.step = 'confirm';
          conversationState.data = eventData;
          await stateRef.update(conversationState);
          
          const summary = `Gata! ✅ Iată ce am notat:

📝 Eveniment pentru ${eventData.sarbatoritNume}, ${eventData.sarbatoritVarsta} ani
📅 Data: ${eventData.date}
📍 Locație: ${eventData.address}

Scrie "da" pentru a confirma și crea evenimentul, sau "anulează" pentru a renunța.`;
          
          return {
            success: true,
            message: summary,
            sessionId: currentSessionId,
            conversationState: 'collecting_event',
            eventPreview: eventData
          };
        }

        if (step === 'confirm') {
          if (userText === 'da' || userText === 'confirm' || userText === 'confirma') {
            // Call chatEventOps to create event
            const chatEventOps = require('./chatEventOps');
            
            const eventText = `Notează eveniment pentru ${eventData.sarbatoritNume}, ${eventData.sarbatoritVarsta} ani, pe ${eventData.date} la ${eventData.address}`;
            
            try {
              const eventResult = await chatEventOps({
                data: {
                  text: eventText,
                  dryRun: false,
                  clientRequestId: `interactive_${currentSessionId}_${Date.now()}`
                },
                auth: request.auth
              }, {
                status: () => ({ json: () => {} }),
                json: (data) => data
              });
              
              // Clear conversation state
              await stateRef.delete();
              
              return {
                success: true,
                message: `🎉 Perfect! Evenimentul a fost creat cu succes! ✅\n\nPoți vedea detaliile în lista de evenimente.`,
                sessionId: currentSessionId,
                eventCreated: true,
                eventId: eventResult.eventId
              };
            } catch (error) {
              console.error(`[${requestId}] Error creating event:`, error);
              await stateRef.delete();
              
              return {
                success: false,
                message: `❌ A apărut o eroare la crearea evenimentului: ${error.message}`,
                sessionId: currentSessionId
              };
            }
          } else if (userText === 'anuleaza' || userText === 'nu' || userText === 'renunt') {
            await stateRef.delete();
            
            return {
              success: true,
              message: 'OK, am anulat crearea evenimentului. Cu ce te mai pot ajuta? 😊',
              sessionId: currentSessionId
            };
          } else {
            return {
              success: true,
              message: 'Te rog să confirmi cu "da" sau să anulezi cu "nu"',
              sessionId: currentSessionId,
              conversationState: 'collecting_event'
            };
          }
        }
      }

      // Check for short confirmation messages that might cause loops
      const shortConfirmations = ['da', 'ok', 'bine', 'excelent', 'perfect', 'super', 'yes', 'no', 'nu'];
      const isShortConfirmation = shortConfirmations.includes(userText) || userText.length <= 3;

      // OPTIMIZATION: Check cache for common questions (skip if in conversation state)
      if (!conversationState) {
        const cacheKey = `ai:response:${userMessage.content.toLowerCase().trim().substring(0, 100)}`;
        const cachedResponse = cache.get(cacheKey);

        if (cachedResponse && !isShortConfirmation) {
          console.log(`[${requestId}] Cache hit - returning in ${Date.now() - startTime}ms`);
          return {
            success: true,
            message: cachedResponse,
            sessionId: currentSessionId,
            cached: true,
          };
        }
      }

      // Use pooled Groq client (faster connection reuse)
      const groq = getGroqClient(groqKey);

      // Use only last 5 messages from request (smaller payload, faster)
      const recentMessages = data.messages.slice(-5);

      // Add system message for context (only if not present)
      if (recentMessages.length > 0 && recentMessages[0].role !== 'system') {
        const now = new Date();
        const romaniaTime = new Intl.DateTimeFormat('ro-RO', {
          timeZone: 'Europe/Bucharest',
          dateStyle: 'full',
          timeStyle: 'short',
        }).format(now);

        recentMessages.unshift({
          role: 'system',
          content: `Ești SuperParty AI - asistent pentru petreceri și evenimente.

DATA ȘI ORA CURENTĂ: ${romaniaTime}

IMPORTANT - CREAREA EVENIMENTELOR (FLOW INTERACTIV):
- ÎNTREABĂ utilizatorul despre detalii lipsă (dată, locație, roluri, etc.) - OBLIGATORIU
- CERE confirmări înainte de a crea/actualiza evenimente - OBLIGATORIU
- Când utilizatorul spune "vreau să notez un eveniment" SAU "am o petrecere", ÎNTREABĂ:
  * Data (format DD-MM-YYYY, ex: 15-01-2026)
  * Adresa/Locația completă
  * Nume sărbătorit (dacă e aniversare/botez)
  * Vârsta/Data nașterii (pentru animator/ursitoare)
  * Roluri necesare (animator, ursitoare, vată de zahăr, etc.)
  * Ora și durata pentru fiecare rol
- REZUMĂ toate detaliile și CERE CONFIRMARE înainte de a crea evenimentul
- Exemplu: "Am înțeles: Eveniment pe 15-01-2026 la București, Str. Exemplu 10, pentru Maria (5 ani), cu animator (14:00, 2 ore) și vată de zahăr (14:00, 2 ore). Confirm crearea?"
- Dacă utilizatorul răspunde cu răspunsuri scurte ("da", "ok", "bine") ÎN CONTEXTUL CONFIRMĂRII → creează evenimentul
- Dacă utilizatorul răspunde cu răspunsuri scurte FĂRĂ CONTEXT → întreabă "Cu ce te pot ajuta?"
- NU intra în loop-uri de întrebări repetitive - dacă ai întrebat deja ceva, nu mai întreba

PERSONALITATE:
- Fii prietenos și profesional
- Folosește 1-3 emoji-uri relevante per răspuns (nu exagera)
- Răspunde concis și la obiect
- Menționează data/ora când e relevant pentru planificare

REGULI EMOJI (FOLOSEȘTE-LE MULT!):
🎉🎊🎈 Petreceri/Evenimente: 🎉 🎊 🎈 🎂 🍾 🥂 🎵 🎶 🎤 🎸 💃 🕺 🪩 🎭
✨🌟⭐ Bucurie/Succes: 🎉 🎊 ✨ 🌟 ⭐ 💫 🎈 🥳 😊 😄 🤩 😍 👏 💪 🔥 💯
✅👍💯 Confirmare/OK: ✅ ✔️ 👍 👌 💯 🎯 ⚡ 🚀 💪 🔥
⚠️❗💡 Atenție/Important: ⚠️ ❗ ❕ 💡 🔔 📢 👀 🎯 📍
❓🤔💭 Întrebări/Ajutor: ❓ ❔ 🤔 💭 🆘 📝 💬 🗨️ 💡
⏰📅🗓️ Timp/Calendar: ⏰ 📅 🗓️ ⏳ 🕐 🕑 🕒 ⏱️ 📆
📍🗺️🏨 Locație: 📍 🗺️ 🏠 🏢 🏨 🏰 🏛️ 🌆 🌃
👥🤝💼 Oameni/Echipă: 👥 👨‍👩‍👧‍👦 🤝 💼 👔 👗 👫 👬 👭 🙋‍♂️ 🙋‍♀️
🍕🍰🍾 Mâncare/Băutură: 🍕 🍔 🍰 🎂 🧁 🍾 🥂 🍷 🍹 🍸 ☕ 🍻 🥤
🎵🎶💃 Muzică/Dans: 🎵 🎶 🎤 🎸 🎹 🎺 🎷 🥁 💃 🕺 🪩 🎧 🔊
💍👰💕 Nuntă/Dragoste: 💍 👰 🤵 💕 💖 💝 💗 💓 💞 💐 🌹 🥀 💒
👶🍼🎀 Botez/Copii: 👶 🍼 🎀 🧸 🎁 👼 🐣 🎈 🧷
🎂🎁🎈 Aniversare: 🎂 🎁 🎈 🎉 🎊 🥳 🎀 🕯️ 🧁
💼🏢📊 Corporate: 💼 🏢 📊 📈 💻 🖥️ 📱 🎯 🚀
❌😢⛔ Probleme/Erori: ❌ ⛔ 🚫 😕 😢 😞 💔 🆘

STIL DE RĂSPUNS SUPER-EXPRESIV:

1. SALUT ENTUZIAST:
"Heyyy! 👋😊 Bine ai venit! 🎉✨"
"Salutare! 🥳🎊 Ce mai faci? 😄💫"
"Bună ziua! 🌟💖 Mă bucur să te văd! 🎈✨"

2. CONFIRMARE POZITIVĂ:
"Perfect! 🎉✨ Sună super! 🔥💯"
"Geniaal! 🤩🎊 Exact ce trebuie! 👌💪"
"Extraordinar! 🌟🎉 Mă bucur tare mult! 😍✨"

3. ÎNTREBĂRI PRIETENOASE:
"Spune-mi mai multe! 🤔💭 Sunt curios! 😊✨"
"Ce planuri ai? 🎯📅 Vreau să știu totul! 🎉💫"
"Cum te pot ajuta? 🆘💡 Sunt aici pentru tine! 💪🎊"

4. ÎNCURAJARE:
"Hai că merge! 💪🔥 O să fie super! 🎉✨"
"Nu-ți face griji! 😊💖 Rezolvăm împreună! 🤝💯"
"Ești pe drumul cel bun! 🎯🚀 Continuă așa! 👏🌟"

5. MULȚUMIRI:
"Cu mare drag! 💖😊 Oricând! 🎉✨"
"Plăcerea mea! 🥰💫 Să ai o zi minunată! 🌟🎊"
"Mă bucur că te-am ajutat! 😄🎈 Succes! 💪🔥"

EXEMPLE COMPLETE:

User: "Salut"
AI: "Heyyy! 👋😊🎉 Bine ai venit la SuperParty! 🥳✨ Cum te pot ajuta astăzi? 🤔💭"

User: "Vreau să creez un eveniment"
AI: "Super! 🎉✨ Pentru a crea un eveniment, spune-mi toate detaliile într-un singur mesaj: 📝
'Notează eveniment pentru [nume], [vârstă] ani, pe [DD-MM-YYYY] la [adresă completă]' 📍
Exemplu: 'Notează eveniment pentru Maria, 5 ani, pe 15-02-2026 la Strada Florilor 10, București' 🎈"

User: "da" sau "ok"
AI: "Perfect! 👌✨ Cu ce te mai pot ajuta? 🤔💭"

User: "Mulțumesc mult!"
AI: "Cu mare plăcere! 💖😊🎉 Dacă mai ai nevoie de ceva, oricând! 💪🔥 Să ai o zi fantastică! 🌟🎊"

User: "Ce poți să faci?"
AI: "Ooo! 🤩✨ Pot să fac multe! 💪🔥 Te pot ajuta cu: 🎯
📅 Planificare evenimente 🎉🎊
👥 Organizare echipă 🤝💼
🎵 Recomandări muzică 🎶💃
🍰 Idei meniu 🍕🥂
📍 Sugestii locații 🏨✨
Și multe altele! 🌟💫 Ce te interesează? 🤔💭🎈"

IMPORTANT:
- FIECARE propoziție trebuie să aibă emoji-uri! 🎯✨
- Combină 2-3 emoji-uri pentru emoții puternice! 🎉🎊✨
- Adaptează emoji-urile la context (nuntă 💍, botez 👶, corporate 💼)! 🎯
- Fii SUPER entuziast și pozitiv MEREU! 🔥💯🌟
- Răspunde ÎNTOTDEAUNA în română! 🇷🇴💖

Hai să facem fiecare conversație o mini-petrecere! 🎉🎊🥳✨💫🌟`,
        });
      }

      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: recentMessages,
        max_tokens: 200, // Further reduced for faster response
        temperature: 0.7,
        stream: false,
        top_p: 0.9, // Slightly more focused responses
      });

      const aiResponse = completion.choices[0]?.message?.content || 'No response';
      const duration = Date.now() - startTime;

      console.log(`[${requestId}] AI response in ${duration}ms`);

      // OPTIMIZATION: Cache response for common questions (2 minutes)
      if (userMessage.content.length < 100) {
        cache.set(cacheKey, aiResponse, 2 * 60 * 1000);
      }

      // OPTIMIZATION: Save to Firestore asynchronously (don't wait)
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const isImportant =
        userMessage.content.length > 20 &&
        !['ok', 'da', 'nu', 'haha', 'lol'].includes(userMessage.content.toLowerCase());

      // Fire and forget - don't await
      admin
        .firestore()
        .collection('aiChats')
        .doc(userId)
        .collection('messages')
        .add({
          sessionId: currentSessionId,
          userMessage: userMessage.content,
          aiResponse: aiResponse,
          timestamp: timestamp,
          userEmail: userEmail,
          important: isImportant,
        })
        .catch(err => console.error(`[${requestId}] Firestore save error:`, err));

      // Update stats asynchronously
      const userStatsRef = admin.firestore().collection('aiChats').doc(userId);
      userStatsRef
        .get()
        .then(userStats => {
          if (!userStats.exists) {
            return userStatsRef.set({
              userId,
              email: userEmail,
              totalMessages: 1,
              firstUsed: timestamp,
              lastUsed: timestamp,
            });
          } else {
            return userStatsRef.update({
              totalMessages: (userStats.data().totalMessages || 0) + 1,
              lastUsed: timestamp,
            });
          }
        })
        .catch(err => console.error(`[${requestId}] Stats update error:`, err));

      // Return immediately after AI response
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
// Force redeploy - Sat Jan  3 08:39:53 UTC 2026

// AI Event Creation
const { createEventFromAI } = require('./createEventFromAI');
exports.createEventFromAI = createEventFromAI;

// AI Event Notation
const { noteazaEventeAutomat } = require('./noteazaEventeAutomat');
exports.noteazaEventeAutomat = noteazaEventeAutomat;

// AI Event Reading
const { getEventeAI } = require('./getEventeAI');
exports.getEventeAI = getEventeAI;

// AI Event Update
const { updateEventAI } = require('./updateEventAI');
exports.updateEventAI = updateEventAI;

// AI Role Management
const { manageRoleAI } = require('./manageRoleAI');
exports.manageRoleAI = manageRoleAI;

// AI Event Archive
const { archiveEventAI } = require('./archiveEventAI');
exports.archiveEventAI = archiveEventAI;

// AI Evidence Management
const { manageEvidenceAI } = require('./manageEvidenceAI');
exports.manageEvidenceAI = manageEvidenceAI;

// AI Report Generation
const { generateReportAI } = require('./generateReportAI');
exports.generateReportAI = generateReportAI;

// AI Event Operations (CREATE/UPDATE/ARCHIVE/LIST)
exports.chatEventOps = require('./chatEventOps').chatEventOps;

// AI Event Operations V2 (Enhanced with interactive flow, short codes, role detection)
exports.chatEventOpsV2 = require('./chatEventOpsV2').chatEventOpsV2;

// Audit trigger for event changes
exports.auditEventChanges = require('./auditEventChanges').auditEventChanges;

// Follow-up scheduler (runs every hour)
exports.processFollowUps = require('./followUpScheduler').processFollowUps;

// Staff code management
exports.setStaffCode = require('./staffCodeManager').setStaffCode;

// V3 AI Event Handler
exports.aiEventHandler = require('./aiEventHandler_v3').aiEventHandler;

// WhatsApp Backend Proxy - QR Connect Routes Only
const whatsappProxy = require('./whatsappProxy');
exports.whatsappProxyGetAccounts = whatsappProxy.getAccounts;
exports.whatsappProxyAddAccount = whatsappProxy.addAccount;
exports.whatsappProxyRegenerateQr = whatsappProxy.regenerateQr;
exports.whatsappProxySend = whatsappProxy.send;

// --- Staff/Admin secure callables (TypeScript build) ---
// Built from functions/src/*.ts into functions/dist/*.js during predeploy.
try {
  Object.assign(exports, require('./dist/index'));
  console.log('✅ Loaded TypeScript callables from dist/index.js');
} catch (e) {
  console.warn('⚠️ TypeScript callables not loaded (dist missing). Run: npm --prefix functions run build');
  console.warn(e?.message || e);
}
