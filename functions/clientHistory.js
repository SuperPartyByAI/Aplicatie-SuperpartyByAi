const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getClientHistory } = require('./eventIdentification');

/**
 * Get client history by phone
 *
 * Returns all events (including archived) for a phone number,
 * with full event history (what AI understood, what was changed, etc.)
 *
 * Usage:
 * - Staff can query any phone
 * - Regular users can only query their own events
 */
exports.getClientHistoryByPhone = onCall(
  { region: 'us-central1', timeoutSeconds: 30 },
  async request => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
    }

    const { phoneE164 } = request.data || {};

    if (!phoneE164 || typeof phoneE164 !== 'string') {
      throw new HttpsError('invalid-argument', 'phoneE164 este obligatoriu.');
    }

    const uid = request.auth.uid;
    const email = request.auth.token?.email || '';

    // Check if user is staff
    const db = admin.firestore();
    const staffDoc = await db.collection('staffProfiles').doc(uid).get();
    const isStaff = staffDoc.exists;

    // If not staff, verify user owns events with this phone
    if (!isStaff) {
      const ownedEvents = await db
        .collection('evenimente')
        .where('phoneE164', '==', phoneE164)
        .where('createdBy', '==', uid)
        .limit(1)
        .get();

      if (ownedEvents.empty) {
        throw new HttpsError(
          'permission-denied',
          'Nu ai permisiunea să accesezi istoricul acestui client.'
        );
      }
    }

    // Get client history
    const events = await getClientHistory(phoneE164);

    return {
      ok: true,
      phoneE164,
      events,
      count: events.length,
    };
  }
);

/**
 * Get AI interpretation history for an event
 *
 * Shows what AI understood and what actions it took
 *
 * Usage:
 * - Staff can view any event
 * - Regular users can only view their own events
 */
exports.getAIInterpretationHistory = onCall(
  { region: 'us-central1', timeoutSeconds: 30 },
  async request => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
    }

    const { eventId } = request.data || {};

    if (!eventId || typeof eventId !== 'string') {
      throw new HttpsError('invalid-argument', 'eventId este obligatoriu.');
    }

    const uid = request.auth.uid;
    const db = admin.firestore();

    // Get event
    const eventDoc = await db.collection('evenimente').doc(eventId).get();

    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Evenimentul nu există.');
    }

    const eventData = eventDoc.data();

    // Check permissions
    const staffDoc = await db.collection('staffProfiles').doc(uid).get();
    const isStaff = staffDoc.exists;
    const isOwner = eventData.createdBy === uid;

    if (!isStaff && !isOwner) {
      throw new HttpsError('permission-denied', 'Nu ai permisiunea să accesezi acest eveniment.');
    }

    // Get event history
    const historySnapshot = await db
      .collection('evenimente')
      .doc(eventId)
      .collection('eventHistory')
      .orderBy('timestamp', 'desc')
      .get();

    const history = historySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter AI-related entries
    const aiHistory = history.filter(h => h.source === 'ai_chat' || h.action === 'AI_PARSE');

    return {
      ok: true,
      eventId,
      eventShortId: eventData.eventShortId,
      date: eventData.date,
      address: eventData.address,
      aiHistory,
      fullHistory: history,
    };
  }
);
