// Bootstrap Admin - Permanent admin setup with allowlist
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// ALLOWLIST: Only these emails can become admin
const ADMIN_ALLOWLIST = [
  'superpartybyai@gmail.com',
  'ursache.andrei1995@gmail.com',
];

/**
 * Bootstrap Admin - One-time setup for permanent admin access
 * 
 * This function:
 * 1. Verifies caller email is in allowlist
 * 2. Sets Firebase Auth custom claim: admin=true (persists across sessions)
 * 3. Sets Firestore users/{uid}.role="admin" (merge, never overwrite)
 * 
 * Call once per admin user. Idempotent - safe to call multiple times.
 * 
 * Usage from Flutter:
 * ```dart
 * final callable = FirebaseFunctions.instance.httpsCallable('bootstrapAdmin');
 * await callable.call();
 * ```
 */
export const bootstrapAdmin = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
  },
  async (request) => {
    const uid = request.auth?.uid;
    const email = request.auth?.token?.email;

    if (!uid || !email) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    // Check allowlist
    if (!ADMIN_ALLOWLIST.includes(email.toLowerCase())) {
      throw new HttpsError(
        'permission-denied',
        `Email ${email} is not authorized for admin access. Contact support.`
      );
    }

    try {
      // 1. Set custom claim (persists across sessions, survives sign-out/sign-in)
      await getAuth().setCustomUserClaims(uid, { admin: true });

      // 2. Set Firestore role (merge: true - never downgrade existing data)
      await getFirestore()
        .collection('users')
        .doc(uid)
        .set(
          {
            role: 'admin',
            email: email,
            adminBootstrappedAt: new Date().toISOString(),
          },
          { merge: true }
        );

      return {
        success: true,
        message: `Admin access granted permanently to ${email}`,
        uid,
        email,
        customClaimSet: true,
        firestoreRoleSet: true,
      };
    } catch (error: any) {
      console.error('bootstrapAdmin error:', error);
      throw new HttpsError(
        'internal',
        `Failed to set admin: ${error.message}`
      );
    }
  }
);
