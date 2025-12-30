const admin = require('firebase-admin');

class FirestoreService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;

    try {
      // Use already initialized admin instance
      this.db = admin.firestore();
      this.initialized = true;
      console.log('✅ Firestore initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Firestore:', error.message);
    }
  }
  
  get admin() {
    return admin;
  }

  async saveMessage(accountId, chatId, message) {
    if (!this.db) return;

    try {
      // Save to nested structure (legacy)
      await this.db
        .collection('accounts')
        .doc(accountId)
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .doc(message.id)
        .set({
          ...message,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      
      // Update chat metadata (legacy)
      await this.db
        .collection('accounts')
        .doc(accountId)
        .collection('chats')
        .doc(chatId)
        .set({
          lastMessage: message.body,
          lastMessageTimestamp: message.timestamp,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

      // ALSO save to flat collections for frontend
      const threadId = `${accountId}_${chatId}`;
      
      // Save message to whatsapp_messages
      await this.db
        .collection('whatsapp_messages')
        .doc(message.id)
        .set({
          id: message.id,
          threadId: threadId,
          accountId: accountId,
          from: message.from || chatId,
          to: message.to || accountId,
          body: message.body || '',
          timestamp: message.timestamp || Date.now(),
          fromMe: message.fromMe || false,
          status: message.status || 'received',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      
      // Update thread in whatsapp_threads
      await this.db
        .collection('whatsapp_threads')
        .doc(threadId)
        .set({
          id: threadId,
          accountId: accountId,
          phoneNumber: chatId.replace('@s.whatsapp.net', ''),
          name: message.pushName || chatId.replace('@s.whatsapp.net', ''),
          lastMessageTime: message.timestamp || Date.now(),
          lastMessage: message.body || '',
          unreadCount: message.fromMe ? 0 : admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

    } catch (error) {
      console.error('❌ Failed to save message to Firestore:', error.message);
    }
  }

  async getMessages(accountId, chatId, limit = 100) {
    if (!this.db) return [];

    try {
      const snapshot = await this.db
        .collection('accounts')
        .doc(accountId)
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const messages = [];
      snapshot.forEach(doc => {
        messages.push(doc.data());
      });

      return messages.reverse(); // Return oldest first
    } catch (error) {
      console.error('❌ Failed to get messages from Firestore:', error.message);
      return [];
    }
  }

  async getChats(accountId) {
    if (!this.db) return [];

    try {
      const snapshot = await this.db
        .collection('accounts')
        .doc(accountId)
        .collection('chats')
        .orderBy('updatedAt', 'desc')
        .get();

      const chats = [];
      snapshot.forEach(doc => {
        chats.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return chats;
    } catch (error) {
      console.error('❌ Failed to get chats from Firestore:', error.message);
      return [];
    }
  }

  async saveChat(accountId, chatId, chatData) {
    if (!this.db) return;

    try {
      await this.db
        .collection('accounts')
        .doc(accountId)
        .collection('chats')
        .doc(chatId)
        .set({
          ...chatData,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (error) {
      console.error('❌ Failed to save chat to Firestore:', error.message);
    }
  }

  /**
   * ÎMBUNĂTĂȚIRE: Check if message exists (deduplication)
   */
  async messageExists(accountId, chatId, messageId) {
    if (!this.db) return false;

    try {
      const doc = await this.db
        .collection('accounts')
        .doc(accountId)
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .doc(messageId)
        .get();

      return doc.exists;
    } catch (error) {
      console.error('❌ Failed to check message existence:', error.message);
      return false; // Assume doesn't exist on error
    }
  }

  /**
   * TIER 3: Save message batch (10x faster)
   */
  async saveBatch(messageBatch) {
    if (!this.db) return;

    try {
      const batch = this.db.batch();
      
      for (const item of messageBatch) {
        const { accountId, chatId, messageData, pushName } = item;
        
        // Message
        const messageRef = this.db
          .collection('accounts')
          .doc(accountId)
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .doc(messageData.id);
        
        batch.set(messageRef, {
          ...messageData,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Chat metadata
        const chatRef = this.db
          .collection('accounts')
          .doc(accountId)
          .collection('chats')
          .doc(chatId);
        
        batch.set(chatRef, {
          name: pushName || chatId.split('@')[0],
          lastMessage: messageData.body,
          lastMessageTimestamp: messageData.timestamp,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      
      await batch.commit();
    } catch (error) {
      console.error('❌ Failed to save batch to Firestore:', error.message);
      throw error;
    }
  }

  /**
   * TIER 3: Save message queue
   */
  async saveQueue(queueId, queue) {
    if (!this.db) return;

    try {
      await this.db
        .collection('message_queues')
        .doc(queueId)
        .set({
          queue: queue,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
      console.error('❌ Failed to save queue to Firestore:', error.message);
    }
  }

  /**
   * TIER 3: Get message queue
   */
  async getQueue(queueId) {
    if (!this.db) return [];

    try {
      const doc = await this.db
        .collection('message_queues')
        .doc(queueId)
        .get();

      if (doc.exists) {
        return doc.data().queue || [];
      }
      return [];
    } catch (error) {
      console.error('❌ Failed to get queue from Firestore:', error.message);
      return [];
    }
  }

  /**
   * TIER 3: Log event for monitoring
   */
  async logEvent(event) {
    if (!this.db) return;

    try {
      await this.db
        .collection('monitoring_events')
        .add({
          ...event,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
      // Silent fail - don't crash on logging errors
    }
  }

  /**
   * TIER 3: Get monitoring events
   */
  async getEvents(limit = 100) {
    if (!this.db) return [];

    try {
      const snapshot = await this.db
        .collection('monitoring_events')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const events = [];
      snapshot.forEach(doc => {
        events.push({ id: doc.id, ...doc.data() });
      });

      return events;
    } catch (error) {
      console.error('❌ Failed to get events from Firestore:', error.message);
      return [];
    }
  }
}

module.exports = new FirestoreService();
