'use strict';

/**
 * Short Code Generator
 * 
 * Generates short codes for events (01, 02, ...) and role slots (01A, 01B, ..., 01Z).
 * Uses atomic counters for thread-safe generation.
 */

const admin = require('firebase-admin');

class ShortCodeGenerator {
  constructor(db) {
    this.db = db || admin.firestore();
    this.counterCollection = 'counters';
    this.counterDoc = 'eventShortCode';
  }

  /**
   * Generate next event short code (01, 02, 03, ...)
   * Thread-safe using Firestore transaction
   */
  async generateEventShortCode() {
    const counterRef = this.db.collection(this.counterCollection).doc(this.counterDoc);

    try {
      const shortCode = await this.db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);

        let currentValue = 0;
        if (counterDoc.exists) {
          currentValue = counterDoc.data().value || 0;
        }

        const nextValue = currentValue + 1;
        const shortCode = String(nextValue).padStart(2, '0');

        // Update counter
        if (counterDoc.exists) {
          transaction.update(counterRef, {
            value: nextValue,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          transaction.set(counterRef, {
            value: nextValue,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        return shortCode;
      });

      return shortCode;
    } catch (error) {
      console.error('Error generating event short code:', error);
      // Fallback: use timestamp-based code
      return this._generateFallbackEventCode();
    }
  }

  /**
   * Generate role slot code for an event (A, B, C, ..., Z)
   * Max 26 roles per event
   */
  generateRoleSlot(existingRoles) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const usedSlots = new Set(
      (existingRoles || []).map(r => r.slot).filter(Boolean)
    );

    // Find first available letter
    for (let i = 0; i < alphabet.length; i++) {
      const letter = alphabet[i];
      if (!usedSlots.has(letter)) {
        return letter;
      }
    }

    // All slots used (unlikely)
    throw new Error('Maximum number of roles (26) reached for this event');
  }

  /**
   * Generate full role code (eventShortCode + slot, e.g., "01A", "01B")
   */
  generateRoleCode(eventShortCode, slot) {
    if (!eventShortCode || !slot) {
      throw new Error('Event short code and slot are required');
    }

    return `${eventShortCode}${slot}`;
  }

  /**
   * Parse role code into event short code and slot
   * Example: "01A" -> { eventShortCode: "01", slot: "A" }
   */
  parseRoleCode(roleCode) {
    if (!roleCode || roleCode.length < 3) {
      return null;
    }

    const match = roleCode.match(/^(\d{2})([A-Z])$/);
    if (!match) {
      return null;
    }

    return {
      eventShortCode: match[1],
      slot: match[2],
    };
  }

  /**
   * Find event by short code
   */
  async findEventByShortCode(shortCode) {
    if (!shortCode) return null;

    try {
      const eventsSnap = await this.db
        .collection('evenimente')
        .where('shortCode', '==', shortCode)
        .limit(1)
        .get();

      if (eventsSnap.empty) {
        return null;
      }

      const doc = eventsSnap.docs[0];
      return {
        id: doc.id,
        ...doc.data(),
      };
    } catch (error) {
      console.error('Error finding event by short code:', error);
      return null;
    }
  }

  /**
   * Find role by role code (e.g., "01A")
   */
  async findRoleByCode(roleCode) {
    const parsed = this.parseRoleCode(roleCode);
    if (!parsed) {
      return null;
    }

    const event = await this.findEventByShortCode(parsed.eventShortCode);
    if (!event) {
      return null;
    }

    const role = (event.roles || []).find(r => r.slot === parsed.slot);
    if (!role) {
      return null;
    }

    return {
      eventId: event.id,
      event,
      role,
      slot: parsed.slot,
    };
  }

  /**
   * Validate short code format
   */
  isValidEventShortCode(shortCode) {
    return /^\d{2}$/.test(shortCode);
  }

  /**
   * Validate role code format
   */
  isValidRoleCode(roleCode) {
    return /^\d{2}[A-Z]$/.test(roleCode);
  }

  /**
   * Fallback event code generator (timestamp-based)
   * Used when transaction fails
   */
  _generateFallbackEventCode() {
    const now = Date.now();
    const code = String(now % 100).padStart(2, '0');
    console.warn('Using fallback event code:', code);
    return code;
  }

  /**
   * Reset counter (admin only, for testing)
   */
  async resetCounter() {
    const counterRef = this.db.collection(this.counterCollection).doc(this.counterDoc);
    
    await counterRef.set({
      value: 0,
      resetAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('Event short code counter reset to 0');
  }

  /**
   * Get current counter value (for debugging)
   */
  async getCurrentCounter() {
    const counterRef = this.db.collection(this.counterCollection).doc(this.counterDoc);
    const counterDoc = await counterRef.get();

    if (!counterDoc.exists) {
      return 0;
    }

    return counterDoc.data().value || 0;
  }
}

// Helper functions for direct use
const defaultGenerator = new ShortCodeGenerator();

/**
 * Get next eventShortId (numeric)
 * @returns {Promise<number>} - Next numeric event ID
 */
async function getNextEventShortId() {
  const counterRef = defaultGenerator.db.collection(defaultGenerator.counterCollection).doc(defaultGenerator.counterDoc);

  try {
    const eventShortId = await defaultGenerator.db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);

      let currentValue = 0;
      if (counterDoc.exists) {
        currentValue = counterDoc.data().value || 0;
      }

      const nextValue = currentValue + 1;

      // Update counter
      if (counterDoc.exists) {
        transaction.update(counterRef, {
          value: nextValue,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.set(counterRef, {
          value: nextValue,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return nextValue; // Return numeric value
    });

    return eventShortId;
  } catch (error) {
    console.error('Error generating eventShortId:', error);
    // Fallback: use timestamp-based ID
    return Date.now() % 10000;
  }
}

/**
 * Get next free slot for an event
 * @param {number} eventShortId - Numeric event ID
 * @param {object} existingSlots - rolesBySlot object
 * @returns {string} - Slot code (e.g., "01A", "01B")
 */
function getNextFreeSlot(eventShortId, existingSlots) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefix = String(eventShortId).padStart(2, '0');
  
  const usedLetters = new Set();
  Object.keys(existingSlots || {}).forEach(slot => {
    const letter = slot.replace(prefix, '');
    if (letter) usedLetters.add(letter);
  });

  // Find first available letter
  for (let i = 0; i < alphabet.length; i++) {
    const letter = alphabet[i];
    if (!usedLetters.has(letter)) {
      return `${prefix}${letter}`;
    }
  }

  throw new Error('Maximum number of roles (26) reached for this event');
}

module.exports = ShortCodeGenerator;
module.exports.getNextEventShortId = getNextEventShortId;
module.exports.getNextFreeSlot = getNextFreeSlot;
