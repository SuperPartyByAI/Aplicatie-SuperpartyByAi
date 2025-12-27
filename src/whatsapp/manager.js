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
    this.messageQueue = [];
    this.processing = false;
    
    this.ensureSessionsDir();
    this.startMessageProcessor();
  }
  
  startMessageProcessor() {
    // Process queued messages every 100ms to handle high traffic
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
      const contactName = message._data?.notifyName || message.from.split('@')[0];
      
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
          contactName: contactName
        }
      });
    } catch (error) {
      console.error(`❌ [${accountId}] Error processing queued message:`, error);
    } finally {
      this.processing = false;
    }
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

    // Use system Chromium on Railway (Nixpacks installs it)
    if (process.env.RAILWAY_ENVIRONMENT || process.env.NIXPACKS_METADATA) {
      // Nixpacks puts chromium in PATH, so we can use 'chromium' directly
      puppeteerConfig.executablePath = 'chromium';
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
      
      // Auto-reconnect after 5 seconds
      setTimeout(async () => {
        if (this.clients.has(accountId)) {
          console.log(`🔄 [${accountId}] Attempting auto-reconnect...`);
          try {
            await client.initialize();
          } catch (error) {
            console.error(`❌ [${accountId}] Auto-reconnect failed:`, error);
          }
        }
      }, 5000);
    });

    client.on('message', (message) => {
      console.log(`💬 [${accountId}] Message received - queued (${this.messageQueue.length} in queue)`);
      
      // Add to queue instead of processing immediately
      this.messageQueue.push({ accountId, message });
      
      // Prevent queue from growing too large
      if (this.messageQueue.length > 1000) {
        console.warn(`⚠️ Message queue too large (${this.messageQueue.length}), dropping oldest messages`);
        this.messageQueue = this.messageQueue.slice(-500);
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
        // Check if client is ready
        const account = this.accounts.get(accountId);
        if (!account || account.status !== 'connected') {
          console.log(`⏭️ [${accountId}] Skipping - not connected (${account?.status})`);
          continue;
        }
        
        const chats = await Promise.race([
          client.getChats(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);
        
        for (const chat of chats) {
          try {
            if (!chat.isGroup) {
              // Avoid getContact() which causes errors - use chat data directly
              allClients.push({
                id: chat.id._serialized,
                accountId,
                name: chat.name || chat.id.user || 'Unknown',
                phone: chat.id.user,
                status: 'available',
                unreadCount: chat.unreadCount || 0,
                lastMessage: chat.timestamp || Date.now(),
                lastMessageText: chat.lastMessage?.body || ''
              });
            }
          } catch (chatError) {
            console.error(`❌ [${accountId}] Failed to process chat ${chat.id._serialized}:`, chatError.message);
          }
        }
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to get chats:`, error.message);
      }
    }
    
    return allClients;
  }

  async getClientMessages(clientId) {
    for (const [accountId, client] of this.clients.entries()) {
      try {
        const account = this.accounts.get(accountId);
        if (!account || account.status !== 'connected') continue;
        
        const chat = await Promise.race([
          client.getChatById(clientId),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        
        const messages = await Promise.race([
          chat.fetchMessages({ limit: 100 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);
        
        return messages.map(msg => ({
          id: msg.id._serialized,
          text: msg.body || '',
          fromClient: !msg.fromMe,
          timestamp: msg.timestamp * 1000
        }));
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to get messages for ${clientId}:`, error.message);
        continue;
      }
    }
    
    throw new Error('Client not found or no connected accounts');
  }

  async sendClientMessage(clientId, message) {
    for (const [accountId, client] of this.clients.entries()) {
      try {
        const account = this.accounts.get(accountId);
        if (!account || account.status !== 'connected') continue;
        
        await Promise.race([
          client.sendMessage(clientId, message),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);
        
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
    // Store client status in memory or database
    // For now, just emit event
    this.io.emit('client:status_updated', { clientId, status });
    return { success: true };
  }
}

module.exports = WhatsAppManager;
