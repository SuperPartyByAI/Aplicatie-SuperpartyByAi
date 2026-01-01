// Message Store - Salvează toate mesajele WhatsApp în Firestore
const firestore = require('../firebase/firestore');

class MessageStore {
  constructor() {
    this.db = null;
  }

  async initialize() {
    if (!firestore.db) {
      await firestore.initialize();
    }
    this.db = firestore.db;
  }

  /**
   * Salvează mesaj în Firestore
   * @param {string} accountId
   * @param {object} message - Baileys message object
   */
  async saveMessage(accountId, message) {
    try {
      if (!this.db) await this.initialize();

      const messageData = {
        accountId,
        messageId: message.key.id,
        from: message.key.remoteJid,
        fromMe: message.key.fromMe,
        timestamp: message.messageTimestamp || Date.now(),
        text:
          message.message?.conversation ||
          message.message?.extendedTextMessage?.text ||
          '[Media/Other]',
        type: this.getMessageType(message),
        raw: message, // Save full message for reference
        savedAt: firestore.admin.firestore.FieldValue.serverTimestamp(),
      };

      await this.db.collection('whatsapp_messages').add(messageData);

      console.log(`💾 [${accountId}] Message saved: ${messageData.text.substring(0, 50)}`);
      return true;
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to save message:`, error.message);
      return false;
    }
  }

  /**
   * Obține mesaje pentru un account
   * @param {string} accountId
   * @param {number} limit
   */
  async getMessages(accountId, limit = 50) {
    try {
      if (!this.db) await this.initialize();

      const snapshot = await this.db
        .collection('whatsapp_messages')
        .where('accountId', '==', accountId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const messages = [];
      snapshot.forEach(doc => {
        messages.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      return messages;
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to get messages:`, error.message);
      return [];
    }
  }

  /**
   * Obține conversații (grupate pe contact)
   * @param {string} accountId
   */
  async getConversations(accountId) {
    try {
      if (!this.db) await this.initialize();

      const snapshot = await this.db
        .collection('whatsapp_messages')
        .where('accountId', '==', accountId)
        .orderBy('timestamp', 'desc')
        .limit(1000)
        .get();

      const conversations = new Map();

      snapshot.forEach(doc => {
        const msg = doc.data();
        const contact = msg.from;

        if (!conversations.has(contact)) {
          conversations.set(contact, {
            contact,
            lastMessage: msg.text,
            lastTimestamp: msg.timestamp,
            unread: !msg.fromMe ? 1 : 0,
            messages: [],
          });
        }

        conversations.get(contact).messages.push(msg);
      });

      return Array.from(conversations.values());
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to get conversations:`, error.message);
      return [];
    }
  }

  /**
   * Determină tipul mesajului
   */
  getMessageType(message) {
    if (message.message?.conversation) return 'text';
    if (message.message?.extendedTextMessage) return 'text';
    if (message.message?.imageMessage) return 'image';
    if (message.message?.videoMessage) return 'video';
    if (message.message?.audioMessage) return 'audio';
    if (message.message?.documentMessage) return 'document';
    return 'other';
  }
}

module.exports = new MessageStore();
