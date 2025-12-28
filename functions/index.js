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

app.post('/api/whatsapp/add-account', async (req, res) => {
  try {
    const { name, phone } = req.body;
    const account = await whatsappManager.addAccount(name, phone);
    res.json({ success: true, account });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// firebase-functions v5 syntax: options are passed directly to onRequest
exports.whatsapp = functions.https.onRequest(
  {
    memory: '2GiB',
    timeoutSeconds: 540,
    // Note: invoker: 'public' is not supported in v5, use IAM permissions instead
  },
  app
);
