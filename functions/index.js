const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

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
    // Aici ar trebui să fie integrarea cu OpenAI/GPT
    // Pentru moment, returnăm un răspuns mock
    const lastMessage = messages[messages.length - 1];
    
    let response = '';
    
    // Răspunsuri simple bazate pe context
    if (lastMessage.content.toLowerCase().includes('evenimente')) {
      response = `Ai ${userContext.stats?.evenimenteTotal || 0} evenimente în total. ${userContext.stats?.evenimenteAstazi || 0} sunt astăzi.`;
    } else if (lastMessage.content.toLowerCase().includes('staff')) {
      response = `Ai ${userContext.stats?.staffTotal || 0} membri de staff aprobați.`;
    } else if (lastMessage.content.toLowerCase().includes('kyc')) {
      response = userContext.isAdmin 
        ? `Ai ${userContext.stats?.kycPending || 0} cereri KYC în așteptare.`
        : 'Doar administratorul poate vedea cererile KYC.';
    } else {
      response = `Bună ${userContext.user?.nume || 'User'}! Sunt asistentul tău AI. Cum te pot ajuta astăzi?`;
    }

    // Salvează conversația în Firestore
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    
    await admin.firestore().collection('aiConversations').add({
      userId: context.auth.uid,
      userEmail: context.auth.token.email,
      userName: userContext.user?.nume || 'Unknown',
      userMessage: lastMessage.content,
      aiResponse: response,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      model: 'mock-gpt-4o-mini'
    });

    return {
      success: true,
      message: response
    };
  } catch (error) {
    console.error('Chat AI error:', error);
    throw new functions.https.HttpsError('internal', 'Eroare la procesarea mesajului');
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
