import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

export async function isAdminUser(
  db: admin.firestore.Firestore,
  request: CallableRequest,
): Promise<boolean> {
  const uid = request.auth?.uid;
  if (!uid) return false;

  // Preferred: custom claim
  if (request.auth?.token?.admin === true) return true;

  // Fallback: users/{uid}.role == 'admin'
  const snap = await db.collection('users').doc(uid).get();
  const role = (snap.data()?.role as string | undefined)?.toLowerCase();
  return role === 'admin';
}

export async function assertAdmin(
  db: admin.firestore.Firestore,
  request: CallableRequest,
): Promise<{ actorUid: string; actorRole: string }> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
  }
  const ok = await isAdminUser(db, request);
  if (!ok) {
    throw new HttpsError('permission-denied', 'Nu ai permisiuni de admin.');
  }
  return { actorUid: uid, actorRole: 'admin' };
}

