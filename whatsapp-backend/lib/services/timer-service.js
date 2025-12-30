/**
 * Timer Service
 * 
 * Handles automated timers:
 * - 5 minute AI auto-response
 * - 5 hour conversation release
 */

const admin = require('firebase-admin');
const ConversationService = require('./conversation-service');

class TimerService {
  constructor(db) {
    this.db = db;
    this.conversationService = new ConversationService(db);
    this.conversationsRef = db.collection('whatsappConversations');
    this.messagesRef = db.collection('whatsappMessages');
    
    // Timers
    this.AI_RESPONSE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    this.RELEASE_TIMEOUT = 5 * 60 * 60 * 1000; // 5 hours
    
    // Check intervals
    this.CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
    
    this.isRunning = false;
    this.intervalId = null;
  }

  /**
   * Start timer service
   */
  start() {
    if (this.isRunning) {
      console.log('⏰ Timer service already running');
      return;
    }

    console.log('⏰ Starting timer service...');
    this.isRunning = true;
    
    // Run immediately
    this.checkTimers();
    
    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkTimers();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop timer service
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('⏰ Stopping timer service...');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check all timers
   */
  async checkTimers() {
    try {
      await Promise.all([
        this.checkAIResponseTimers(),
        this.checkReleaseTimers()
      ]);
    } catch (error) {
      console.error('❌ Error checking timers:', error);
    }
  }

  /**
   * Check for conversations needing AI auto-response (5 minutes)
   */
  async checkAIResponseTimers() {
    const now = Date.now();
    const fiveMinutesAgo = new Date(now - this.AI_RESPONSE_TIMEOUT);

    // Get reserved conversations with recent client messages
    const snapshot = await this.conversationsRef
      .where('status', '==', 'RESERVED')
      .where('last_client_message_at', '>', admin.firestore.Timestamp.fromDate(fiveMinutesAgo))
      .get();

    for (const doc of snapshot.docs) {
      try {
        await this.checkConversationForAIResponse(doc);
      } catch (error) {
        console.error(`❌ Error checking AI response for ${doc.id}:`, error);
      }
    }
  }

  /**
   * Check single conversation for AI auto-response
   */
  async checkConversationForAIResponse(doc) {
    const conversation = doc.data();
    const conversationId = doc.id;
    const now = Date.now();

    if (!conversation.last_client_message_at) {
      return;
    }

    const lastClientMessageTime = conversation.last_client_message_at.toDate().getTime();
    const timeSinceClientMessage = now - lastClientMessageTime;

    // Check if 5 minutes have passed
    if (timeSinceClientMessage < this.AI_RESPONSE_TIMEOUT) {
      return;
    }

    // Check if operator has responded after client message
    const operatorResponseSnapshot = await this.messagesRef
      .where('conversation_id', '==', conversationId)
      .where('sender_type', '==', 'OPERATOR')
      .where('timestamp', '>', conversation.last_client_message_at)
      .limit(1)
      .get();

    if (!operatorResponseSnapshot.empty) {
      // Operator has responded, no AI needed
      return;
    }

    // Check if AI has already responded
    const aiResponseSnapshot = await this.messagesRef
      .where('conversation_id', '==', conversationId)
      .where('sender_type', '==', 'AI')
      .where('timestamp', '>', conversation.last_client_message_at)
      .where('ai_auto_response', '==', true)
      .limit(1)
      .get();

    if (!aiResponseSnapshot.empty) {
      // AI has already responded
      return;
    }

    // Trigger AI auto-response
    console.log(`🤖 Triggering AI auto-response for conversation ${conversationId}`);
    await this.triggerAIAutoResponse(conversationId, conversation.client_phone);
  }

  /**
   * Trigger AI auto-response
   */
  async triggerAIAutoResponse(conversationId, clientPhone) {
    // Get recent messages for context
    const messagesSnapshot = await this.messagesRef
      .where('conversation_id', '==', conversationId)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    const messages = messagesSnapshot.docs.map(doc => doc.data());
    
    // Generate AI response (placeholder - integrate with actual AI)
    const aiResponse = await this.generateAIResponse(messages, clientPhone);

    // Add AI message
    await this.conversationService.addAIMessage(conversationId, aiResponse, true);

    console.log(`✅ AI auto-response sent for conversation ${conversationId}`);
  }

  /**
   * Generate AI response (placeholder)
   */
  async generateAIResponse(messages, clientPhone) {
    // TODO: Integrate with actual AI service
    return 'Mulțumim pentru mesaj! Un operator va reveni în curând cu un răspuns personalizat.';
  }

  /**
   * Check for conversations needing release (5 hours)
   */
  async checkReleaseTimers() {
    const now = Date.now();
    const fiveHoursAgo = new Date(now - this.RELEASE_TIMEOUT);

    // Get reserved conversations older than 5 hours
    const snapshot = await this.conversationsRef
      .where('status', '==', 'RESERVED')
      .where('reserved_at', '<', admin.firestore.Timestamp.fromDate(fiveHoursAgo))
      .get();

    for (const doc of snapshot.docs) {
      try {
        await this.checkConversationForRelease(doc);
      } catch (error) {
        console.error(`❌ Error checking release for ${doc.id}:`, error);
      }
    }
  }

  /**
   * Check single conversation for release
   */
  async checkConversationForRelease(doc) {
    const conversation = doc.data();
    const conversationId = doc.id;
    const now = Date.now();

    if (!conversation.reserved_at) {
      return;
    }

    const reservedTime = conversation.reserved_at.toDate().getTime();
    const timeSinceReserved = now - reservedTime;

    // Check if 5 hours have passed
    if (timeSinceReserved < this.RELEASE_TIMEOUT) {
      return;
    }

    // Check if operator has sent any human message since reservation
    const operatorMessageSnapshot = await this.messagesRef
      .where('conversation_id', '==', conversationId)
      .where('sender_type', '==', 'OPERATOR')
      .where('sender_operator_code', '==', conversation.assigned_operator_code)
      .where('timestamp', '>', conversation.reserved_at)
      .limit(1)
      .get();

    if (!operatorMessageSnapshot.empty) {
      // Operator has sent a message, check if it's within 5 hours
      const lastOperatorMessage = operatorMessageSnapshot.docs[0].data();
      const lastOperatorMessageTime = lastOperatorMessage.timestamp.toDate().getTime();
      const timeSinceLastOperatorMessage = now - lastOperatorMessageTime;

      if (timeSinceLastOperatorMessage < this.RELEASE_TIMEOUT) {
        // Operator has sent a message within 5 hours, don't release
        return;
      }
    }

    // Release conversation
    console.log(`🔓 Releasing conversation ${conversationId} (no human response in 5 hours)`);
    await this.conversationService.releaseConversation(conversationId);
    console.log(`✅ Conversation ${conversationId} released`);
  }
}

module.exports = TimerService;
