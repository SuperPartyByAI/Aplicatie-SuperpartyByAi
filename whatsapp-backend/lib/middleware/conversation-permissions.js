/**
 * Conversation Permissions Middleware
 *
 * Enforces permission rules for conversation operations
 */

const admin = require('firebase-admin');

class ConversationPermissions {
  constructor(db) {
    this.db = db;
    this.conversationsRef = db.collection('whatsappConversations');
  }

  /**
   * Check if operator can view conversation
   * Rule: All operators can view all conversations
   */
  async canView(operatorCode, conversationId) {
    // All operators can view
    return true;
  }

  /**
   * Check if operator can reserve conversation
   * Rule: Only AVAILABLE conversations can be reserved
   */
  async canReserve(operatorCode, conversationId) {
    const doc = await this.conversationsRef.doc(conversationId).get();

    if (!doc.exists) {
      return false;
    }

    const conversation = doc.data();
    return conversation.status === 'AVAILABLE';
  }

  /**
   * Check if operator can write to conversation
   * Rule: Only the assigned operator can write to RESERVED conversations
   */
  async canWrite(operatorCode, conversationId) {
    const doc = await this.conversationsRef.doc(conversationId).get();

    if (!doc.exists) {
      return false;
    }

    const conversation = doc.data();

    // Must be RESERVED
    if (conversation.status !== 'RESERVED') {
      return false;
    }

    // Must be assigned to this operator
    return conversation.assigned_operator_code === operatorCode;
  }

  /**
   * Check if operator can use action buttons
   * Rule: Only the assigned operator can use action buttons
   */
  async canUseActions(operatorCode, conversationId) {
    return await this.canWrite(operatorCode, conversationId);
  }

  /**
   * Middleware: Verify operator can write
   */
  verifyCanWrite(getOperatorCode, getConversationId) {
    return async (req, res, next) => {
      try {
        const operatorCode = getOperatorCode(req);
        const conversationId = getConversationId(req);

        if (!operatorCode) {
          return res.status(401).json({
            success: false,
            error: 'Operator code required',
          });
        }

        if (!conversationId) {
          return res.status(400).json({
            success: false,
            error: 'Conversation ID required',
          });
        }

        const canWrite = await this.canWrite(operatorCode, conversationId);

        if (!canWrite) {
          return res.status(403).json({
            success: false,
            error: 'Doar operatorul rezervant poate răspunde',
          });
        }

        next();
      } catch (error) {
        console.error('Permission check error:', error);
        res.status(500).json({
          success: false,
          error: 'Permission check failed',
        });
      }
    };
  }

  /**
   * Middleware: Verify operator can reserve
   */
  verifyCanReserve(getOperatorCode, getConversationId) {
    return async (req, res, next) => {
      try {
        const operatorCode = getOperatorCode(req);
        const conversationId = getConversationId(req);

        if (!operatorCode) {
          return res.status(401).json({
            success: false,
            error: 'Operator code required',
          });
        }

        if (!conversationId) {
          return res.status(400).json({
            success: false,
            error: 'Conversation ID required',
          });
        }

        const canReserve = await this.canReserve(operatorCode, conversationId);

        if (!canReserve) {
          return res.status(403).json({
            success: false,
            error: 'Conversația nu poate fi rezervată',
          });
        }

        next();
      } catch (error) {
        console.error('Permission check error:', error);
        res.status(500).json({
          success: false,
          error: 'Permission check failed',
        });
      }
    };
  }
}

module.exports = ConversationPermissions;
