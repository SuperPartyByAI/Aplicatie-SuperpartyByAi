const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');

class WhatsAppManager {
  constructor(io) {
    this.io = io;
    this.clients = new Map();
    this.accounts = new Map();
    this.sessionsPath = path.join(__dirname, '../../.baileys_auth');
    this.maxAccounts = 20;
    this.messageQueue = [];
    this.processing = false;
    
    this.ensureSessionsDir();
    this.startMessageProcessor();
  }
  
  ensureSessionsDir() {
    if (!fs.existsSync(this.sessionsPath)) {
      fs.mkdirSync(this.sessionsPath, { recursive: true });
    }
  }
  
  startMessageProcessor() {
    setInterval(() => {
      if (this.messageQueue.length > 0 && !this.processing) {
        this.processNextMessage();
      }
    }, 100);
  }
  
  async processNextMessage() {
    if (this.processing || this.messageQueue.length === 0) return;
    
    this.processing = true;
    const { accountId, message } = this.messageQueue.shift();
    
    try {
      const contactName = message.pushName || message.key.remoteJid.split('@')[0];
      
      this.io.emit('whatsapp:message', {
        accountId,
        message: {
          id: message.key.id,
          from: message.key.remoteJid,
          to: message.key.remoteJid,
          body: message.message?.conversation || message.message?.extendedTextMessage?.text || '',
          timestamp: message.messageTimestamp,
          fromMe: message.key.fromMe,
          hasMedia: !!message.message?.imageMessage || !!message.message?.videoMessage,
          contactName: contactName
        }
      });
    } catch (error) {
      console.error(`❌ [${accountId}] Error processing queued message:`, error);
    } finally {
      this.processing = false;
    }
  }

  async addAccount(accountName) {
    if (this.accounts.size >= this.maxAccounts) {
      throw new Error(`Maximum ${this.maxAccounts} accounts reached`);
    }

    const accountId = `account_${Date.now()}`;
    const account = {
      id: accountId,
      name: accountName || `WhatsApp ${this.accounts.size + 1}`,
      status: 'connecting',
      qrCode: null,
      phone: null,
      createdAt: new Date().toISOString()
    };

    this.accounts.set(accountId, account);

    try {
      await this.connectBaileys(accountId);
      console.log(`✅ [${accountId}] Client initialized`);
      return account;
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to initialize:`, error);
      this.clients.delete(accountId);
      this.accounts.delete(accountId);
      throw error;
    }
  }

  async connectBaileys(accountId) {
    const sessionPath = path.join(this.sessionsPath, accountId);
    
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['SuperParty', 'Chrome', '1.0.0']
    });

    this.clients.set(accountId, sock);
    this.setupBaileysEvents(accountId, sock, saveCreds);
  }

  setupBaileysEvents(accountId, sock, saveCreds) {
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log(`📱 [${accountId}] QR Code generated`);
        try {
          const qrCodeDataUrl = await QRCode.toDataURL(qr);
          const account = this.accounts.get(accountId);
          if (account) {
            account.qrCode = qrCodeDataUrl;
            account.status = 'qr_ready';
          }
          
          this.io.emit('whatsapp:qr', { accountId, qrCode: qrCodeDataUrl });
        } catch (error) {
          console.error(`❌ [${accountId}] QR generation failed:`, error);
        }
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`🔌 [${accountId}] Connection closed. Reconnect:`, shouldReconnect);
        
        const account = this.accounts.get(accountId);
        if (account) {
          account.status = 'disconnected';
        }
        
        this.io.emit('whatsapp:disconnected', { accountId, reason: lastDisconnect?.error?.message });
        
        if (shouldReconnect) {
          setTimeout(() => {
            if (this.accounts.has(accountId)) {
              console.log(`🔄 [${accountId}] Auto-reconnecting...`);
              this.connectBaileys(accountId);
            }
          }, 5000);
        }
      }

      if (connection === 'open') {
        console.log(`✅ [${accountId}] Connected`);
        const account = this.accounts.get(accountId);
        if (account) {
          account.status = 'connected';
          account.qrCode = null;
          account.phone = sock.user?.id?.split(':')[0] || null;
        }
        
        this.io.emit('whatsapp:ready', {
          accountId,
          phone: sock.user?.id?.split(':')[0],
          info: sock.user
        });
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      
      for (const message of messages) {
        if (!message.message) continue;
        
        console.log(`💬 [${accountId}] Message received - queued (${this.messageQueue.length} in queue)`);
        
        this.messageQueue.push({ accountId, message });
        
        if (this.messageQueue.length > 1000) {
          console.warn(`⚠️ Message queue too large (${this.messageQueue.length}), dropping oldest`);
          this.messageQueue = this.messageQueue.slice(-500);
        }
      }
    });
  }

  async removeAccount(accountId) {
    const sock = this.clients.get(accountId);
    if (!sock) {
      throw new Error('Account not found');
    }

    try {
      await sock.logout();
      this.clients.delete(accountId);
      this.accounts.delete(accountId);
      
      const sessionPath = path.join(this.sessionsPath, accountId);
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }
      
      this.io.emit('whatsapp:account_removed', { accountId });
      console.log(`🗑️ [${accountId}] Account removed`);
      return { success: true };
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to remove:`, error);
      throw error;
    }
  }

  getAccounts() {
    return Array.from(this.accounts.values());
  }

  async getChats(accountId) {
    const sock = this.clients.get(accountId);
    if (!sock) throw new Error('Account not found');

    try {
      const chats = await sock.groupFetchAllParticipating();
      const chatList = [];
      
      for (const [jid, chat] of Object.entries(chats)) {
        chatList.push({
          id: jid,
          name: chat.subject || jid.split('@')[0],
          isGroup: true,
          unreadCount: 0,
          timestamp: Date.now(),
          lastMessage: null
        });
      }
      
      return chatList;
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to get chats:`, error);
      return [];
    }
  }

  async getMessages(accountId, chatId, limit = 50) {
    const sock = this.clients.get(accountId);
    if (!sock) throw new Error('Account not found');

    try {
      const messages = await sock.fetchMessagesFromWA(chatId, limit);
      
      return messages.map(msg => ({
        id: msg.key.id,
        from: msg.key.remoteJid,
        to: msg.key.remoteJid,
        body: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
        timestamp: msg.messageTimestamp,
        fromMe: msg.key.fromMe,
        hasMedia: !!msg.message?.imageMessage || !!msg.message?.videoMessage
      }));
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to get messages:`, error);
      return [];
    }
  }

  async sendMessage(accountId, chatId, message) {
    const sock = this.clients.get(accountId);
    if (!sock) throw new Error('Account not found');

    try {
      await sock.sendMessage(chatId, { text: message });
      console.log(`📤 [${accountId}] Message sent to ${chatId}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to send message:`, error);
      throw error;
    }
  }

  async destroy() {
    console.log('🛑 Destroying all WhatsApp clients...');
    for (const [accountId, sock] of this.clients.entries()) {
      try {
        await sock.logout();
        console.log(`✅ [${accountId}] Destroyed`);
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to destroy:`, error);
      }
    }
    this.clients.clear();
    this.accounts.clear();
  }

  async getAllClients() {
    const allClients = [];
    
    for (const [accountId, sock] of this.clients.entries()) {
      try {
        const account = this.accounts.get(accountId);
        if (!account || account.status !== 'connected') {
          console.log(`⏭️ [${accountId}] Skipping - not connected`);
          continue;
        }
        
        const chats = await sock.groupFetchAllParticipating();
        
        for (const [jid, chat] of Object.entries(chats)) {
          if (!jid.includes('@g.us')) {
            allClients.push({
              id: jid,
              accountId,
              name: chat.subject || jid.split('@')[0],
              phone: jid.split('@')[0],
              status: 'available',
              unreadCount: 0,
              lastMessage: Date.now(),
              lastMessageText: ''
            });
          }
        }
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to get clients:`, error.message);
      }
    }
    
    return allClients;
  }

  async getClientMessages(clientId) {
    for (const [accountId, sock] of this.clients.entries()) {
      try {
        const account = this.accounts.get(accountId);
        if (!account || account.status !== 'connected') continue;
        
        const messages = await sock.fetchMessagesFromWA(clientId, 100);
        
        return messages.map(msg => ({
          id: msg.key.id,
          text: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
          fromClient: !msg.key.fromMe,
          timestamp: msg.messageTimestamp * 1000
        }));
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to get messages for ${clientId}:`, error.message);
        continue;
      }
    }
    
    throw new Error('Client not found or no connected accounts');
  }

  async sendClientMessage(clientId, message) {
    for (const [accountId, sock] of this.clients.entries()) {
      try {
        const account = this.accounts.get(accountId);
        if (!account || account.status !== 'connected') continue;
        
        await sock.sendMessage(clientId, { text: message });
        
        console.log(`📤 [${accountId}] Message sent to ${clientId}`);
        
        return {
          id: `msg_${Date.now()}`,
          text: message,
          fromClient: false,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to send to ${clientId}:`, error.message);
        continue;
      }
    }
    
    throw new Error('Failed to send message - no connected accounts available');
  }

  async updateClientStatus(clientId, status) {
    this.io.emit('client:status_updated', { clientId, status });
    return { success: true };
  }
}

module.exports = WhatsAppManager;
