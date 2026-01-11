'use strict';

/**
 * Event Identifier
 * 
 * Identifies whether user wants to CREATE a new event or UPDATE an existing one.
 * Uses phone number, date, and address for identification.
 */

const admin = require('firebase-admin');
const crypto = require('crypto');

class EventIdentifier {
  constructor(db) {
    this.db = db || admin.firestore();
  }

  /**
   * Determine if user wants to create or update an event
   * Returns: { action: 'CREATE' | 'UPDATE' | 'AMBIGUOUS', eventId?, events?, message? }
   */
  async identifyIntent(userInput, phone) {
    // Keywords that indicate UPDATE intent
    const updateKeywords = [
      'adauga', 'adaugă', 'mai vreau', 'mai am nevoie',
      'inca', 'încă', 'si', 'și', 'plus',
      'alt', 'alta', 'altul', 'altceva',
      'update', 'modifica', 'modifică', 'schimba', 'schimbă',
    ];

    const normalizedInput = userInput.toLowerCase()
      .replace(/ă/g, 'a')
      .replace(/â/g, 'a')
      .replace(/î/g, 'i')
      .replace(/ș/g, 's')
      .replace(/ț/g, 't');

    const hasUpdateKeyword = updateKeywords.some(kw => normalizedInput.includes(kw));

    // If no phone, can't identify existing events
    if (!phone) {
      if (hasUpdateKeyword) {
        return {
          action: 'ASK_PHONE',
          message: 'Pentru a adăuga servicii la un eveniment existent, am nevoie de numărul de telefon al clientului.',
        };
      }
      return { action: 'CREATE' };
    }

    // If has update keyword, search for existing future events
    if (hasUpdateKeyword) {
      const futureEvents = await this.findFutureEvents(phone);

      if (futureEvents.length === 0) {
        return {
          action: 'CREATE',
          message: 'Nu am găsit evenimente viitoare pentru acest număr de telefon. Voi crea un eveniment nou.',
        };
      }

      if (futureEvents.length === 1) {
        // Single event found - propose update with reconfirmation
        const event = futureEvents[0];
        return {
          action: 'PROPOSE_UPDATE',
          eventId: event.id,
          event,
          message: `Am găsit un eveniment viitor:\n📅 Data: ${event.date}\n📍 Adresa: ${event.address}\n\nVrei să adaugi servicii la acest eveniment?`,
        };
      }

      // Multiple events found - need clarification
      return {
        action: 'AMBIGUOUS',
        events: futureEvents,
        message: this._formatMultipleEventsMessage(futureEvents),
      };
    }

    // No update keyword - default to CREATE
    return { action: 'CREATE' };
  }

  /**
   * Find future non-archived events for a phone number
   */
  async findFutureEvents(phone) {
    if (!phone) return [];

    const today = new Date();
    const todayStr = this._formatDateForComparison(today);

    try {
      const eventsSnap = await this.db
        .collection('evenimente')
        .where('client', '==', phone)
        .where('isArchived', '==', false)
        .get();

      const futureEvents = [];

      eventsSnap.forEach(doc => {
        const data = doc.data();
        const eventDateStr = this._formatDateForComparison(this._parseDate(data.date));

        // Only include future events (today or later)
        if (eventDateStr >= todayStr) {
          futureEvents.push({
            id: doc.id,
            ...data,
          });
        }
      });

      // Sort by date (earliest first)
      futureEvents.sort((a, b) => {
        const dateA = this._formatDateForComparison(this._parseDate(a.date));
        const dateB = this._formatDateForComparison(this._parseDate(b.date));
        return dateA.localeCompare(dateB);
      });

      return futureEvents;
    } catch (error) {
      console.error('Error finding future events:', error);
      return [];
    }
  }

  /**
   * Identify specific event from multiple options
   * Uses date, address, or shortCode
   */
  async identifySpecificEvent(events, userInput) {
    const normalizedInput = userInput.toLowerCase()
      .replace(/ă/g, 'a')
      .replace(/â/g, 'a')
      .replace(/î/g, 'i')
      .replace(/ș/g, 's')
      .replace(/ț/g, 't');

    // Try to match by shortCode
    const shortCodeMatch = normalizedInput.match(/\b(\d{2}[A-Z]?)\b/);
    if (shortCodeMatch) {
      const shortCode = shortCodeMatch[1];
      const event = events.find(e => e.shortCode === shortCode);
      if (event) {
        return {
          identified: true,
          eventId: event.id,
          event,
        };
      }
    }

    // Try to match by date
    const dateMatch = normalizedInput.match(/(\d{2})[-/.](\d{2})[-/.](\d{4})/);
    if (dateMatch) {
      const dateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      const event = events.find(e => e.date === dateStr);
      if (event) {
        return {
          identified: true,
          eventId: event.id,
          event,
        };
      }
    }

    // Try to match by address keywords
    const matchingEvents = events.filter(e => {
      const normalizedAddress = (e.address || '').toLowerCase()
        .replace(/ă/g, 'a')
        .replace(/â/g, 'a')
        .replace(/î/g, 'i')
        .replace(/ș/g, 's')
        .replace(/ț/g, 't');

      // Check if any significant word from address is in input
      const addressWords = normalizedAddress.split(/\s+/).filter(w => w.length > 3);
      return addressWords.some(word => normalizedInput.includes(word));
    });

    if (matchingEvents.length === 1) {
      return {
        identified: true,
        eventId: matchingEvents[0].id,
        event: matchingEvents[0],
      };
    }

    if (matchingEvents.length > 1) {
      return {
        identified: false,
        ambiguous: true,
        events: matchingEvents,
        message: this._formatMultipleEventsMessage(matchingEvents),
      };
    }

    return {
      identified: false,
      message: 'Nu am putut identifica evenimentul. Te rog să specifici data (DD-MM-YYYY) sau codul evenimentului.',
    };
  }

  /**
   * Generate deterministic updateRequestId for idempotency
   * Based on eventId + message hash + timestamp (rounded to 5 minutes)
   */
  generateUpdateRequestId(eventId, message) {
    const now = Date.now();
    // Round to 5 minutes to allow retries within same window
    const roundedTime = Math.floor(now / (5 * 60 * 1000)) * (5 * 60 * 1000);
    
    const hash = crypto
      .createHash('sha256')
      .update(`${eventId}:${message}:${roundedTime}`)
      .digest('hex')
      .substring(0, 16);

    return `upd_${hash}`;
  }

  /**
   * Format multiple events message for user
   */
  _formatMultipleEventsMessage(events) {
    let message = 'Am găsit mai multe evenimente viitoare:\n\n';

    events.forEach((event, index) => {
      message += `${index + 1}. `;
      if (event.shortCode) {
        message += `[${event.shortCode}] `;
      }
      message += `📅 ${event.date} - 📍 ${event.address}`;
      if (event.sarbatoritNume) {
        message += ` (${event.sarbatoritNume})`;
      }
      message += '\n';
    });

    message += '\nTe rog să specifici:\n';
    message += '- Data (ex: 15-01-2026)\n';
    message += '- Adresa (ex: București, Str. Exemplu)\n';
    if (events.some(e => e.shortCode)) {
      message += '- SAU codul evenimentului (ex: 01)\n';
    }

    return message;
  }

  /**
   * Parse date from DD-MM-YYYY format
   */
  _parseDate(dateStr) {
    if (!dateStr) return null;

    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    return new Date(year, month - 1, day);
  }

  /**
   * Format date for comparison (YYYY-MM-DD)
   */
  _formatDateForComparison(date) {
    if (!date) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}

module.exports = EventIdentifier;
