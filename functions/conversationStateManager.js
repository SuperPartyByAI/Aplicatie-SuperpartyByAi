'use strict';

/**
 * Conversation State Manager
 * 
 * Manages conversation states for interactive event noting flow.
 * Supports notingMode with draft event collection and pending questions.
 * 
 * NOTE: This module is used by chatEventOpsV2 (Schema v2).
 * For V3 EN, use chatEventOps with normalizers.
 */

const admin = require('firebase-admin');

class ConversationStateManager {
  constructor(db) {
    this.db = db || admin.firestore();
    this.statesCollection = 'conversationStates';
  }

  /**
   * Get conversation state for a session
   */
  async getState(sessionId) {
    if (!sessionId) return null;

    const stateDoc = await this.db.collection(this.statesCollection).doc(sessionId).get();
    
    if (!stateDoc.exists) {
      return null;
    }

    return {
      id: stateDoc.id,
      ...stateDoc.data(),
    };
  }

  /**
   * Initialize noting mode for a session
   */
  async startNotingMode(sessionId, userId, initialData = {}) {
    const now = admin.firestore.FieldValue.serverTimestamp();

    const state = {
      sessionId,
      // Firestore rules expect ownerUid for access control.
      ownerUid: userId,
      notingMode: true,
      mode: 'collecting_event',
      conversationState: 'collecting_event',
      draftEvent: {
        date: initialData.date || null,
        address: initialData.address || null,
        client: initialData.client || null,
        sarbatoritNume: initialData.sarbatoritNume || null,
        sarbatoritVarsta: initialData.sarbatoritVarsta || null,
        sarbatoritDob: initialData.sarbatoritDob || null,
        rolesDraft: initialData.rolesDraft || [],
      },
      pendingQuestions: this._generatePendingQuestions({
        date: initialData.date || null,
        address: initialData.address || null,
        client: initialData.client || null,
        sarbatoritNume: initialData.sarbatoritNume || null,
        sarbatoritVarsta: initialData.sarbatoritVarsta || null,
        sarbatoritDob: initialData.sarbatoritDob || null,
        rolesDraft: initialData.rolesDraft || [],
      }),
      createdAt: now,
      updatedAt: now,
    };

    await this.db.collection(this.statesCollection).doc(sessionId).set(state);

    return state;
  }

  /**
   * Update draft event with new information
   */
  async updateDraft(sessionId, updates) {
    const state = await this.getState(sessionId);
    
    if (!state || !state.notingMode) {
      throw new Error('Not in noting mode');
    }

    const draftEvent = {
      ...state.draftEvent,
      ...updates,
    };

    // Update pending questions based on what's now filled
    const pendingQuestions = this._generatePendingQuestions(draftEvent);

    const updateData = {
      draftEvent,
      pendingQuestions,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await this.db.collection(this.statesCollection).doc(sessionId).update(updateData);

    return {
      ...state,
      ...updateData,
    };
  }

  /**
   * Add AI response to transcript
   */
  async addAIResponse(sessionId, aiMessage) {
    // Transcript is stored server-side in /evenimente/{eventId}/ai_sessions/... for super-admin.
    // Keep this as a no-op for backward compatibility with older call sites.
    void sessionId;
    void aiMessage;
  }

  /**
   * Cancel noting mode and reset state
   */
  async cancelNotingMode(sessionId) {
    await this.db.collection(this.statesCollection).doc(sessionId).delete();
  }

  /**
   * Exit noting mode (same as cancel)
   */
  async exitNotingMode(sessionId) {
    return this.cancelNotingMode(sessionId);
  }

  /**
   * Check if draft is complete and ready for confirmation
   */
  isReadyForConfirmation(draftEvent) {
    // Required fields: date, address
    if (!draftEvent.date || !draftEvent.address) {
      return false;
    }

    // At least one role should be defined
    if (!draftEvent.rolesDraft || draftEvent.rolesDraft.length === 0) {
      return false;
    }

    // Each role should have startTime and durationMinutes
    for (const role of draftEvent.rolesDraft) {
      if (!role.startTime || !role.durationMinutes) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate list of pending questions based on draft state
   */
  _generatePendingQuestions(draftEvent) {
    const questions = [];

    if (!draftEvent.date) {
      questions.push({
        field: 'date',
        question: 'Care este data evenimentului? (format DD-MM-YYYY, ex: 15-01-2026)',
        priority: 'high',
      });
    }

    if (!draftEvent.address) {
      questions.push({
        field: 'address',
        question: 'Care este adresa/locația evenimentului?',
        priority: 'high',
      });
    }

    if (!draftEvent.rolesDraft || draftEvent.rolesDraft.length === 0) {
      questions.push({
        field: 'roles',
        question: 'Ce servicii/roluri sunt necesare? (ex: animator, ursitoare, vată de zahăr, popcorn, etc.)',
        priority: 'high',
      });
    } else {
      // Check each role for missing details
      draftEvent.rolesDraft.forEach((role, index) => {
        if (!role.startTime) {
          questions.push({
            field: `roles[${index}].startTime`,
            question: `La ce oră începe ${role.label}? (format HH:mm, ex: 14:00)`,
            priority: 'high',
          });
        }

        if (!role.durationMinutes && !role.fixedDuration) {
          questions.push({
            field: `roles[${index}].durationMinutes`,
            question: `Cât durează ${role.label}? (ex: 2 ore, 90 minute, 1.5 ore)`,
            priority: 'high',
          });
        }

        // Animator-specific questions
        if (role.label === 'Animator' && role.details) {
          if (!role.details.sarbatoritNume) {
            questions.push({
              field: `roles[${index}].details.sarbatoritNume`,
              question: 'Care este numele sărbătoritului?',
              priority: 'high',
            });
          }

          if (!role.details.dataNastere) {
            questions.push({
              field: `roles[${index}].details.dataNastere`,
              question: 'Care este data nașterii sărbătoritului? (format DD-MM-YYYY)',
              priority: 'medium',
            });
          }

          if (!role.details.personaj) {
            questions.push({
              field: `roles[${index}].details.personaj`,
              question: 'Ce personaj/temă doriți pentru animator? (ex: Elsa, Spiderman, MC, etc.)',
              priority: 'medium',
            });
          }
        }

        // Ursitoare-specific questions
        if (role.label === 'Ursitoare' && role.details) {
          if (!role.details.count) {
            questions.push({
              field: `roles[${index}].details.count`,
              question: 'Câte ursitoare doriți? (3 bune sau 4 - 3 bune + 1 rea)',
              priority: 'high',
            });
          }
        }
      });
    }

    // Optional but recommended questions
    if (!draftEvent.sarbatoritNume && (!draftEvent.rolesDraft || !draftEvent.rolesDraft.some(r => r.label === 'Animator'))) {
      questions.push({
        field: 'sarbatoritNume',
        question: 'Care este numele sărbătoritului? (opțional)',
        priority: 'low',
      });
    }

    if (!draftEvent.client) {
      questions.push({
        field: 'client',
        question: 'Care este numărul de telefon al clientului? (pentru identificare)',
        priority: 'medium',
      });
    }

    return questions;
  }

  /**
   * Get next question to ask user
   */
  getNextQuestion(state) {
    if (!state || !state.pendingQuestions || state.pendingQuestions.length === 0) {
      return null;
    }

    // Return highest priority question
    const highPriority = state.pendingQuestions.find(q => q.priority === 'high');
    if (highPriority) return highPriority;

    const mediumPriority = state.pendingQuestions.find(q => q.priority === 'medium');
    if (mediumPriority) return mediumPriority;

    return state.pendingQuestions[0];
  }

  /**
   * Generate confirmation summary
   */
  generateConfirmationSummary(draftEvent) {
    let summary = '📋 Am înțeles următoarele:\n\n';

    if (draftEvent.date) {
      summary += `📅 Data: ${draftEvent.date}\n`;
    }

    if (draftEvent.address) {
      summary += `📍 Adresa: ${draftEvent.address}\n`;
    }

    if (draftEvent.sarbatoritNume) {
      summary += `🎂 Sărbătorit: ${draftEvent.sarbatoritNume}`;
      if (draftEvent.sarbatoritVarsta) {
        summary += ` (${draftEvent.sarbatoritVarsta} ani)`;
      }
      summary += '\n';
    }

    if (draftEvent.client) {
      summary += `📞 Client: ${draftEvent.client}\n`;
    }

    if (draftEvent.rolesDraft && draftEvent.rolesDraft.length > 0) {
      summary += '\n🎭 Servicii/Roluri:\n';
      draftEvent.rolesDraft.forEach((role, index) => {
        summary += `  ${index + 1}. ${role.label}`;
        if (role.startTime) {
          summary += ` - ${role.startTime}`;
        }
        if (role.durationMinutes) {
          const hours = Math.floor(role.durationMinutes / 60);
          const minutes = role.durationMinutes % 60;
          if (hours > 0 && minutes > 0) {
            summary += ` (${hours}h ${minutes}min)`;
          } else if (hours > 0) {
            summary += ` (${hours}h)`;
          } else {
            summary += ` (${minutes}min)`;
          }
        }
        summary += '\n';

        // Add role-specific details
        if (role.details) {
          if (role.details.sarbatoritNume) {
            summary += `     👤 Pentru: ${role.details.sarbatoritNume}\n`;
          }
          if (role.details.personaj) {
            summary += `     🎭 Personaj: ${role.details.personaj}\n`;
          }
          if (role.details.count) {
            summary += `     👥 Număr: ${role.details.count}\n`;
          }
        }
      });
    }

    summary += '\n✅ Confirm crearea evenimentului?';

    return summary;
  }
}

module.exports = ConversationStateManager;
