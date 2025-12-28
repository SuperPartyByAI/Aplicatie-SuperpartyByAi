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

// Keep 1st Gen - works with existing deployment
exports.whatsapp = functions.https.onRequest(app);
