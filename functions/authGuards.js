/**
 * Central auth guards for Cloud Functions.
 * Single source of truth: SUPER_ADMIN_EMAIL
 */
'use strict';

const { HttpsError } = require('firebase-functions/v2/https');

const SUPER_ADMIN_EMAIL = 'ursache.andrei1995@gmail.com';

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
  return { uid: request.auth.uid, email: request.auth.token?.email || '' };
}

function isSuperAdminEmail(email) {
  return (email || '').toString().trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

function requireSuperAdmin(request) {
  const { email } = requireAuth(request);
  if (!isSuperAdminEmail(email)) throw new HttpsError('permission-denied', 'Super-admin only.');
  return true;
}

module.exports = {
  SUPER_ADMIN_EMAIL,
  requireAuth,
  isSuperAdminEmail,
  requireSuperAdmin,
};

