const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

class WhatsAppManager {
  constructor(io) {
    this.io = io;
    this.clients = new Map();
    this.accounts = new Map();
    this.sessionsPath = path.join(__dirname, '../../.wwebjs_auth');
    this.maxAccounts = 20;
    
    this.ensureSessionsDir();
  }

  ensureSessionsDir() {
    if (!fs.existsSync(this.sessionsPath)) {
      fs.mkdirSync(this.sessionsPath, { recursive: true });
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

    const puppeteerConfig = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    };

    // Use system Chromium on Railway
    if (process.env.RAILWAY_ENVIRONMENT) {
      puppeteerConfig.executablePath = '/usr/bin/chromium';
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: accountId,
        dataPath: this.sessionsPath
      }),
      puppeteer: puppeteerConfig
    });

    this.setupClientEvents(accountId, client);
    this.clients.set(accountId, client);

    try {
      await client.initialize();
      console.log(`✅ [${accountId}] Client initialized`);
      return account;
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to initialize:`, error);
      this.clients.delete(accountId);
      this.accounts.delete(accountId);
      throw error;
    }
  }

  setupClientEvents(accountId, client) {
    client.on('qr', async (qr) => {
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
    });

    client.on('ready', () => {
      console.log(`✅ [${accountId}] Client ready`);
      const account = this.accounts.get(accountId);
      if (account) {
        account.status = 'connected';
        account.qrCode = null;
        account.phone = client.info?.wid?.user || null;
      }
      
      this.io.emit('whatsapp:ready', {
        accountId,
        phone: client.info?.wid?.user,
        info: client.info
      });
    });

    client.on('authenticated', () => {
      console.log(`🔐 [${accountId}] Authenticated`);
      this.io.emit('whatsapp:authenticated', { accountId });
    });

    client.on('auth_failure', (error) => {
      console.error(`❌ [${accountId}] Auth failed:`, error);
      const account = this.accounts.get(accountId);
      if (account) {
        account.status = 'auth_failed';
      }
      this.io.emit('whatsapp:auth_failure', { accountId, error: error.message });
    });

    client.on('disconnected', (reason) => {
      console.log(`🔌 [${accountId}] Disconnected:`, reason);
      const account = this.accounts.get(accountId);
      if (account) {
        account.status = 'disconnected';
      }
      this.io.emit('whatsapp:disconnected', { accountId, reason });
    });

    client.on('message', async (message) => {
      console.log(`💬 [${accountId}] Message received`);
      
      try {
        const contact = await message.getContact();
        
        this.io.emit('whatsapp:message', {
          accountId,
          message: {
            id: message.id._serialized,
            from: message.from,
            to: message.to,
            body: message.body,
            timestamp: message.timestamp,
            fromMe: message.fromMe,
            hasMedia: message.hasMedia,
            contactName: contact.pushname || contact.number
          }
        });
      } catch (error) {
        console.error(`❌ [${accountId}] Error processing message:`, error);
      }
    });
  }

  async removeAccount(accountId) {
    const client = this.clients.get(accountId);
    if (!client) {
      throw new Error('Account not found');
    }

    try {
      await client.destroy();
      this.clients.delete(accountId);
      this.accounts.delete(accountId);
      
      const sessionPath = path.join(this.sessionsPath, `session-${accountId}`);
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
    const client = this.clients.get(accountId);
    if (!client) throw new Error('Account not found');

    try {
      const chats = await client.getChats();
      return chats.map(chat => ({
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
        timestamp: chat.timestamp,
        lastMessage: chat.lastMessage ? {
          body: chat.lastMessage.body,
          timestamp: chat.lastMessage.timestamp
        } : null
      }));
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to get chats:`, error);
      throw error;
    }
  }

  async getMessages(accountId, chatId, limit = 50) {
    const client = this.clients.get(accountId);
    if (!client) throw new Error('Account not found');

    try {
      const chat = await client.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit });
      
      return messages.map(msg => ({
        id: msg.id._serialized,
        from: msg.from,
        to: msg.to,
        body: msg.body,
        timestamp: msg.timestamp,
        fromMe: msg.fromMe,
        hasMedia: msg.hasMedia
      }));
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to get messages:`, error);
      throw error;
    }
  }

  async sendMessage(accountId, chatId, message) {
    const client = this.clients.get(accountId);
    if (!client) throw new Error('Account not found');

    try {
      await client.sendMessage(chatId, message);
      console.log(`📤 [${accountId}] Message sent to ${chatId}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to send message:`, error);
      throw error;
    }
  }

  async destroy() {
    console.log('🛑 Destroying all WhatsApp clients...');
    for (const [accountId, client] of this.clients.entries()) {
      try {
        await client.destroy();
        console.log(`✅ [${accountId}] Destroyed`);
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to destroy:`, error);
      }
    }
    this.clients.clear();
    this.accounts.clear();
  }

  // Client management methods
  async getAllClients() {
    const allClients = [];
    
    for (const [accountId, client] of this.clients.entries()) {
      try {
        const chats = await client.getChats();
        
        for (const chat of chats) {
          if (!chat.isGroup) {
            const contact = await chat.getContact();
            allClients.push({
              id: chat.id._serialized,
              accountId,
              name: contact.pushname || contact.number || 'Unknown',
              phone: contact.number,
              status: 'available',
              unreadCount: chat.unreadCount,
              lastMessage: chat.timestamp,
              lastMessageText: chat.lastMessage?.body || ''
            });
          }
        }
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to get clients:`, error);
      }
    }
    
    return allClients;
  }

  async getClientMessages(clientId) {
    for (const [accountId, client] of this.clients.entries()) {
      try {
        const chat = await client.getChatById(clientId);
        const messages = await chat.fetchMessages({ limit: 100 });
        
        return messages.map(msg => ({
          id: msg.id._serialized,
          text: msg.body,
          fromClient: !msg.fromMe,
          timestamp: msg.timestamp * 1000
        }));
      } catch (error) {
        continue;
      }
    }
    
    throw new Error('Client not found');
  }

  async sendClientMessage(clientId, message) {
    for (const [accountId, client] of this.clients.entries()) {
      try {
        await client.sendMessage(clientId, message);
        
        return {
          id: `msg_${Date.now()}`,
          text: message,
          fromClient: false,
          timestamp: Date.now()
        };
      } catch (error) {
        continue;
      }
    }
    
    throw new Error('Failed to send message');
  }

  async updateClientStatus(clientId, status) {
    // Store client status in memory or database
    // For now, just emit event
    this.io.emit('client:status_updated', { clientId, status });
    return { success: true };
  }
}

module.exports = WhatsAppManager;
