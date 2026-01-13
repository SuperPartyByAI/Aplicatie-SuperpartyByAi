/**
 * aiSessionLogger.js
 *
 * Server-only (Admin SDK) logger for AI event sessions.
 *
 * Storage:
 * - /evenimente/{eventId}/ai_sessions/{sessionId}
 *   - /messages/{msgId}
 *   - /steps/{stepId}
 *
 * For CREATE where eventId is not known yet:
 * - /ai_temp_sessions/{sessionId}
 *   - /messages/{msgId}
 *   - /steps/{stepId}
 *
 * NOTE: Firestore rules deny client writes; Admin SDK bypasses rules.
 */
'use strict';

const admin = require('firebase-admin');

function _ts() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function _sessionDocRef(db, eventId, sessionId) {
  return db.collection('evenimente').doc(eventId).collection('ai_sessions').doc(sessionId);
}

function _tempSessionDocRef(db, sessionId) {
  return db.collection('ai_temp_sessions').doc(sessionId);
}

async function startSession(db, { eventId = null, sessionId, actorUid, actorEmail, actionType, configMeta }) {
  const ref = eventId ? _sessionDocRef(db, eventId, sessionId) : _tempSessionDocRef(db, sessionId);
  await ref.set(
    {
      sessionId,
      eventId: eventId || null,
      actorUid: actorUid || null,
      actorEmail: actorEmail || null,
      actionType: actionType || null,
      configMeta: configMeta || null,
      status: 'ACTIVE',
      startedAt: _ts(),
      endedAt: null,
      createdEventId: null,
      error: null,
    },
    { merge: true }
  );
  return ref;
}

async function appendMessage(db, { eventId = null, sessionId, role, text, extra = null }) {
  const baseRef = eventId ? _sessionDocRef(db, eventId, sessionId) : _tempSessionDocRef(db, sessionId);
  const msgRef = baseRef.collection('messages').doc();
  await msgRef.set({
    role: role || 'unknown',
    text: (text || '').toString(),
    extra: extra || null,
    createdAt: _ts(),
  });
}

async function appendStep(db, { eventId = null, sessionId, step }) {
  const baseRef = eventId ? _sessionDocRef(db, eventId, sessionId) : _tempSessionDocRef(db, sessionId);
  const stepRef = baseRef.collection('steps').doc();
  await stepRef.set({
    ...(step || {}),
    createdAt: _ts(),
  });
}

async function endSession(db, { eventId = null, sessionId, status, createdEventId = null, error = null }) {
  const ref = eventId ? _sessionDocRef(db, eventId, sessionId) : _tempSessionDocRef(db, sessionId);
  await ref.set(
    {
      status: status || 'DONE',
      endedAt: _ts(),
      createdEventId: createdEventId || null,
      error: error || null,
    },
    { merge: true }
  );
}

async function attachTempSessionToEvent(db, { sessionId, eventId }) {
  const tempRef = _tempSessionDocRef(db, sessionId);
  const tempSnap = await tempRef.get();
  if (!tempSnap.exists) return;

  const dstRef = _sessionDocRef(db, eventId, sessionId);

  // Copy root doc
  await dstRef.set(
    {
      ...tempSnap.data(),
      eventId,
    },
    { merge: true }
  );

  // Copy subcollections (messages + steps)
  const [msgsSnap, stepsSnap] = await Promise.all([tempRef.collection('messages').get(), tempRef.collection('steps').get()]);

  const batch = db.batch();

  msgsSnap.docs.forEach(d => batch.set(dstRef.collection('messages').doc(d.id), d.data(), { merge: true }));
  stepsSnap.docs.forEach(d => batch.set(dstRef.collection('steps').doc(d.id), d.data(), { merge: true }));

  await batch.commit();

  // Best-effort cleanup (optional). Keep for forensic if delete fails.
  // NOTE: subcollection deletes are not atomic; this is production-safe as "leak" is acceptable.
  await tempRef.set({ migratedToEventId: eventId, migratedAt: _ts() }, { merge: true });
}

module.exports = {
  startSession,
  appendMessage,
  appendStep,
  endSession,
  attachTempSessionToEvent,
};

