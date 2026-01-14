"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUserStatus = exports.changeUserTeam = exports.updateStaffPhone = exports.finalizeStaffSetup = exports.allocateStaffCode = void 0;
const admin = __importStar(require("firebase-admin"));
const v2_1 = require("firebase-functions/v2");
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("./admin");
(0, v2_1.setGlobalOptions)({ region: 'us-central1' });
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
function assertAuthed(request) {
    const uid = request.auth?.uid;
    const email = request.auth?.token?.email ?? '';
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
    return { uid, email };
}
function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}
function validateTeamId(teamId) {
    if (!isNonEmptyString(teamId)) {
        throw new https_1.HttpsError('invalid-argument', 'teamId este obligatoriu.');
    }
    return teamId.trim();
}
function validateUid(inputUid) {
    if (!isNonEmptyString(inputUid)) {
        throw new https_1.HttpsError('invalid-argument', 'uid este obligatoriu.');
    }
    return inputUid.trim();
}
function validatePhone(phone) {
    if (!isNonEmptyString(phone)) {
        throw new https_1.HttpsError('invalid-argument', 'Telefonul este obligatoriu.');
    }
    const p = phone.trim();
    if (!/^\+40\d{9}$/.test(p)) {
        throw new https_1.HttpsError('invalid-argument', 'Numărul de telefon nu este valid (format RO: +40XXXXXXXXX).');
    }
    return p;
}
function parseAssignedCode(code) {
    const m = /^([A-Za-z]+)?(\d+)$/.exec(code.trim());
    if (!m)
        throw new https_1.HttpsError('invalid-argument', 'assignedCode invalid.');
    const prefix = (m[1] ?? '').trim();
    const number = Number(m[2]);
    if (!Number.isInteger(number))
        throw new https_1.HttpsError('invalid-argument', 'assignedCode invalid.');
    return { prefix, number };
}
function pickHighestFreeCode(freeCodes) {
    if (!Array.isArray(freeCodes) || freeCodes.length === 0) {
        throw new https_1.HttpsError('resource-exhausted', 'Nu mai există coduri disponibile pentru această echipă.');
    }
    const nums = freeCodes
        .map(v => (typeof v === 'number' ? v : Number(v)))
        .filter(n => Number.isFinite(n))
        .map(n => Math.trunc(n));
    if (nums.length === 0) {
        throw new https_1.HttpsError('resource-exhausted', 'Nu mai există coduri disponibile pentru această echipă.');
    }
    nums.sort((a, b) => b - a);
    return nums[0];
}
async function assertKycDone(uid, emailFallback) {
    const snap = await db.collection('users').doc(uid).get();
    const data = snap.data() ?? {};
    const kycDone = data.kycDone === true;
    const kycFullName = data.kycData?.fullName?.trim() ?? '';
    const displayName = data.displayName?.trim() ?? '';
    const fullName = kycFullName || displayName || emailFallback;
    if (!kycDone && !kycFullName) {
        throw new https_1.HttpsError('failed-precondition', 'KYC nu este complet. Completează KYC și revino.');
    }
    return { userDoc: data, fullName };
}
async function assertStaffNotSetup(uid) {
    const snap = await db.collection('staffProfiles').doc(uid).get();
    const data = snap.data() ?? {};
    if (data.setupDone === true) {
        throw new https_1.HttpsError('failed-precondition', 'Profilul staff este deja configurat. Echipa poate fi schimbată doar din Admin.');
    }
    return data;
}
exports.allocateStaffCode = (0, https_1.onCall)({ region: 'us-central1', memory: '256MiB' }, async (request) => {
    const { uid, email } = assertAuthed(request);
    const teamId = validateTeamId(request.data?.teamId);
    const prevTeamIdRaw = request.data?.prevTeamId;
    const prevCodeNumberRaw = request.data?.prevCodeNumber;
    // Enforce KYC + setup state server-side
    await assertKycDone(uid, email);
    await assertStaffNotSetup(uid);
    const prevTeamId = isNonEmptyString(prevTeamIdRaw) ? prevTeamIdRaw.trim() : '';
    const prevCodeNumber = typeof prevCodeNumberRaw === 'number' && Number.isInteger(prevCodeNumberRaw) ? prevCodeNumberRaw : undefined;
    // If same team and we have a previous temp allocation, treat as no-op.
    if (prevTeamId && prevTeamId === teamId && prevCodeNumber != null) {
        const poolSnap = await db.collection('teamCodePools').doc(teamId).get();
        const prefix = poolSnap.data()?.prefix?.trim() ?? '';
        return { teamId, prefix, number: prevCodeNumber, assignedCode: `${prefix}${prevCodeNumber}` };
    }
    const newPoolRef = db.collection('teamCodePools').doc(teamId);
    const newAssignRef = db.collection('teamAssignments').doc(`${teamId}_${uid}`);
    const historyRef = db.collection('teamAssignmentsHistory').doc();
    const oldPoolRef = prevTeamId ? db.collection('teamCodePools').doc(prevTeamId) : null;
    const oldAssignRef = prevTeamId ? db.collection('teamAssignments').doc(`${prevTeamId}_${uid}`) : null;
    return db.runTransaction(async (tx) => {
        const newPoolSnap = await tx.get(newPoolRef);
        if (!newPoolSnap.exists) {
            throw new https_1.HttpsError('not-found', 'Nu există pool de coduri pentru echipa selectată.');
        }
        const existingAssignSnap = await tx.get(newAssignRef);
        const newPool = newPoolSnap.data() ?? {};
        const prefix = newPool.prefix?.trim() ?? '';
        const freeCodes = newPool.freeCodes;
        const picked = pickHighestFreeCode(freeCodes);
        // Update new pool (remove picked)
        const remaining = (Array.isArray(freeCodes) ? freeCodes : [])
            .filter(v => Math.trunc(Number(v)) !== picked);
        tx.set(newPoolRef, { freeCodes: remaining, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        // Release previous code (if provided) back to old pool (only if missing)
        if (oldPoolRef && oldAssignRef && prevCodeNumber != null) {
            const oldPoolSnap = await tx.get(oldPoolRef);
            if (oldPoolSnap.exists) {
                const oldPool = oldPoolSnap.data() ?? {};
                const oldFree = Array.isArray(oldPool.freeCodes) ? oldPool.freeCodes : [];
                const exists = oldFree.some(v => Math.trunc(Number(v)) === prevCodeNumber);
                const updated = exists ? oldFree : [...oldFree, prevCodeNumber];
                tx.set(oldPoolRef, { freeCodes: updated, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            }
            tx.delete(oldAssignRef);
        }
        // Write assignment
        tx.set(newAssignRef, {
            teamId,
            uid,
            code: picked,
            prefix,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(existingAssignSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        }, { merge: true });
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
});
exports.finalizeStaffSetup = (0, https_1.onCall)({ region: 'us-central1', memory: '256MiB' }, async (request) => {
    const { uid, email } = assertAuthed(request);
    const teamId = validateTeamId(request.data?.teamId);
    const assignedCodeRaw = request.data?.assignedCode;
    const phone = validatePhone(request.data?.phone);
    const assignedCode = isNonEmptyString(assignedCodeRaw) ? assignedCodeRaw.trim() : '';
    if (!assignedCode) {
        throw new https_1.HttpsError('invalid-argument', 'assignedCode este obligatoriu.');
    }
    // KYC + setup enforcement
    const { fullName } = await assertKycDone(uid, email);
    const staffExisting = await assertStaffNotSetup(uid);
    const parsed = parseAssignedCode(assignedCode);
    const assignRef = db.collection('teamAssignments').doc(`${teamId}_${uid}`);
    const assignSnap = await assignRef.get();
    if (!assignSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'Nu există o alocare validă pentru această echipă.');
    }
    const assign = assignSnap.data() ?? {};
    const code = assign.code;
    const prefix = assign.prefix?.trim() ?? '';
    if (Math.trunc(Number(code)) !== parsed.number) {
        throw new https_1.HttpsError('failed-precondition', 'Codul alocat nu corespunde. Reîncearcă alocarea.');
    }
    if (prefix !== parsed.prefix) {
        throw new https_1.HttpsError('failed-precondition', 'Prefixul codului nu corespunde. Reîncearcă alocarea.');
    }
    const staffRef = db.collection('staffProfiles').doc(uid);
    const userRef = db.collection('users').doc(uid);
    const now = admin.firestore.FieldValue.serverTimestamp();
    await staffRef.set({
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
    }, { merge: true });
    await userRef.set({
        staffSetupDone: true,
        phone,
        updatedAt: now,
    }, { merge: true });
    return provideOk();
});
exports.updateStaffPhone = (0, https_1.onCall)({ region: 'us-central1', memory: '256MiB' }, async (request) => {
    const { uid } = assertAuthed(request);
    const phone = validatePhone(request.data?.phone);
    const staffRef = db.collection('staffProfiles').doc(uid);
    const userRef = db.collection('users').doc(uid);
    const now = admin.firestore.FieldValue.serverTimestamp();
    await staffRef.set({ phone, updatedAt: now }, { merge: true });
    await userRef.set({ phone, updatedAt: now }, { merge: true });
    return provideOk();
});
exports.changeUserTeam = (0, https_1.onCall)({ region: 'us-central1', memory: '512MiB' }, async (request) => {
    const { actorUid, actorRole } = await (0, admin_1.assertAdmin)(db, request);
    const uid = validateUid(request.data?.uid);
    const newTeamId = validateTeamId(request.data?.newTeamId);
    const forceReallocate = request.data?.forceReallocate === true;
    const staffRef = db.collection('staffProfiles').doc(uid);
    const staffSnap = await staffRef.get();
    if (!staffSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Staff profile nu există.');
    }
    const staff = staffSnap.data() ?? {};
    const oldTeamId = staff.teamId?.trim() ?? '';
    const oldAssigned = staff.assignedCode?.trim() ?? staff.codIdentificare?.trim() ?? '';
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
    return db.runTransaction(async (tx) => {
        const newPoolSnap = await tx.get(newPoolRef);
        if (!newPoolSnap.exists) {
            throw new https_1.HttpsError('not-found', 'Nu există pool de coduri pentru echipa selectată.');
        }
        const existingAssignSnap = await tx.get(newAssignRef);
        const newPool = newPoolSnap.data() ?? {};
        const newPrefix = newPool.prefix?.trim() ?? '';
        const freeCodes = newPool.freeCodes;
        // IMPORTANT: when re-allocating in the SAME team, do not pick the same code again.
        // We also must not lose the "returned" old code when writing the new pool.
        const sameTeam = oldTeamId === newTeamId;
        const oldNumber = oldParsed?.number;
        const baseFree = (Array.isArray(freeCodes) ? freeCodes : []).map(v => Math.trunc(Number(v)));
        const candidateFree = sameTeam && oldNumber != null ? baseFree.filter(n => n !== oldNumber) : baseFree;
        if (sameTeam && oldNumber != null && candidateFree.length == 0) {
            throw new https_1.HttpsError('resource-exhausted', 'Nu există un alt cod disponibil în această echipă.');
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
        tx.set(newAssignRef, {
            teamId: newTeamId,
            uid,
            code: picked,
            prefix: newPrefix,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(existingAssignSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        }, { merge: true });
        const newAssignedCode = `${newPrefix}${picked}`;
        // Update staff profile
        tx.set(staffRef, {
            teamId: newTeamId,
            assignedCode: newAssignedCode,
            codIdentificare: newAssignedCode,
            ceCodAi: newAssignedCode,
            cineNoteaza: newAssignedCode,
            setupDone: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
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
});
exports.setUserStatus = (0, https_1.onCall)({ region: 'us-central1', memory: '256MiB' }, async (request) => {
    const { actorUid, actorRole } = await (0, admin_1.assertAdmin)(db, request);
    const uid = validateUid(request.data?.uid);
    const status = request.data?.status;
    const allowed = new Set(['active', 'inactive', 'blocked']);
    if (!isNonEmptyString(status) || !allowed.has(status)) {
        throw new https_1.HttpsError('invalid-argument', 'Status invalid. Folosește: active | inactive | blocked');
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
});
function provideOk(extra) {
    return { ok: true, ...(extra ?? {}) };
}
