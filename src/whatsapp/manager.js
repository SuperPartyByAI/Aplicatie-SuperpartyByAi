const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const firestore = require('../firebase/firestore');
const sessionStore = require('./session-store');

class WhatsAppManager {
  constructor(io) {
    this.io = io;
    this.clients = new Map();
    this.accounts = new Map();
    this.chatsCache = new Map(); // Manual cache for chats
    this.messagesCache = new Map(); // Manual cache for messages per chat
    this.sessionsPath = path.join(__dirname, '../../.baileys_auth');
    this.maxAccounts = 20;
    this.messageQueue = [];
    this.processing = false;
    this.retryCount = new Map(); // Track retry attempts per account
    this.lastMessageTime = new Map(); // Track last message received per account
    this.healthCheckInterval = null;
    
    this.ensureSessionsDir();
    this.startMessageProcessor();
    this.startKeepAlive();
    this.startHealthCheck();
    
    // Initialize Firebase
    firestore.initialize();
    
    // Auto-restore sessions after Railway restart
    this.autoRestoreSessions();
  }
  
  /**
   * Health check - detectează proactiv probleme
   */
  startHealthCheck() {
    // Check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      for (const [accountId, sock] of this.clients.entries()) {
        const lastMsg = this.lastMessageTime.get(accountId) || Date.now();
        const timeSinceLastMsg = Date.now() - lastMsg;
        
        // Dacă nu am primit mesaje în 2 minute, verifică conexiunea
        if (timeSinceLastMsg > 120000) {
          console.log(`[Health Check] Account ${accountId} - no activity for 2 min, checking...`);
          
          // Încearcă să trimită presence
          try {
            sock.sendPresenceUpdate('available');
            this.lastMessageTime.set(accountId, Date.now());
          } catch (error) {
            console.log(`[Health Check] Account ${accountId} - connection dead, reconnecting...`);
            this.reconnectAccount(accountId);
          }
        }
      }
    }, 30000);
  }
  
  async autoRestoreSessions() {
    try {
      console.log('🔄 Checking for saved sessions in Firestore...');
      const sessions = await sessionStore.listSessions();
      
      if (sessions.length === 0) {
        console.log('ℹ️ No saved sessions found');
        return;
      }
      
      console.log(`📦 Found ${sessions.length} saved session(s), restoring...`);
      
      for (const session of sessions) {
        const accountId = session.accountId;
        const phoneNumber = session.creds?.me?.id?.split(':')[0] || session.metadata?.phone || null;
        
        console.log(`🔄 Restoring account: ${accountId} (${phoneNumber || 'unknown'})`);
        
        // Restore account cu metadata salvată
        const account = {
          id: accountId,
          name: session.metadata?.name || `WhatsApp ${accountId}`,
          status: 'connecting',
          qrCode: null,
          pairingCode: null,
          phone: phoneNumber,
          createdAt: session.metadata?.createdAt || session.updatedAt || new Date().toISOString()
        };
        
        this.accounts.set(accountId, account);
        
        // Connect with restored session
        await this.connectBaileys(accountId, phoneNumber);
      }
      
      console.log(`✅ Auto-restore complete: ${sessions.length} account(s) restored`);
    } catch (error) {
      console.error('❌ Auto-restore failed:', error.message);
    }
  }
  
  startKeepAlive() {
    // Send keep-alive every 15 seconds (mai agresiv pentru stabilitate maximă)
    setInterval(() => {
      this.clients.forEach((sock, accountId) => {
        if (sock.user) {
          // Connection is active, send presence update
          sock.sendPresenceUpdate('available').catch(err => {
            console.log(`⚠️ [${accountId}] Keep-alive failed:`, err.message);
            // Dacă keep-alive eșuează, reconnect
            this.reconnectAccount(accountId);
          });
          // Update last activity time
          this.lastMessageTime.set(accountId, Date.now());
        }
      });
    }, 15000); // 15 secunde în loc de 30
  }
  
  /**
   * Reconnect account cu exponential backoff
   */
  async reconnectAccount(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return;
    
    // Get retry count
    const retries = this.retryCount.get(accountId) || 0;
    this.retryCount.set(accountId, retries + 1);
    
    // Exponential backoff: 2s, 4s, 8s, 16s, max 60s
    const backoff = Math.min(2000 * Math.pow(2, retries), 60000);
    
    console.log(`🔄 [${accountId}] Reconnecting in ${backoff/1000}s (attempt ${retries + 1})...`);
    
    // Disconnect old socket
    const oldSock = this.clients.get(accountId);
    if (oldSock) {
      try {
        await oldSock.logout();
      } catch (e) {}
      this.clients.delete(accountId);
    }
    
    // Wait backoff time
    await new Promise(resolve => setTimeout(resolve, backoff));
    
    // Reconnect
    try {
      await this.connectBaileys(accountId, account.phoneNumber);
      // Reset retry count on success
      this.retryCount.set(accountId, 0);
      console.log(`✅ [${accountId}] Reconnected successfully`);
    } catch (error) {
      console.error(`❌ [${accountId}] Reconnect failed:`, error.message);
      // Retry again
      if (retries < 10) {
        this.reconnectAccount(accountId);
      }
    }
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
      
      const messageData = {
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
      };
      
      console.log(`📤 [${accountId}] Emitting whatsapp:message:`, messageData.message.body);
      this.io.emit('whatsapp:message', messageData);
    } catch (error) {
      console.error(`❌ [${accountId}] Error processing queued message:`, error);
    } finally {
      this.processing = false;
    }
  }

  async addAccount(accountName, phoneNumber = null) {
    if (this.accounts.size >= this.maxAccounts) {
      throw new Error(`Maximum ${this.maxAccounts} accounts reached`);
    }

    const accountId = `account_${Date.now()}`;
    const account = {
      id: accountId,
      name: accountName || `WhatsApp ${this.accounts.size + 1}`,
      status: 'connecting',
      qrCode: null,
      pairingCode: null,
      phone: phoneNumber,
      createdAt: new Date().toISOString()
    };

    this.accounts.set(accountId, account);

    try {
      await this.connectBaileys(accountId, phoneNumber);
      console.log(`✅ [${accountId}] Client initialized`);
      return account;
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to initialize:`, error);
      this.clients.delete(accountId);
      this.accounts.delete(accountId);
      throw error;
    }
  }

  async connectBaileys(accountId, phoneNumber = null) {
    const sessionPath = path.join(this.sessionsPath, accountId);
    
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    // Try to restore session from Firestore
    const restored = await sessionStore.restoreSession(accountId, sessionPath);
    if (restored) {
      console.log(`✅ [${accountId}] Session restored from Firestore`);
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
    this.chatsCache.set(accountId, new Map()); // Initialize chat cache for this account
    this.messagesCache.set(accountId, new Map()); // Initialize messages cache for this account
    this.setupBaileysEvents(accountId, sock, saveCreds, phoneNumber);
  }

  setupBaileysEvents(accountId, sock, saveCreds, phoneNumber = null) {
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
          
          // If phone number provided, also request pairing code
          if (phoneNumber) {
            try {
              console.log(`🔢 [${accountId}] Requesting pairing code for ${phoneNumber}...`);
              const code = await sock.requestPairingCode(phoneNumber);
              console.log(`🔢 [${accountId}] Pairing code: ${code}`);
              
              if (account) {
                account.pairingCode = code;
              }
              
              this.io.emit('whatsapp:pairing_code', { accountId, code });
            } catch (error) {
              console.error(`❌ [${accountId}] Failed to get pairing code:`, error.message);
              console.error(error);
            }
          } else {
            console.log(`⏭️ [${accountId}] No phone number provided, skipping pairing code`);
          }
        } catch (error) {
          console.error(`❌ [${accountId}] QR generation failed:`, error);
        }
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        const reason = lastDisconnect?.error?.output?.statusCode || 'unknown';
        console.log(`🔌 [${accountId}] Connection closed. Reason: ${reason}, Reconnect: ${shouldReconnect}`);
        
        const account = this.accounts.get(accountId);
        if (account) {
          account.status = shouldReconnect ? 'reconnecting' : 'disconnected';
          
          // Salvează status în Firestore (păstrează accountul în listă)
          const sessionPath = path.join(this.sessionsPath, accountId);
          sessionStore.saveSession(accountId, sessionPath, account).catch(err => {
            console.error(`❌ [${accountId}] Failed to save status:`, err.message);
          });
        }
        
        this.io.emit('whatsapp:disconnected', { accountId, reason: lastDisconnect?.error?.message });
        
        if (shouldReconnect) {
          setTimeout(() => {
            if (this.accounts.has(accountId)) {
              console.log(`🔄 [${accountId}] Auto-reconnecting...`);
              // Use saved phone number from account
              const savedPhone = account?.phone;
              this.connectBaileys(accountId, savedPhone);
            }
          }, 5000);
        } else {
          console.log(`❌ [${accountId}] Logged out - not reconnecting. Please re-add account.`);
          // Chiar și la logout, păstrează în listă cu status 'logged_out'
          if (account) {
            account.status = 'logged_out';
          }
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
        
        // Save session + metadata to Firestore for persistence
        const sessionPath = path.join(this.sessionsPath, accountId);
        sessionStore.saveSession(accountId, sessionPath, account).catch(err => {
          console.error(`❌ [${accountId}] Failed to save session:`, err.message);
        });
        
        this.io.emit('whatsapp:ready', {
          accountId,
          phone: sock.user?.id?.split(':')[0],
          info: sock.user
        });
      }
    });

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      // Also save to Firestore for persistence across restarts
      const sessionPath = path.join(this.sessionsPath, accountId);
      const account = this.accounts.get(accountId);
      sessionStore.saveSession(accountId, sessionPath, account).catch(err => {
        console.error(`❌ [${accountId}] Failed to save session on creds update:`, err.message);
      });
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      
      for (const message of messages) {
        if (!message.message) continue;
        
        console.log(`💬 [${accountId}] Message received - queued (${this.messageQueue.length} in queue)`);
        
        // Add to message queue
        this.messageQueue.push({ accountId, message });
        
        // Update chat cache
        const chatId = message.key.remoteJid;
        const chats = this.chatsCache.get(accountId);
        if (chats && chatId && !chatId.includes('@g.us')) {
          chats.set(chatId, {
            id: chatId,
            name: message.pushName || chatId.split('@')[0],
            lastMessage: message.messageTimestamp,
            unreadCount: message.key.fromMe ? 0 : 1
          });
        }
        
        // Update messages cache
        const messagesMap = this.messagesCache.get(accountId);
        const messageData = {
          id: message.key.id,
          from: chatId,
          to: chatId,
          body: message.message?.conversation || message.message?.extendedTextMessage?.text || '',
          timestamp: message.messageTimestamp,
          fromMe: message.key.fromMe,
          hasMedia: !!message.message?.imageMessage || !!message.message?.videoMessage
        };
        
        if (messagesMap && chatId) {
          if (!messagesMap.has(chatId)) {
            messagesMap.set(chatId, []);
          }
          const chatMessages = messagesMap.get(chatId);
          chatMessages.push(messageData);
          
          // Keep only last 100 messages per chat
          if (chatMessages.length > 100) {
            messagesMap.set(chatId, chatMessages.slice(-100));
          }
        }
        
        // Save to Firestore
        await firestore.saveMessage(accountId, chatId, messageData);
        await firestore.saveChat(accountId, chatId, {
          name: message.pushName || chatId.split('@')[0],
          lastMessage: messageData.body,
          lastMessageTimestamp: messageData.timestamp
        });
        
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
      
      // Delete local session
      const sessionPath = path.join(this.sessionsPath, accountId);
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }
      
      // Delete from Firestore
      await sessionStore.deleteSession(accountId);
      
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
      console.log(`📋 [${accountId}] Getting messages for ${chatId}...`);
      
      // Try Firestore first (persistent)
      const firestoreMessages = await firestore.getMessages(accountId, chatId, limit);
      if (firestoreMessages.length > 0) {
        console.log(`✅ [${accountId}] Returning ${firestoreMessages.length} messages from Firestore`);
        return firestoreMessages;
      }
      
      // Fallback to cache
      const messagesMap = this.messagesCache.get(accountId);
      if (!messagesMap) {
        console.log(`⚠️ [${accountId}] No messages found`);
        return [];
      }
      
      const messages = messagesMap.get(chatId) || [];
      console.log(`✅ [${accountId}] Returning ${messages.length} messages from cache`);
      
      return messages.slice(-limit);
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
          console.log(`⏭️ [${accountId}] Skipping - not connected (${account?.status})`);
          continue;
        }
        
        console.log(`📋 [${accountId}] Fetching chats from cache...`);
        
        // Get chats from manual cache
        const chats = this.chatsCache.get(accountId);
        if (!chats) {
          console.log(`⚠️ [${accountId}] No chat cache found`);
          continue;
        }
        
        console.log(`📋 [${accountId}] Found ${chats.size} chats in cache`);
        
        for (const [chatId, chat] of chats.entries()) {
          allClients.push({
            id: chatId,
            accountId,
            name: chat.name,
            phone: chatId.split('@')[0],
            status: 'available',
            unreadCount: chat.unreadCount || 0,
            lastMessage: chat.lastMessage || Date.now(),
            lastMessageText: ''
          });
        }
        
        console.log(`✅ [${accountId}] Returning ${allClients.length} clients`);
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
