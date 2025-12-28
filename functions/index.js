const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

// Initialize Firebase Admin
admin.initializeApp();

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
    version: '5.0.0',
    accounts: whatsappManager.getAccounts().length
  });
});

app.get('/api/whatsapp/accounts', (req, res) => {
  const accounts = whatsappManager.getAccounts();
  res.json({ success: true, accounts });
});

app.get('/api/whatsapp/account/:accountId', (req, res) => {
  const { accountId } = req.params;
  const accounts = whatsappManager.getAccounts();
  const account = accounts.find(a => a.id === accountId);
  
  if (!account) {
    return res.status(404).json({ success: false, error: 'Account not found' });
  }
  
  res.json({ success: true, account });
});

app.post('/api/whatsapp/add-account', async (req, res) => {
  try {
    const { name } = req.body;
    // ✅ NU trimite phone - folosește doar QR codes (funcționează 100%)
    // ❌ Pairing codes nu funcționează în Cloud Functions
    const account = await whatsappManager.addAccount(name);
    res.json({ success: true, account });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// AI Chat Functions
exports.chatWithAI = functions.https.onCall(async (data, context) => {
  // Verifică autentificare
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Trebuie să fii autentificat');
  }

  const { messages, userContext } = data;

  try {
    const lastMessage = messages[messages.length - 1];
    
    // Construiește context pentru AI
    const systemPrompt = `Ești asistentul AI pentru SuperParty, o platformă de management evenimente și staff.

Context utilizator:
- Nume: ${userContext.user?.nume || 'User'}
- Email: ${userContext.user?.email || 'N/A'}
- Cod: ${userContext.user?.code || 'N/A'}
- Este admin: ${userContext.isAdmin ? 'Da' : 'Nu'}

Statistici:
- Evenimente total: ${userContext.stats?.evenimenteTotal || 0}
- Evenimente astăzi: ${userContext.stats?.evenimenteAstazi || 0}
- Evenimente nealocate: ${userContext.stats?.evenimenteNealocate || 0}
- Staff total: ${userContext.stats?.staffTotal || 0}
${userContext.isAdmin ? `- KYC în așteptare: ${userContext.stats?.kycPending || 0}` : ''}

Răspunde în română, concis și util. Ajută utilizatorul cu informații despre evenimente, staff, disponibilitate, etc.`;

    // Call OpenAI
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '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';
    
    const axios = require('axios');
    const openaiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-5).map(m => ({ role: m.role, content: m.content }))
      ],
      temperature: 0.7,
      max_tokens: 500
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const response = openaiResponse.data.choices[0].message.content;
    
    // Salvează conversația în Firestore
    await admin.firestore().collection('aiConversations').add({
      userId: context.auth.uid,
      userEmail: context.auth.token.email,
      userName: userContext.user?.nume || 'Unknown',
      userMessage: lastMessage.content,
      aiResponse: response,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      model: 'gpt-4o-mini'
    });

    return {
      success: true,
      message: response
    };
  } catch (error) {
    console.error('Chat AI error:', error);
    throw new functions.https.HttpsError('internal', 'Eroare la procesarea mesajului: ' + error.message);
  }
});

exports.aiManager = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Trebuie să fii autentificat');
  }

  const { action, message, imageUrls, userContext } = data;

  try {
    if (action === 'validate_image') {
      // Mock validation pentru imagini
      return {
        success: true,
        validation: {
          isValid: true,
          confidence: 0.95,
          extractedData: {
            type: 'document',
            message: 'Document validat cu succes'
          }
        }
      };
    }

    return {
      success: false,
      error: 'Action not supported'
    };
  } catch (error) {
    console.error('AI Manager error:', error);
    throw new functions.https.HttpsError('internal', 'Eroare la procesare');
  }
});

// Keep 1st Gen - works with existing deployment
exports.whatsapp = functions.https.onRequest(app);
