const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { onCall } = require('firebase-functions/v2/https');
const { applyChangeWithAudit } = require('./v3Operations');

// Super admin email with full access
const SUPER_ADMIN_EMAIL = 'ursache.andrei1995@gmail.com';

// Check if user is super admin
function requireSuperAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
  }

  const email = request.auth.token?.email || '';
  if (email !== SUPER_ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Doar super admin poate accesa această funcție.');
  }

  return {
    uid: request.auth.uid,
    email,
  };
}

/**
 * Admin Correction: Apply manual correction to event with full audit trail
 *
 * Usage:
 * - Super admin only
 * - Requires eventId, changes, reason
 * - Creates audit entry with ADMIN_CORRECTION type
 *
 * Example:
 * {
 *   eventId: "abc123",
 *   changes: { date: "15-01-2026", address: "New Address" },
 *   reason: "Client requested date change"
 * }
 */
exports.adminCorrection = onCall({ region: 'us-central1', timeoutSeconds: 30 }, async request => {
  const { uid, email } = requireSuperAdmin(request);

  const { eventId, changes, reason } = request.data || {};

  if (!eventId || typeof eventId !== 'string') {
    throw new HttpsError('invalid-argument', 'eventId este obligatoriu.');
  }

  if (!changes || typeof changes !== 'object') {
    throw new HttpsError('invalid-argument', 'changes este obligatoriu.');
  }

  if (!reason || typeof reason !== 'string') {
    throw new HttpsError('invalid-argument', 'reason este obligatoriu.');
  }

  const db = admin.firestore();
  const eventDoc = await db.collection('evenimente').doc(eventId).get();

  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Evenimentul nu există.');
  }

  // Apply correction with audit trail
  const userContext = { uid, email };
  const metadata = {
    source: 'admin_correction',
    action: 'ADMIN_CORRECTION',
    reason,
  };

  await applyChangeWithAudit(eventId, changes, userContext, metadata);

  return {
    ok: true,
    eventId,
    message: 'Corecție aplicată cu succes.',
  };
});

/**
 * Create Global Rule: Add AI parsing rule
 *
 * Usage:
 * - Super admin only
 * - Requires pattern, action, priority
 *
 * Example:
 * {
 *   pattern: "anulare|cancel",
 *   action: "ARCHIVE",
 *   priority: 10,
 *   description: "Auto-archive on cancellation keywords"
 * }
 */
exports.createGlobalRule = onCall({ region: 'us-central1', timeoutSeconds: 30 }, async request => {
  const { uid, email } = requireSuperAdmin(request);

  const { pattern, action, priority, description } = request.data || {};

  if (!pattern || typeof pattern !== 'string') {
    throw new HttpsError('invalid-argument', 'pattern este obligatoriu.');
  }

  if (!action || typeof action !== 'string') {
    throw new HttpsError('invalid-argument', 'action este obligatoriu.');
  }

  const validActions = ['CREATE', 'UPDATE', 'ARCHIVE', 'UNARCHIVE', 'ASK_INFO', 'NONE'];
  if (!validActions.includes(action)) {
    throw new HttpsError(
      'invalid-argument',
      `action trebuie să fie unul din: ${validActions.join(', ')}`
    );
  }

  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const ruleData = {
    pattern,
    action,
    priority: Number.isFinite(Number(priority)) ? Number(priority) : 0,
    description: description || '',
    isActive: true,
    createdAt: now,
    createdBy: uid,
    createdByEmail: email,
    updatedAt: now,
    updatedBy: uid,
  };

  const ref = await db.collection('ai_global_rules').add(ruleData);

  return {
    ok: true,
    ruleId: ref.id,
    message: 'Regulă globală creată cu succes.',
  };
});

/**
 * Update Global Rule: Modify existing rule
 *
 * Usage:
 * - Super admin only
 * - Requires ruleId
 * - Optional: pattern, action, priority, description, isActive
 */
exports.updateGlobalRule = onCall({ region: 'us-central1', timeoutSeconds: 30 }, async request => {
  const { uid, email } = requireSuperAdmin(request);

  const { ruleId, pattern, action, priority, description, isActive } = request.data || {};

  if (!ruleId || typeof ruleId !== 'string') {
    throw new HttpsError('invalid-argument', 'ruleId este obligatoriu.');
  }

  const db = admin.firestore();
  const ruleDoc = await db.collection('ai_global_rules').doc(ruleId).get();

  if (!ruleDoc.exists) {
    throw new HttpsError('not-found', 'Regula nu există.');
  }

  const updates = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: uid,
  };

  if (pattern !== undefined) updates.pattern = String(pattern);
  if (action !== undefined) {
    const validActions = ['CREATE', 'UPDATE', 'ARCHIVE', 'UNARCHIVE', 'ASK_INFO', 'NONE'];
    if (!validActions.includes(action)) {
      throw new HttpsError(
        'invalid-argument',
        `action trebuie să fie unul din: ${validActions.join(', ')}`
      );
    }
    updates.action = action;
  }
  if (priority !== undefined) updates.priority = Number(priority);
  if (description !== undefined) updates.description = String(description);
  if (isActive !== undefined) updates.isActive = Boolean(isActive);

  await db.collection('ai_global_rules').doc(ruleId).update(updates);

  return {
    ok: true,
    ruleId,
    message: 'Regulă globală actualizată cu succes.',
  };
});

/**
 * Delete Global Rule: Remove rule
 *
 * Usage:
 * - Super admin only
 * - Requires ruleId
 */
exports.deleteGlobalRule = onCall({ region: 'us-central1', timeoutSeconds: 30 }, async request => {
  const { uid, email } = requireSuperAdmin(request);

  const { ruleId } = request.data || {};

  if (!ruleId || typeof ruleId !== 'string') {
    throw new HttpsError('invalid-argument', 'ruleId este obligatoriu.');
  }

  const db = admin.firestore();
  const ruleDoc = await db.collection('ai_global_rules').doc(ruleId).get();

  if (!ruleDoc.exists) {
    throw new HttpsError('not-found', 'Regula nu există.');
  }

  await db.collection('ai_global_rules').doc(ruleId).delete();

  return {
    ok: true,
    ruleId,
    message: 'Regulă globală ștearsă cu succes.',
  };
});

/**
 * List Global Rules: Get all rules
 *
 * Usage:
 * - Super admin only
 * - Returns all rules sorted by priority (desc)
 */
exports.listGlobalRules = onCall({ region: 'us-central1', timeoutSeconds: 30 }, async request => {
  requireSuperAdmin(request);

  const db = admin.firestore();
  const snapshot = await db
    .collection('ai_global_rules')
    .orderBy('priority', 'desc')
    .orderBy('createdAt', 'desc')
    .get();

  const rules = [];
  snapshot.forEach(doc => {
    rules.push({
      id: doc.id,
      ...doc.data(),
    });
  });

  return {
    ok: true,
    rules,
    count: rules.length,
  };
});
