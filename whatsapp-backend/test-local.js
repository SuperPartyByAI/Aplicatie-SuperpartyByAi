// Quick test without Firestore
const express = require('express');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;

app.use(express.json());

const connections = new Map();
const authDir = path.join(__dirname, '.baileys_auth');

if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

console.log('🚀 Test Server v2.0.0 (No Firestore)');

async function createConnection(accountId, name, phone) {
  console.log(`\n🔌 [${accountId}] Creating connection...`);
  
  const sessionPath = path.join(authDir, accountId);
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  const { version } = await fetchLatestBaileysVersion();
  console.log(`✅ [${accountId}] Baileys version: ${version.join('.')}`);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['SuperParty', 'Chrome', '2.0.0'],
    version
  });

  const account = {
    id: accountId,
    name,
    phone,
    status: 'connecting',
    qrCode: null,
    sock,
    createdAt: new Date().toISOString()
  };

  connections.set(accountId, account);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;
    
    if (qr) {
      console.log(`📱 [${accountId}] QR generated`);
      const qrDataURL = await QRCode.toDataURL(qr);
      account.qrCode = qrDataURL;
      account.status = 'qr_ready';
      console.log(`✅ [${accountId}] QR ready (${qrDataURL.length} chars)`);
    }

    if (connection === 'open') {
      console.log(`✅ [${accountId}] CONNECTED!`);
      account.status = 'connected';
      account.phone = sock.user?.id?.split(':')[0] || phone;
    }

    if (connection === 'close') {
      console.log(`🔌 [${accountId}] Connection closed`);
      account.status = 'disconnected';
    }
  });

  sock.ev.on('creds.update', saveCreds);

  return account;
}

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'SuperParty WhatsApp Backend',
    version: '2.0.0',
    accounts: connections.size,
    maxAccounts: 18,
    firestore: 'disabled (test mode)',
    endpoints: [
      'GET /',
      'GET /health',
      'GET /api/whatsapp/accounts',
      'POST /api/whatsapp/add-account'
    ]
  });
});

app.get('/health', (req, res) => {
  const connected = Array.from(connections.values()).filter(c => c.status === 'connected').length;
  res.json({
    status: 'healthy',
    accounts: {
      total: connections.size,
      connected
    }
  });
});

app.get('/api/whatsapp/accounts', (req, res) => {
  const accounts = [];
  connections.forEach((conn, id) => {
    accounts.push({
      id,
      name: conn.name,
      phone: conn.phone,
      status: conn.status,
      qrCode: conn.qrCode,
      createdAt: conn.createdAt
    });
  });
  res.json({ success: true, accounts });
});

app.post('/api/whatsapp/add-account', async (req, res) => {
  try {
    const { name, phone } = req.body;
    
    if (connections.size >= 18) {
      return res.status(400).json({ success: false, error: 'Max 18 accounts' });
    }
    
    const accountId = `account_${Date.now()}`;
    
    createConnection(accountId, name, phone).catch(err => {
      console.error(`❌ [${accountId}] Failed:`, err.message);
    });
    
    res.json({ 
      success: true, 
      account: {
        id: accountId,
        name,
        phone,
        status: 'connecting',
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}\n`);
});
