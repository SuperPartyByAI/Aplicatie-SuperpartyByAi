const admin = require('firebase-admin');

/**
 * Identify event for update/archive operations
 *
 * Rules:
 * 1. If eventShortId provided: use it, but reconfirm date+address
 * 2. If phone provided: search non-archived future events
 *    - If 1 found: reconfirm date+address
 *    - If >1 found: require date+address to disambiguate
 * 3. Always require confirmation before action
 *
 * @param {Object} criteria - { eventShortId?, phoneE164?, date?, address? }
 * @returns {Promise<Object>} - { found: bool, events: [], needsConfirmation: bool, message: string }
 */
async function identifyEventForUpdate(criteria) {
  const db = admin.firestore();
  const { eventShortId, phoneE164, date, address } = criteria;

  // Case 1: eventShortId provided
  if (eventShortId) {
    const snapshot = await db
      .collection('evenimente')
      .where('eventShortId', '==', Number(eventShortId))
      .where('isArchived', '==', false)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return {
        found: false,
        events: [],
        needsConfirmation: false,
        message: `Nu am găsit eveniment cu ID ${eventShortId} (sau este arhivat).`,
      };
    }

    const event = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

    // Reconfirm date+address
    return {
      found: true,
      events: [event],
      needsConfirmation: true,
      message: `Am găsit evenimentul ${eventShortId}:\n📅 Data: ${event.date}\n📍 Adresa: ${event.address}\n\nConfirmi că vrei să modifici acest eveniment?`,
    };
  }

  // Case 2: phone provided
  if (phoneE164) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDateDDMMYYYY(today);

    const query = db
      .collection('evenimente')
      .where('phoneE164', '==', phoneE164)
      .where('isArchived', '==', false);

    const snapshot = await query.get();

    // Filter future events (date >= today)
    const futureEvents = [];
    snapshot.forEach(doc => {
      const eventData = doc.data();
      if (isFutureOrToday(eventData.date, todayStr)) {
        futureEvents.push({ id: doc.id, ...eventData });
      }
    });

    if (futureEvents.length === 0) {
      return {
        found: false,
        events: [],
        needsConfirmation: false,
        message: 'Nu am găsit evenimente viitoare pentru acest număr de telefon.',
      };
    }

    if (futureEvents.length === 1) {
      const event = futureEvents[0];
      return {
        found: true,
        events: [event],
        needsConfirmation: true,
        message: `Am găsit un eveniment pentru acest telefon:\n📅 Data: ${event.date}\n📍 Adresa: ${event.address}\n\nConfirmi că vrei să modifici acest eveniment?`,
      };
    }

    // Multiple events found - need date+address to disambiguate
    if (!date || !address) {
      const eventsList = futureEvents
        .map((e, i) => `${i + 1}. ${e.date} - ${e.address}`)
        .join('\n');
      return {
        found: true,
        events: futureEvents,
        needsConfirmation: true,
        message: `Am găsit ${futureEvents.length} evenimente viitoare pentru acest telefon:\n\n${eventsList}\n\nTe rog să specifici data și adresa pentru a identifica evenimentul corect.`,
      };
    }

    // Filter by date+address
    const matchingEvents = futureEvents.filter(
      e => e.date === date && e.address.toLowerCase().includes(address.toLowerCase())
    );

    if (matchingEvents.length === 0) {
      return {
        found: false,
        events: [],
        needsConfirmation: false,
        message: `Nu am găsit eveniment pentru data ${date} și adresa ${address}.`,
      };
    }

    if (matchingEvents.length === 1) {
      const event = matchingEvents[0];
      return {
        found: true,
        events: [event],
        needsConfirmation: true,
        message: `Am găsit evenimentul:\n📅 Data: ${event.date}\n📍 Adresa: ${event.address}\n\nConfirmi că vrei să modifici acest eveniment?`,
      };
    }

    // Still ambiguous
    const eventsList = matchingEvents
      .map((e, i) => `${i + 1}. ${e.date} - ${e.address} (ID: ${e.eventShortId})`)
      .join('\n');
    return {
      found: true,
      events: matchingEvents,
      needsConfirmation: true,
      message: `Am găsit ${matchingEvents.length} evenimente pentru data ${date} și adresa ${address}:\n\n${eventsList}\n\nTe rog să specifici ID-ul evenimentului.`,
    };
  }

  // No criteria provided
  return {
    found: false,
    events: [],
    needsConfirmation: false,
    message: 'Te rog să specifici ID-ul evenimentului sau numărul de telefon.',
  };
}

/**
 * Get client history by phone
 *
 * @param {string} phoneE164 - Phone in E.164 format
 * @returns {Promise<Array>} - All events (including archived) for this phone
 */
async function getClientHistory(phoneE164) {
  const db = admin.firestore();

  const snapshot = await db
    .collection('evenimente')
    .where('phoneE164', '==', phoneE164)
    .orderBy('date', 'desc')
    .get();

  const events = [];
  for (const doc of snapshot.docs) {
    const eventData = doc.data();

    // Get event history
    const historySnapshot = await db
      .collection('evenimente')
      .doc(doc.id)
      .collection('eventHistory')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    const history = historySnapshot.docs.map(h => h.data());

    events.push({
      id: doc.id,
      ...eventData,
      history,
    });
  }

  return events;
}

/**
 * Check if role already exists in event
 *
 * @param {Object} event - Event data
 * @param {string} roleType - Role type to check
 * @returns {Object} - { exists: bool, slot?: string, role?: Object }
 */
function checkRoleExists(event, roleType) {
  const rolesBySlot = event.rolesBySlot || {};

  for (const [slot, role] of Object.entries(rolesBySlot)) {
    if (role.roleType === roleType && !role.isArchived) {
      return { exists: true, slot, role };
    }
  }

  return { exists: false };
}

// Helper functions
function formatDateDDMMYYYY(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function isFutureOrToday(dateStr, todayStr) {
  // Compare DD-MM-YYYY strings
  const [d1, m1, y1] = dateStr.split('-').map(Number);
  const [d2, m2, y2] = todayStr.split('-').map(Number);

  const date1 = new Date(y1, m1 - 1, d1);
  const date2 = new Date(y2, m2 - 1, d2);

  return date1 >= date2;
}

module.exports = {
  identifyEventForUpdate,
  getClientHistory,
  checkRoleExists,
};
