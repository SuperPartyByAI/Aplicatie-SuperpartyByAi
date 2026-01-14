import * as admin from 'firebase-admin';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';

import { assertAdmin } from './admin';

setGlobalOptions({ region: 'us-central1' });

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function assertAuthed(request: CallableRequest): { uid: string; email: string } {
  const uid = request.auth?.uid;
  const email = (request.auth?.token?.email as string | undefined) ?? '';
  if (!uid) throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
  return { uid, email };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateTeamId(teamId: unknown): string {
  if (!isNonEmptyString(teamId)) {
    throw new HttpsError('invalid-argument', 'teamId este obligatoriu.');
  }
  return teamId.trim();
}

function validateUid(inputUid: unknown): string {
  if (!isNonEmptyString(inputUid)) {
    throw new HttpsError('invalid-argument', 'uid este obligatoriu.');
  }
  return inputUid.trim();
}

function validatePhone(phone: unknown): string {
  if (!isNonEmptyString(phone)) {
    throw new HttpsError('invalid-argument', 'Telefonul este obligatoriu.');
  }
  const p = phone.trim();
  if (!/^\+40\d{9}$/.test(p)) {
    throw new HttpsError('invalid-argument', 'Numărul de telefon nu este valid (format RO: +40XXXXXXXXX).');
  }
  return p;
}

function parseAssignedCode(code: string): { prefix: string; number: number } {
  const m = /^([A-Za-z]+)?(\d+)$/.exec(code.trim());
  if (!m) throw new HttpsError('invalid-argument', 'assignedCode invalid.');
  const prefix = (m[1] ?? '').trim();
  const number = Number(m[2]);
  if (!Number.isInteger(number)) throw new HttpsError('invalid-argument', 'assignedCode invalid.');
  return { prefix, number };
}

function pickHighestFreeCode(freeCodes: unknown): number {
  if (!Array.isArray(freeCodes) || freeCodes.length === 0) {
    throw new HttpsError('resource-exhausted', 'Nu mai există coduri disponibile pentru această echipă.');
  }
  const nums = freeCodes
    .map(v => (typeof v === 'number' ? v : Number(v)))
    .filter(n => Number.isFinite(n))
    .map(n => Math.trunc(n));
  if (nums.length === 0) {
    throw new HttpsError('resource-exhausted', 'Nu mai există coduri disponibile pentru această echipă.');
  }
  nums.sort((a, b) => b - a);
  return nums[0];
}

async function assertKycDone(uid: string, emailFallback: string) {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.data() ?? {};
  const kycDone = data.kycDone === true;
  const kycFullName = (data.kycData?.fullName as string | undefined)?.trim() ?? '';
  const displayName = (data.displayName as string | undefined)?.trim() ?? '';
  const fullName = kycFullName || displayName || emailFallback;

  if (!kycDone && !kycFullName) {
    throw new HttpsError('failed-precondition', 'KYC nu este complet. Completează KYC și revino.');
  }
  return { userDoc: data, fullName };
}

async function assertStaffNotSetup(uid: string) {
  const snap = await db.collection('staffProfiles').doc(uid).get();
  const data = snap.data() ?? {};
  if (data.setupDone === true) {
    throw new HttpsError('failed-precondition', 'Profilul staff este deja configurat. Echipa poate fi schimbată doar din Admin.');
  }
  return data;
}

export const allocateStaffCode = onCall(
  { region: 'us-central1', memory: '256MiB' },
  async request => {
    const { uid, email } = assertAuthed(request);
    const teamId = validateTeamId((request.data as any)?.teamId);
    const prevTeamIdRaw = (request.data as any)?.prevTeamId;
    const prevCodeNumberRaw = (request.data as any)?.prevCodeNumber;

    // Enforce KYC + setup state server-side
    await assertKycDone(uid, email);
    await assertStaffNotSetup(uid);

    const prevTeamId = isNonEmptyString(prevTeamIdRaw) ? prevTeamIdRaw.trim() : '';
    const prevCodeNumber =
      typeof prevCodeNumberRaw === 'number' && Number.isInteger(prevCodeNumberRaw) ? prevCodeNumberRaw : undefined;

    // If same team and we have a previous temp allocation, treat as no-op.
    if (prevTeamId && prevTeamId === teamId && prevCodeNumber != null) {
      const poolSnap = await db.collection('teamCodePools').doc(teamId).get();
      const prefix = (poolSnap.data()?.prefix as string | undefined)?.trim() ?? '';
      return { teamId, prefix, number: prevCodeNumber, assignedCode: `${prefix}${prevCodeNumber}` };
    }

    const newPoolRef = db.collection('teamCodePools').doc(teamId);
    const newAssignRef = db.collection('teamAssignments').doc(`${teamId}_${uid}`);
    const historyRef = db.collection('teamAssignmentsHistory').doc();

    const oldPoolRef = prevTeamId ? db.collection('teamCodePools').doc(prevTeamId) : null;
    const oldAssignRef = prevTeamId ? db.collection('teamAssignments').doc(`${prevTeamId}_${uid}`) : null;

    return db.runTransaction(async tx => {
      const newPoolSnap = await tx.get(newPoolRef);
      if (!newPoolSnap.exists) {
        throw new HttpsError('not-found', 'Nu există pool de coduri pentru echipa selectată.');
      }

      const existingAssignSnap = await tx.get(newAssignRef);

      const newPool = newPoolSnap.data() ?? {};
      const prefix = (newPool.prefix as string | undefined)?.trim() ?? '';
      const freeCodes: unknown = newPool.freeCodes;
      const picked = pickHighestFreeCode(freeCodes);

      // Update new pool (remove picked)
      const remaining = (Array.isArray(freeCodes) ? freeCodes : [])
        .filter(v => Math.trunc(Number(v)) !== picked);
      tx.set(
        newPoolRef,
        { freeCodes: remaining, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );

      // Release previous code (if provided) back to old pool (only if missing)
      if (oldPoolRef && oldAssignRef && prevCodeNumber != null) {
        const oldPoolSnap = await tx.get(oldPoolRef);
        if (oldPoolSnap.exists) {
          const oldPool = oldPoolSnap.data() ?? {};
          const oldFree = Array.isArray(oldPool.freeCodes) ? oldPool.freeCodes : [];
          const exists = oldFree.some(v => Math.trunc(Number(v)) === prevCodeNumber);
          const updated = exists ? oldFree : [...oldFree, prevCodeNumber];
          tx.set(
            oldPoolRef,
            { freeCodes: updated, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true },
          );
        }
        tx.delete(oldAssignRef);
      }

      // Write assignment
      tx.set(
        newAssignRef,
        {
          teamId,
          uid,
          code: picked,
          prefix,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(existingAssignSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        },
        { merge: true },
      );

      // Preserve history for reallocations
      if (prevTeamId && prevCodeNumber != null) {
        tx.set(historyRef, {
          uid,
          fromTeamId: prevTeamId,
          toTeamId: teamId,
          releasedCode: prevCodeNumber,
          newCode: picked,
          newPrefix: prefix,
          at: admin.firestore.FieldValue.serverTimestamp(),
          actorUid: uid,
          actorRole: 'staff',
        });
      }

      return { teamId, prefix, number: picked, assignedCode: `${prefix}${picked}` };
    });
  },
);

export const finalizeStaffSetup = onCall(
  { region: 'us-central1', memory: '256MiB' },
  async request => {
    const { uid, email } = assertAuthed(request);
    const teamId = validateTeamId((request.data as any)?.teamId);
    const assignedCodeRaw = (request.data as any)?.assignedCode;
    const phone = validatePhone((request.data as any)?.phone);

    const assignedCode = isNonEmptyString(assignedCodeRaw) ? assignedCodeRaw.trim() : '';
    if (!assignedCode) {
      throw new HttpsError('invalid-argument', 'assignedCode este obligatoriu.');
    }

    // KYC + setup enforcement
    const { fullName } = await assertKycDone(uid, email);
    const staffExisting = await assertStaffNotSetup(uid);

    const parsed = parseAssignedCode(assignedCode);
    const assignRef = db.collection('teamAssignments').doc(`${teamId}_${uid}`);
    const assignSnap = await assignRef.get();
    if (!assignSnap.exists) {
      throw new HttpsError('failed-precondition', 'Nu există o alocare validă pentru această echipă.');
    }

    const assign = assignSnap.data() ?? {};
    const code = assign.code;
    const prefix = (assign.prefix as string | undefined)?.trim() ?? '';
    if (Math.trunc(Number(code)) !== parsed.number) {
      throw new HttpsError('failed-precondition', 'Codul alocat nu corespunde. Reîncearcă alocarea.');
    }
    if (prefix !== parsed.prefix) {
      throw new HttpsError('failed-precondition', 'Prefixul codului nu corespunde. Reîncearcă alocarea.');
    }

    const staffRef = db.collection('staffProfiles').doc(uid);
    const userRef = db.collection('users').doc(uid);

    const now = admin.firestore.FieldValue.serverTimestamp();
    await staffRef.set(
      {
        uid,
        email,
        nume: fullName,
        phone,
        teamId,
        assignedCode,
        codIdentificare: assignedCode,
        ceCodAi: assignedCode,
        cineNoteaza: assignedCode,
        setupDone: true,
        source: 'flutter',
        updatedAt: now,
        createdAt: staffExisting.createdAt ?? now,
      },
      { merge: true },
    );

    await userRef.set(
      {
        staffSetupDone: true,
        phone,
        updatedAt: now,
      },
      { merge: true },
    );

    return provideOk();
  },
);

export const updateStaffPhone = onCall(
  { region: 'us-central1', memory: '256MiB' },
  async request => {
    const { uid } = assertAuthed(request);
    const phone = validatePhone((request.data as any)?.phone);

    const staffRef = db.collection('staffProfiles').doc(uid);
    const userRef = db.collection('users').doc(uid);
    const now = admin.firestore.FieldValue.serverTimestamp();

    await staffRef.set({ phone, updatedAt: now }, { merge: true });
    await userRef.set({ phone, updatedAt: now }, { merge: true });
    return provideOk();
  },
);

export const changeUserTeam = onCall(
  { region: 'us-central1', memory: '512MiB' },
  async request => {
    const { actorUid, actorRole } = await assertAdmin(db, request);
    const uid = validateUid((request.data as any)?.uid);
    const newTeamId = validateTeamId((request.data as any)?.newTeamId);
    const forceReallocate = (request.data as any)?.forceReallocate === true;

    const staffRef = db.collection('staffProfiles').doc(uid);
    const staffSnap = await staffRef.get();
    if (!staffSnap.exists) {
      throw new HttpsError('not-found', 'Staff profile nu există.');
    }
    const staff = staffSnap.data() ?? {};
    const oldTeamId = (staff.teamId as string | undefined)?.trim() ?? '';
    const oldAssigned = (staff.assignedCode as string | undefined)?.trim() ?? (staff.codIdentificare as string | undefined)?.trim() ?? '';

    if (oldTeamId === newTeamId && !forceReallocate) {
      return provideOk({ assignedCode: oldAssigned, teamId: oldTeamId });
    }

    const oldParsed = oldAssigned ? parseAssignedCode(oldAssigned) : null;

    const oldPoolRef = oldTeamId ? db.collection('teamCodePools').doc(oldTeamId) : null;
    const oldAssignRef = oldTeamId ? db.collection('teamAssignments').doc(`${oldTeamId}_${uid}`) : null;
    const newPoolRef = db.collection('teamCodePools').doc(newTeamId);
    const newAssignRef = db.collection('teamAssignments').doc(`${newTeamId}_${uid}`);
    const historyRef = db.collection('teamAssignmentsHistory').doc();
    const adminActionRef = db.collection('adminActions').doc();

    return db.runTransaction(async tx => {
      const newPoolSnap = await tx.get(newPoolRef);
      if (!newPoolSnap.exists) {
        throw new HttpsError('not-found', 'Nu există pool de coduri pentru echipa selectată.');
      }
      const existingAssignSnap = await tx.get(newAssignRef);
      const newPool = newPoolSnap.data() ?? {};
      const newPrefix = (newPool.prefix as string | undefined)?.trim() ?? '';
      const freeCodes: unknown = newPool.freeCodes;

      // IMPORTANT: when re-allocating in the SAME team, do not pick the same code again.
      // We also must not lose the "returned" old code when writing the new pool.
      const sameTeam = oldTeamId === newTeamId;
      const oldNumber = oldParsed?.number;
      const baseFree = (Array.isArray(freeCodes) ? freeCodes : []).map(v => Math.trunc(Number(v)));
      const candidateFree = sameTeam && oldNumber != null ? baseFree.filter(n => n !== oldNumber) : baseFree;

      if (sameTeam && oldNumber != null && candidateFree.length == 0) {
        throw new HttpsError('resource-exhausted', 'Nu există un alt cod disponibil în această echipă.');
      }

      const picked = pickHighestFreeCode(candidateFree);

      // Build final new freeCodes:
      // - ensure old code is returned (only once) when sameTeam OR changing teams
      // - remove the picked code
      let newFreeNext = baseFree.filter(n => n !== picked);
      if (sameTeam && oldNumber != null && !newFreeNext.includes(oldNumber)) {
        newFreeNext = [...newFreeNext, oldNumber];
      }

      // Return old code to old pool (if present), ONLY when changing teams.
      // For same-team reallocation, we already merged it into newFreeNext above.
      if (!sameTeam && oldPoolRef && oldParsed && oldAssignRef) {
        const oldPoolSnap = await tx.get(oldPoolRef);
        if (oldPoolSnap.exists) {
          const oldPool = oldPoolSnap.data() ?? {};
          const oldFree = Array.isArray(oldPool.freeCodes) ? oldPool.freeCodes : [];
          const exists = oldFree.some(v => Math.trunc(Number(v)) === oldParsed.number);
          const updated = exists ? oldFree : [...oldFree, oldParsed.number];
          tx.set(oldPoolRef, { freeCodes: updated, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
        tx.delete(oldAssignRef);
      }

      // Always delete old assignment doc (even same team) before writing new one.
      if (oldAssignRef) {
        tx.delete(oldAssignRef);
      }

      // Update new pool (atomic)
      tx.set(newPoolRef, { freeCodes: newFreeNext, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

      // Write new assignment
      tx.set(
        newAssignRef,
        {
          teamId: newTeamId,
          uid,
          code: picked,
          prefix: newPrefix,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(existingAssignSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        },
        { merge: true },
      );

      const newAssignedCode = `${newPrefix}${picked}`;

      // Update staff profile
      tx.set(
        staffRef,
        {
          teamId: newTeamId,
          assignedCode: newAssignedCode,
          codIdentificare: newAssignedCode,
          ceCodAi: newAssignedCode,
          cineNoteaza: newAssignedCode,
          setupDone: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // History + audit
      tx.set(historyRef, {
        uid,
        fromTeamId: oldTeamId || null,
        toTeamId: newTeamId,
        releasedCode: oldParsed?.number ?? null,
        newCode: picked,
        newPrefix,
        at: admin.firestore.FieldValue.serverTimestamp(),
        actorUid,
        actorRole,
      });

      tx.set(adminActionRef, {
        action: 'changeUserTeam',
        targetUid: uid,
        fromTeamId: oldTeamId || null,
        toTeamId: newTeamId,
        releasedCode: oldParsed?.number ?? null,
        newCode: picked,
        newPrefix,
        actorUid,
        actorRole,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { teamId: newTeamId, prefix: newPrefix, number: picked, assignedCode: newAssignedCode };
    });
  },
);

export const setUserStatus = onCall(
  { region: 'us-central1', memory: '256MiB' },
  async request => {
    const { actorUid, actorRole } = await assertAdmin(db, request);
    const uid = validateUid((request.data as any)?.uid);
    const status = (request.data as any)?.status;
    const allowed = new Set(['active', 'inactive', 'blocked']);
    if (!isNonEmptyString(status) || !allowed.has(status)) {
      throw new HttpsError('invalid-argument', 'Status invalid. Folosește: active | inactive | blocked');
    }

    const userRef = db.collection('users').doc(uid);
    const adminActionRef = db.collection('adminActions').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    await userRef.set({ status, updatedAt: now }, { merge: true });
    await adminActionRef.set({
      action: 'setUserStatus',
      targetUid: uid,
      status,
      actorUid,
      actorRole,
      at: now,
    });

    return provideOk();
  },
);

function provideOk(extra?: Record<string, unknown>) {
  return { ok: true, ...(extra ?? {}) };
}

