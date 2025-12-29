// Message Queue - Outbox for messages during disconnect
const firestore = require('../firebase/firestore');

class MessageQueue {
  constructor() {
    this.db = null;
    this.flushLocks = new Map(); // Prevent concurrent flush per account
  }

  async initialize() {
    if (!firestore.db) {
      await firestore.initialize();
    }
    this.db = firestore.db;
  }

  /**
   * Queue message for later delivery
   */
  async queueMessage(accountId, to, message, metadata = {}) {
    try {
      if (!this.db) await this.initialize();

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const messageDoc = {
        messageId,
        accountId,
        to,
        message,
        status: 'queued',
        direction: metadata.direction || 'client_to_operator',
        threadId: metadata.threadId || to,
        createdAt: new Date().toISOString(),
        attempts: 0,
        lastAttemptAt: null,
        sentAt: null,
        deliveredAt: null,
        error: null,
        ...metadata
      };

      await this.db
        .collection('whatsapp_messages')
        .doc(messageId)
        .set(messageDoc);

      console.log(`📥 [Queue] Message queued: ${messageId} for ${accountId}`);
      return messageId;
    } catch (error) {
      console.error(`❌ [Queue] Failed to queue message:`, error.message);
      throw error;
    }
  }

  /**
   * Get queued messages for account
   */
  async getQueuedMessages(accountId, limit = 100) {
    try {
      if (!this.db) await this.initialize();

      const snapshot = await this.db
        .collection('whatsapp_messages')
        .where('accountId', '==', accountId)
        .where('status', '==', 'queued')
        .orderBy('createdAt', 'asc')
        .limit(limit)
        .get();

      const messages = [];
      snapshot.forEach(doc => {
        messages.push({ id: doc.id, ...doc.data() });
      });

      return messages;
    } catch (error) {
      console.error(`❌ [Queue] Failed to get queued messages:`, error.message);
      return [];
    }
  }

  /**
   * Update message status
   */
  async updateMessageStatus(messageId, status, data = {}) {
    try {
      if (!this.db) await this.initialize();

      const update = {
        status,
        ...data
      };

      if (status === 'sending') {
        update.lastAttemptAt = new Date().toISOString();
      } else if (status === 'sent') {
        update.sentAt = new Date().toISOString();
      } else if (status === 'delivered') {
        update.deliveredAt = new Date().toISOString();
      }

      await this.db
        .collection('whatsapp_messages')
        .doc(messageId)
        .update(update);

      console.log(`📝 [Queue] Message ${messageId} status: ${status}`);
      return true;
    } catch (error) {
      console.error(`❌ [Queue] Failed to update message status:`, error.message);
      return false;
    }
  }

  /**
   * Flush queued messages for account
   */
  async flushQueue(accountId, sendFunction) {
    // Check if already flushing
    if (this.flushLocks.get(accountId)) {
      console.log(`⏳ [Queue] Already flushing for ${accountId}`);
      return { success: false, reason: 'already_flushing' };
    }

    try {
      this.flushLocks.set(accountId, true);
      console.log(`🚀 [Queue] Starting flush for ${accountId}`);

      const messages = await this.getQueuedMessages(accountId);
      
      if (messages.length === 0) {
        console.log(`✅ [Queue] No queued messages for ${accountId}`);
        return { success: true, sent: 0, failed: 0 };
      }

      console.log(`📤 [Queue] Flushing ${messages.length} messages for ${accountId}`);

      let sent = 0;
      let failed = 0;

      for (const msg of messages) {
        try {
          // Update status to sending
          await this.updateMessageStatus(msg.messageId, 'sending', {
            attempts: (msg.attempts || 0) + 1
          });

          // Send message
          const result = await sendFunction(msg.to, msg.message);

          // Update status to sent
          await this.updateMessageStatus(msg.messageId, 'sent', {
            whatsappMessageId: result?.key?.id || null
          });

          sent++;
          console.log(`✅ [Queue] Sent ${msg.messageId}`);

          // Small delay between messages
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
          console.error(`❌ [Queue] Failed to send ${msg.messageId}:`, error.message);

          // Check if recoverable
          const isRecoverable = error.message.includes('timeout') || 
                               error.message.includes('network') ||
                               error.message.includes('rate');

          if (isRecoverable && (msg.attempts || 0) < 3) {
            // Keep as queued for retry
            await this.updateMessageStatus(msg.messageId, 'queued', {
              error: error.message
            });
          } else {
            // Mark as failed
            await this.updateMessageStatus(msg.messageId, 'failed', {
              error: error.message
            });
            failed++;
          }
        }
      }

      console.log(`✅ [Queue] Flush complete for ${accountId}: ${sent} sent, ${failed} failed`);
      return { success: true, sent, failed };

    } catch (error) {
      console.error(`❌ [Queue] Flush error for ${accountId}:`, error.message);
      return { success: false, error: error.message };
    } finally {
      this.flushLocks.delete(accountId);
    }
  }

  /**
   * Get all messages (for UI)
   */
  async getAllMessages(accountId, limit = 100) {
    try {
      if (!this.db) await this.initialize();

      const snapshot = await this.db
        .collection('whatsapp_messages')
        .where('accountId', '==', accountId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const messages = [];
      snapshot.forEach(doc => {
        messages.push({ id: doc.id, ...doc.data() });
      });

      return messages;
    } catch (error) {
      console.error(`❌ [Queue] Failed to get all messages:`, error.message);
      return [];
    }
  }
}

module.exports = new MessageQueue();
