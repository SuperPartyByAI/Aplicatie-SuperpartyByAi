// Temporary admin setup function - DEPLOY AND THEN DELETE
import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export const tempSetAdmin = onCall(
  {
    region: 'us-central1',
    maxInstances: 1,
  },
  async (request) => {
    const { uid, email } = request.data;
    
    if (!uid || !email) {
      throw new Error('uid and email required');
    }
    
    // Set Firestore role
    await getFirestore().collection('users').doc(uid).set({
      role: 'admin',
      email: email
    }, { merge: true });
    
    // Try to set custom claim
    try {
      await getAuth().setCustomUserClaims(uid, { admin: true });
    } catch (err) {
      // May fail but Firestore is enough
    }
    
    return { success: true, message: `User ${email} is now admin` };
  }
);
