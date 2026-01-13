/**
 * aiEventGateway.js
 *
 * Single callable entrypoint for ALL operational writes to /evenimente.
 * Client MUST NOT write event docs directly.
 *
 * Input:
 * {
 *   sessionId: string,
 *   requestId: string,         // idempotency key (client generated)
 *   op: string,                // createEvent|updateEventPatch|upsertRole|archiveRole|archiveEvent|assignStaffToRole
 *   payload: object
 * }
 */
'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const { getEffectiveConfig } = require('./aiConfigManager');
const aiSessionLogger = require('./aiSessionLogger');
const { normalizeEventFields, normalizeRoleFields, normalizeRoleType } = require('./normalizers');
const { createEvent, addRole, updateRole, archiveRole, archiveEvent } = require('./eventOperations_v3');

const { SUPER_ADMIN_EMAIL } = require('./authGuards');

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
  return { uid: request.auth.uid, email: request.auth.token?.email || '' };
}

async function isEmployee(db, uid, email) {
  if (email === SUPER_ADMIN_EMAIL) return true;
  const staff = await db.collection('staffProfiles').doc(uid).get();
  return staff.exists;
}

function requireString(v, name) {
  const s = (v || '').toString().trim();
  if (!s) throw new HttpsError('invalid-argument', `Lipsește "${name}".`);
  return s;
}

function requireObject(v, name) {
  if (!v || typeof v !== 'object') throw new HttpsError('invalid-argument', `Lipsește "${name}".`);
  return v;
}

async function withIdempotency(db, requestId, handler) {
  const ref = db.collection('ai_idempotency').doc(requestId);
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.status === 'DONE') {
      return { idempotent: true, result: snap.data()?.result || null };
    }
    if (snap.exists && snap.data()?.status === 'IN_PROGRESS') {
      // Best-effort: allow retry to proceed (client can retry later); treat as in-progress.
      throw new HttpsError('resource-exhausted', 'Operațiune în curs. Reîncearcă.');
    }
    tx.set(ref, { status: 'IN_PROGRESS', createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { idempotent: false, result: null };
  }).then(async (gate) => {
    if (gate.idempotent) return gate;
    try {
      const result = await handler();
      await ref.set(
        {
          status: 'DONE',
          endedAt: admin.firestore.FieldValue.serverTimestamp(),
          result,
        },
        { merge: true }
      );
      return { idempotent: false, result };
    } catch (e) {
      await ref.set(
        {
          status: 'ERROR',
          endedAt: admin.firestore.FieldValue.serverTimestamp(),
          error: String(e?.message || e),
        },
        { merge: true }
      );
      throw e;
    }
  });
}

exports.aiEventGateway = onCall(
  { region: 'us-central1', timeoutSeconds: 60 },
  async (request) => {
    const db = admin.firestore();
    const { uid, email } = requireAuth(request);
    if (!(await isEmployee(db, uid, email))) {
      throw new HttpsError('permission-denied', 'Doar angajații pot executa operațiuni pe evenimente.');
    }

    const sessionId = requireString(request.data?.sessionId, 'sessionId');
    const requestId = requireString(request.data?.requestId, 'requestId');
    const op = requireString(request.data?.op, 'op');
    const payload = requireObject(request.data?.payload, 'payload');

    // Ensure ai_session exists
    const { meta: effectiveConfigMeta, effective: effectiveConfig } = await getEffectiveConfig(db, {
      eventId: payload.eventId || payload?.payload?.eventId || null,
    });
    await aiSessionLogger.startSession(db, {
      eventId: payload.eventId || null,
      sessionId,
      actorUid: uid,
      actorEmail: email,
      actionType: `aiEventGateway:${op}`,
      configMeta: effectiveConfigMeta,
    });

    const allowedOps = new Set([
      'createEvent',
      'updateEventPatch',
      'upsertRole',
      'archiveRole',
      'archiveEvent',
      'assignStaffToRole',
    ]);
    if (!allowedOps.has(op)) throw new HttpsError('invalid-argument', `op invalid: ${op}`);

    const exec = async () => {
      if (op === 'createEvent') {
        const event = requireObject(payload.event, 'payload.event');
        const roles = Array.isArray(payload.roles) ? payload.roles : [];

        const normalizedEvent = normalizeEventFields(event);
        const normalizedRoles = roles.map((r) => {
          const nr = normalizeRoleFields(r);
          nr.roleType = normalizeRoleType(nr.roleType) || nr.roleType;
          return nr;
        });

        // Validate against rolesCatalog from effective config (if present)
        const catalogKeys = effectiveConfig?.rolesCatalog ? Object.keys(effectiveConfig.rolesCatalog) : [];
        if (catalogKeys.length) {
          for (const r of normalizedRoles) {
            if (r.roleType && !catalogKeys.includes(r.roleType)) {
              throw new HttpsError('invalid-argument', `Rol invalid (în afara catalogului): ${r.roleType}`);
            }
          }
        }

        const result = await createEvent(
          { ...normalizedEvent, roles: normalizedRoles, clientRequestId: requestId },
          { uid, email, staffCode: null }
        );

        await aiSessionLogger.setEventId(db, { sessionId, eventId: result.id });
        await aiSessionLogger.appendStep(db, {
          sessionId,
          step: { kind: 'execute', op, requestId, status: 'OK', eventId: result.id, eventShortId: result.eventShortId },
        });
        await aiSessionLogger.endSession(db, { sessionId, status: 'DONE', createdEventId: result.id });

        return { ok: true, op, eventId: result.id, eventShortId: result.eventShortId };
      }

      if (op === 'updateEventPatch') {
        const eventId = requireString(payload.eventId, 'payload.eventId');
        const patch = requireObject(payload.patch, 'payload.patch');
        const normalized = normalizeEventFields(patch);

        const allowed = {};
        if (normalized.date) allowed.date = normalized.date;
        if (normalized.dateKey) allowed.dateKey = normalized.dateKey;
        if (normalized.address) allowed.address = normalized.address;
        if (normalized.phoneE164) allowed.phoneE164 = normalized.phoneE164;
        if (normalized.phoneRaw) allowed.phoneRaw = normalized.phoneRaw;
        if (normalized.childName !== undefined) allowed.childName = normalized.childName;
        if (normalized.childAge !== undefined) allowed.childAge = normalized.childAge;
        if (normalized.childDob !== undefined) allowed.childDob = normalized.childDob;

        allowed.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        allowed.updatedBy = uid;
        allowed.updatedByEmail = email;

        await db.collection('evenimente').doc(eventId).update(allowed);
        await db.collection('evenimente').doc(eventId).collection('history').add({
          type: 'DATA_CHANGE',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          action: 'UPDATE_EVENT_PATCH',
          before: {},
          after: allowed,
          sourceMessageIds: [],
        });

        await aiSessionLogger.setEventId(db, { sessionId, eventId });
        await aiSessionLogger.appendStep(db, { sessionId, step: { kind: 'execute', op, requestId, status: 'OK', eventId, patch: allowed } });
        await aiSessionLogger.endSession(db, { sessionId, status: 'DONE' });

        return { ok: true, op, eventId };
      }

      if (op === 'upsertRole') {
        const eventId = requireString(payload.eventId, 'payload.eventId');
        const slot = payload.slot ? String(payload.slot) : null;

        if (!slot) {
          const role = requireObject(payload.role, 'payload.role');
          const normalizedRole = normalizeRoleFields(role);
          normalizedRole.roleType = normalizeRoleType(normalizedRole.roleType) || normalizedRole.roleType;

          const result = await addRole(eventId, normalizedRole, { uid, email, staffCode: null });
          await aiSessionLogger.setEventId(db, { sessionId, eventId });
          await aiSessionLogger.appendStep(db, { sessionId, step: { kind: 'execute', op, requestId, status: 'OK', eventId, role: result } });
          await aiSessionLogger.endSession(db, { sessionId, status: 'DONE' });
          return { ok: true, op, eventId, role: result };
        }

        const rolePatch = requireObject(payload.rolePatch || payload.role, 'payload.rolePatch');
        const normalizedPatch = normalizeRoleFields(rolePatch);
        const result = await updateRole(eventId, slot, normalizedPatch, { uid, email, staffCode: null });

        await aiSessionLogger.setEventId(db, { sessionId, eventId });
        await aiSessionLogger.appendStep(db, { sessionId, step: { kind: 'execute', op, requestId, status: 'OK', eventId, slot, role: result } });
        await aiSessionLogger.endSession(db, { sessionId, status: 'DONE' });
        return { ok: true, op, eventId, slot, role: result };
      }

      if (op === 'archiveRole') {
        const eventId = requireString(payload.eventId, 'payload.eventId');
        const slot = requireString(payload.slot, 'payload.slot');
        const reason = payload.reason ? String(payload.reason) : null;
        const result = await archiveRole(eventId, slot, reason, { uid, email, staffCode: null });
        await aiSessionLogger.setEventId(db, { sessionId, eventId });
        await aiSessionLogger.appendStep(db, { sessionId, step: { kind: 'execute', op, requestId, status: 'OK', eventId, slot } });
        await aiSessionLogger.endSession(db, { sessionId, status: 'DONE' });
        return { ok: true, op, eventId, slot, role: result };
      }

      if (op === 'archiveEvent') {
        const eventId = requireString(payload.eventId, 'payload.eventId');
        const isArchived = payload.isArchived !== false;
        const reason = payload.reason ? String(payload.reason) : null;

        if (isArchived) {
          await archiveEvent(eventId, reason, { uid, email, staffCode: null });
        } else {
          // Unarchive (manual, since eventOperations_v3 only archives)
          await db.collection('evenimente').doc(eventId).update({
            isArchived: false,
            unarchivedAt: admin.firestore.FieldValue.serverTimestamp(),
            unarchivedBy: uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: uid,
          });
          await db.collection('evenimente').doc(eventId).collection('history').add({
            type: 'DATA_CHANGE',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            action: 'UNARCHIVE_EVENT',
            before: { isArchived: true },
            after: { isArchived: false },
            sourceMessageIds: [],
          });
        }

        await aiSessionLogger.setEventId(db, { sessionId, eventId });
        await aiSessionLogger.appendStep(db, { sessionId, step: { kind: 'execute', op, requestId, status: 'OK', eventId, isArchived } });
        await aiSessionLogger.endSession(db, { sessionId, status: 'DONE' });
        return { ok: true, op, eventId, isArchived };
      }

      if (op === 'assignStaffToRole') {
        const eventId = requireString(payload.eventId, 'payload.eventId');
        const slot = requireString(payload.slot, 'payload.slot');
        const action = requireString(payload.action, 'payload.action').toUpperCase();
        const code = payload.code ? String(payload.code).toUpperCase() : null;

        await db.runTransaction(async (tx) => {
          const ref = db.collection('evenimente').doc(eventId);
          const snap = await tx.get(ref);
          if (!snap.exists) throw new HttpsError('not-found', 'Evenimentul nu există.');
          const ev = snap.data() || {};
          const rolesBySlot = ev.rolesBySlot || {};
          if (!rolesBySlot[slot]) throw new HttpsError('not-found', `Rolul ${slot} nu există.`);

          const role = { ...(rolesBySlot[slot] || {}) };
          if (action === 'PENDING') {
            if (!code) throw new HttpsError('invalid-argument', 'code este necesar pentru PENDING');
            role.pendingCode = code;
          } else if (action === 'ACCEPT') {
            role.assignedCode = role.pendingCode || role.assignedCode || null;
            role.pendingCode = null;
            role.status = 'ASSIGNED';
          } else if (action === 'REJECT') {
            role.pendingCode = null;
          } else if (action === 'UNASSIGN') {
            role.assignedCode = null;
            role.pendingCode = null;
          } else {
            throw new HttpsError('invalid-argument', `assignStaffToRole action invalid: ${action}`);
          }

          rolesBySlot[slot] = role;
          tx.update(ref, {
            rolesBySlot,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: uid,
          });
        });

        await db.collection('evenimente').doc(eventId).collection('history').add({
          type: 'DATA_CHANGE',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          action: 'ASSIGN_STAFF_TO_ROLE',
          roleSlots: [slot],
          after: { slot, action, code },
          sourceMessageIds: [],
        });

        await aiSessionLogger.setEventId(db, { sessionId, eventId });
        await aiSessionLogger.appendStep(db, { sessionId, step: { kind: 'execute', op, requestId, status: 'OK', eventId, slot, action, code } });
        await aiSessionLogger.endSession(db, { sessionId, status: 'DONE' });
        return { ok: true, op, eventId, slot, action };
      }

      throw new HttpsError('invalid-argument', `op unsupported: ${op}`);
    };

    const gate = await withIdempotency(db, requestId, exec);
    return gate.idempotent ? { ok: true, idempotent: true, result: gate.result } : gate.result;
  }
);

