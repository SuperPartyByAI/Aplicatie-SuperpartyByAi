/**
 * aiSessionLogger.js
 *
 * Server-only (Admin SDK) logger for AI event sessions.
 *
 * Storage:
 * - /ai_sessions/{sessionId}
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

function _sessionDocRef(db, sessionId) {
  return db.collection('ai_sessions').doc(sessionId);
}

async function startSession(db, { eventId = null, sessionId, actorUid, actorEmail, actionType, configMeta }) {
  const ref = _sessionDocRef(db, sessionId);
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
      extractedDraft: null,
      decidedOps: null,
      validationErrors: null,
    },
    { merge: true }
  );
  return ref;
}

async function appendMessage(db, { sessionId, role, text, extra = null }) {
  const baseRef = _sessionDocRef(db, sessionId);
  const msgRef = baseRef.collection('messages').doc();
  await msgRef.set({
    role: role || 'unknown',
    text: (text || '').toString(),
    extra: extra || null,
    createdAt: _ts(),
  });
}

async function appendStep(db, { sessionId, step }) {
  const baseRef = _sessionDocRef(db, sessionId);
  const stepRef = baseRef.collection('steps').doc();
  await stepRef.set({
    ...(step || {}),
    createdAt: _ts(),
  });
}

async function endSession(db, { sessionId, status, createdEventId = null, error = null }) {
  const ref = _sessionDocRef(db, sessionId);
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

async function setEventId(db, { sessionId, eventId }) {
  const ref = _sessionDocRef(db, sessionId);
  await ref.set({ eventId: eventId || null }, { merge: true });
}

async function setExtractedDraft(db, { sessionId, extractedDraft }) {
  const ref = _sessionDocRef(db, sessionId);
  await ref.set({ extractedDraft: extractedDraft || null }, { merge: true });
}

async function setDecidedOps(db, { sessionId, decidedOps, validationErrors = null }) {
  const ref = _sessionDocRef(db, sessionId);
  await ref.set(
    {
      decidedOps: decidedOps || null,
      validationErrors: validationErrors || null,
    },
    { merge: true }
  );
}

module.exports = {
  startSession,
  appendMessage,
  appendStep,
  endSession,
  setEventId,
  setExtractedDraft,
  setDecidedOps,
};

