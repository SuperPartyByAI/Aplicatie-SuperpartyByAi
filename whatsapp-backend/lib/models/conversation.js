/**
 * Conversation Model
 *
 * Represents a WhatsApp conversation with a client
 */

class Conversation {
  constructor(data) {
    this.conversation_id = data.conversation_id || null;
    this.client_phone = data.client_phone || null;
    this.status = data.status || 'AVAILABLE'; // AVAILABLE | RESERVED
    this.assigned_operator_code = data.assigned_operator_code || null;
    this.reserved_at = data.reserved_at || null;
    this.last_client_message_at = data.last_client_message_at || null;
    this.last_human_operator_message_at = data.last_human_operator_message_at || null;
    this.last_ai_message_at = data.last_ai_message_at || null;
    this.unread_count_for_operator = data.unread_count_for_operator || 0;
    this.released_at = data.released_at || null;
  }

  toFirestore() {
    return {
      client_phone: this.client_phone,
      status: this.status,
      assigned_operator_code: this.assigned_operator_code,
      reserved_at: this.reserved_at,
      last_client_message_at: this.last_client_message_at,
      last_human_operator_message_at: this.last_human_operator_message_at,
      last_ai_message_at: this.last_ai_message_at,
      unread_count_for_operator: this.unread_count_for_operator,
      released_at: this.released_at,
    };
  }

  static fromFirestore(doc) {
    const data = doc.data();
    return new Conversation({
      conversation_id: doc.id,
      ...data,
    });
  }

  isAvailable() {
    return this.status === 'AVAILABLE';
  }

  isReserved() {
    return this.status === 'RESERVED';
  }

  canBeReservedBy(operatorCode) {
    return this.isAvailable();
  }

  canBeWrittenBy(operatorCode) {
    return this.isReserved() && this.assigned_operator_code === operatorCode;
  }

  reserve(operatorCode, timestamp) {
    this.status = 'RESERVED';
    this.assigned_operator_code = operatorCode;
    this.reserved_at = timestamp;
  }

  release(timestamp) {
    this.status = 'AVAILABLE';
    this.assigned_operator_code = null;
    this.released_at = timestamp;
  }

  updateLastClientMessage(timestamp) {
    this.last_client_message_at = timestamp;
  }

  updateLastHumanOperatorMessage(timestamp) {
    this.last_human_operator_message_at = timestamp;
  }

  updateLastAIMessage(timestamp) {
    this.last_ai_message_at = timestamp;
  }

  incrementUnreadCount() {
    this.unread_count_for_operator += 1;
  }

  resetUnreadCount() {
    this.unread_count_for_operator = 0;
  }
}

module.exports = Conversation;
