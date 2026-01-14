"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdminUser = isAdminUser;
exports.assertAdmin = assertAdmin;
const https_1 = require("firebase-functions/v2/https");
async function isAdminUser(db, request) {
    const uid = request.auth?.uid;
    if (!uid)
        return false;
    // Preferred: custom claim
    if (request.auth?.token?.admin === true)
        return true;
    // Fallback: users/{uid}.role == 'admin'
    const snap = await db.collection('users').doc(uid).get();
    const role = snap.data()?.role?.toLowerCase();
    return role === 'admin';
}
async function assertAdmin(db, request) {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
    }
    const ok = await isAdminUser(db, request);
    if (!ok) {
        throw new https_1.HttpsError('permission-denied', 'Nu ai permisiuni de admin.');
    }
    return { actorUid: uid, actorRole: 'admin' };
}
