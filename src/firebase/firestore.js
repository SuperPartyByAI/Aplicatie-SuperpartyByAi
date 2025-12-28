const admin = require('firebase-admin');

class FirestoreService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;

    try {
      // Initialize with service account from environment or file
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } else {
        console.log('⚠️ No Firebase credentials - running without persistence');
        return;
      }

      this.db = admin.firestore();
      this.initialized = true;
      console.log('✅ Firebase initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Firebase:', error.message);
    }
  }

  async saveMessage(accountId, chatId, message) {
    if (!this.db) return;

    try {
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
      
      // Update chat metadata
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
}

module.exports = new FirestoreService();
