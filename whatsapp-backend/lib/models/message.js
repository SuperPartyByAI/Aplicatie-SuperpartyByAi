/**
 * Message Model
 * 
 * Represents a message in a WhatsApp conversation
 */

class Message {
  constructor(data) {
    this.message_id = data.message_id || null;
    this.conversation_id = data.conversation_id || null;
    this.sender_type = data.sender_type || null; // CLIENT | OPERATOR | AI
    this.sender_operator_code = data.sender_operator_code || null;
    this.timestamp = data.timestamp || null;
    this.content = data.content || null;
    this.delivery_status = data.delivery_status || null;
    this.ai_auto_response = data.ai_auto_response || false;
  }

  toFirestore() {
    return {
      conversation_id: this.conversation_id,
      sender_type: this.sender_type,
      sender_operator_code: this.sender_operator_code,
      timestamp: this.timestamp,
      content: this.content,
      delivery_status: this.delivery_status,
      ai_auto_response: this.ai_auto_response
    };
  }

  static fromFirestore(doc) {
    const data = doc.data();
    return new Message({
      message_id: doc.id,
      ...data
    });
  }

  isFromClient() {
    return this.sender_type === 'CLIENT';
  }

  isFromOperator() {
    return this.sender_type === 'OPERATOR';
  }

  isFromAI() {
    return this.sender_type === 'AI';
  }

  isAutoResponse() {
    return this.ai_auto_response === true;
  }

  static createClientMessage(conversationId, content, timestamp) {
    return new Message({
      conversation_id: conversationId,
      sender_type: 'CLIENT',
      content: content,
      timestamp: timestamp,
      delivery_status: 'received'
    });
  }

  static createOperatorMessage(conversationId, operatorCode, content, timestamp) {
    return new Message({
      conversation_id: conversationId,
      sender_type: 'OPERATOR',
      sender_operator_code: operatorCode,
      content: content,
      timestamp: timestamp,
      delivery_status: 'sent'
    });
  }

  static createAIMessage(conversationId, content, timestamp, isAutoResponse = false) {
    return new Message({
      conversation_id: conversationId,
      sender_type: 'AI',
      content: content,
      timestamp: timestamp,
      delivery_status: 'sent',
      ai_auto_response: isAutoResponse
    });
  }
}

module.exports = Message;
