'use strict';

/**
 * v3 Operations - Determinist, fără LLM
 * Operații CRUD pentru schema v3
 */

const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
const { validateEventV3 } = require('./v3Validators');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Identifică eveniment după criterii
 * Returnează: { found: Event[], ambiguous: boolean }
 */
async function identifyEvent(criteria) {
  const { eventShortId, phoneE164, date, address } = criteria;

  // Prioritate 1: eventShortId
  if (eventShortId) {
    const snapshot = await db
      .collection('evenimente')
      .where('eventShortId', '==', eventShortId)
      .where('isArchived', '==', false)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return {
        found: [{ id: doc.id, ...doc.data() }],
        ambiguous: false,
      };
    }
    return { found: [], ambiguous: false };
  }

  // Prioritate 2: phoneE164
  if (phoneE164) {
    const snapshot = await db
      .collection('evenimente')
      .where('phoneE164', '==', phoneE164)
      .where('isArchived', '==', false)
      .get();

    let events = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Filter future events only
      if (isFutureEvent(data.date)) {
        events.push({ id: doc.id, ...data });
      }
    });

    // If date provided, filter further
    if (date) {
      events = events.filter(e => e.date === date);
    }

    // If address provided, filter further
    if (address) {
      events = events.filter(e => e.address.toLowerCase().includes(address.toLowerCase()));
    }

    return {
      found: events,
      ambiguous: events.length > 1,
    };
  }

  return { found: [], ambiguous: false };
}

/**
 * Check if event is in future
 */
function isFutureEvent(dateStr) {
  try {
    const [day, month, year] = dateStr.split('-').map(Number);
    const eventDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate >= today;
  } catch (e) {
    return false;
  }
}

/**
 * Alocă următorul slot disponibil
 * NEVER reuse slots (even if archived)
 */
function allocateSlot(eventShortId, existingRolesBySlot) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefix = eventShortId.toString().padStart(2, '0');

  const usedLetters = new Set();
  Object.keys(existingRolesBySlot || {}).forEach(slot => {
    const letter = slot.replace(prefix, '');
    if (letter) usedLetters.add(letter);
  });

  for (const letter of letters) {
    if (!usedLetters.has(letter)) {
      return `${prefix}${letter}`;
    }
  }

  throw new Error('No more slots available (max 26 roles per event)');
}

/**
 * Apply change with full audit
 * Writes to event + eventHistory
 */
async function applyChangeWithAudit(eventId, changes, userContext, metadata = {}) {
  const eventRef = db.collection('evenimente').doc(eventId);
  const eventDoc = await eventRef.get();

  if (!eventDoc.exists) {
    throw new Error('Event not found');
  }

  const before = eventDoc.data();
  const after = { ...before, ...changes };

  // Validate after state
  const validation = validateEventV3(after);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  // Write event
  await eventRef.update({
    ...changes,
    updatedAt: Timestamp.now(),
    updatedBy: userContext.staffCode || userContext.uid,
  });

  // Write history
  await db
    .collection('evenimente')
    .doc(eventId)
    .collection('eventHistory')
    .add({
      type: 'DATA_CHANGE',
      timestamp: Timestamp.now(),
      action: metadata.action || 'UPDATE',
      eventShortId: before.eventShortId,
      before,
      after: { ...before, ...changes },
      userUid: userContext.uid,
      userEmail: userContext.email,
      metadata,
    });

  return { success: true, eventId, before, after };
}

/**
 * Get next eventShortId
 */
async function getNextEventShortId() {
  const snapshot = await db.collection('evenimente').orderBy('eventShortId', 'desc').limit(1).get();

  if (snapshot.empty) {
    return 1;
  }

  const lastEvent = snapshot.docs[0].data();
  return (lastEvent.eventShortId || 0) + 1;
}

/**
 * Create event with full validation
 */
async function createEventV3(eventData, userContext) {
  // Validate
  const validation = validateEventV3(eventData);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  // Check for duplicates
  const existing = await identifyEvent({
    phoneE164: eventData.phoneE164,
    date: eventData.date,
    address: eventData.address,
  });

  if (existing.found.length > 0) {
    throw new Error('Duplicate event found. Use update instead.');
  }

  // Create
  const eventRef = await db.collection('evenimente').add({
    ...eventData,
    schemaVersion: 3,
    isArchived: false,
    createdAt: Timestamp.now(),
    createdBy: userContext.staffCode || userContext.uid,
    updatedAt: Timestamp.now(),
    updatedBy: userContext.staffCode || userContext.uid,
  });

  // Write history
  await eventRef.collection('eventHistory').add({
    type: 'DATA_CHANGE',
    timestamp: Timestamp.now(),
    action: 'CREATE_EVENT',
    eventShortId: eventData.eventShortId,
    before: {},
    after: eventData,
    userUid: userContext.uid,
    userEmail: userContext.email,
    metadata: {},
  });

  return { success: true, eventId: eventRef.id, eventShortId: eventData.eventShortId };
}

module.exports = {
  identifyEvent,
  allocateSlot,
  applyChangeWithAudit,
  getNextEventShortId,
  createEventV3,
  isFutureEvent,
};
