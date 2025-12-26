const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

class WhatsAppManager {
  constructor() {
    this.clients = new Map(); // accountId -> Client
    this.accounts = new Map(); // accountId -> account data
    this.sessionsPath = path.join(process.cwd(), '.wwebjs_auth');
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
      phone: null
    };

    this.accounts.set(accountId, account);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: accountId,
        dataPath: this.sessionsPath
      }),
      puppeteer: {
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
      }
    });

    this.setupClientEvents(accountId, client);
    this.clients.set(accountId, client);

    try {
      await client.initialize();
      console.log(`✅ Client initialized: ${accountId}`);
      return account;
    } catch (error) {
      console.error(`❌ Failed to initialize ${accountId}:`, error);
      this.clients.delete(accountId);
      this.accounts.delete(accountId);
      throw error;
    }
  }

  setupClientEvents(accountId, client) {
    client.on('qr', async (qr) => {
      console.log(`📱 QR Code for ${accountId}`);
      try {
        const qrCodeDataUrl = await QRCode.toDataURL(qr);
        const account = this.accounts.get(accountId);
        if (account) {
          account.qrCode = qrCodeDataUrl;
          account.status = 'qr_ready';
        }
        
        // Send to renderer
        if (global.mainWindow) {
          global.mainWindow.webContents.send('qr-code', {
            accountId,
            qrCode: qrCodeDataUrl
          });
        }
      } catch (error) {
        console.error('QR Code generation failed:', error);
      }
    });

    client.on('ready', () => {
      console.log(`✅ Client ready: ${accountId}`);
      const account = this.accounts.get(accountId);
      if (account) {
        account.status = 'connected';
        account.qrCode = null;
        account.phone = client.info?.wid?.user || null;
      }
      
      if (global.mainWindow) {
        global.mainWindow.webContents.send('account-ready', {
          accountId,
          phone: client.info?.wid?.user
        });
      }
    });

    client.on('authenticated', () => {
      console.log(`🔐 Authenticated: ${accountId}`);
    });

    client.on('auth_failure', (error) => {
      console.error(`❌ Auth failed: ${accountId}`, error);
      const account = this.accounts.get(accountId);
      if (account) {
        account.status = 'auth_failed';
      }
    });

    client.on('disconnected', (reason) => {
      console.log(`🔌 Disconnected: ${accountId}`, reason);
      const account = this.accounts.get(accountId);
      if (account) {
        account.status = 'disconnected';
      }
    });

    client.on('message', async (message) => {
      console.log(`💬 Message on ${accountId}`);
      
      if (global.mainWindow) {
        global.mainWindow.webContents.send('new-message', {
          accountId,
          message: {
            id: message.id._serialized,
            from: message.from,
            to: message.to,
            body: message.body,
            timestamp: message.timestamp,
            fromMe: message.fromMe
          }
        });
      }
    });
  }

  async removeAccount(accountId) {
    const client = this.clients.get(accountId);
    if (client) {
      try {
        await client.destroy();
        this.clients.delete(accountId);
        this.accounts.delete(accountId);
        
        // Clean up session
        const sessionPath = path.join(this.sessionsPath, `session-${accountId}`);
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        
        console.log(`🗑️ Account removed: ${accountId}`);
        return { success: true };
      } catch (error) {
        console.error(`Failed to remove ${accountId}:`, error);
        throw error;
      }
    }
    throw new Error('Account not found');
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
        timestamp: chat.timestamp
      }));
    } catch (error) {
      console.error(`Failed to get chats for ${accountId}:`, error);
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
        fromMe: msg.fromMe
      }));
    } catch (error) {
      console.error(`Failed to get messages for ${accountId}:`, error);
      throw error;
    }
  }

  async sendMessage(accountId, chatId, message) {
    const client = this.clients.get(accountId);
    if (!client) throw new Error('Account not found');

    try {
      await client.sendMessage(chatId, message);
      console.log(`📤 Message sent from ${accountId}`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to send message from ${accountId}:`, error);
      throw error;
    }
  }

  async destroy() {
    for (const [accountId, client] of this.clients.entries()) {
      try {
        await client.destroy();
        console.log(`Destroyed: ${accountId}`);
      } catch (error) {
        console.error(`Failed to destroy ${accountId}:`, error);
      }
    }
    this.clients.clear();
    this.accounts.clear();
  }
}

module.exports = WhatsAppManager;
