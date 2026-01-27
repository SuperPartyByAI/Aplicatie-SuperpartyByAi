'use strict';

/**
 * Staff Code Manager
 * 
 * Manages staff profiles and codes for role assignment and salary tracking.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

/**
 * Create or update staff profile
 * Callable function for staff to set their code
 */
exports.setStaffCode = onCall(
  {
    region: 'us-central1',
    minInstances: 0,
    maxInstances: 3,
    memory: '256MiB',
  },
  async (request) => {
    const uid = request.auth?.uid;
    const email = request.auth?.token?.email;

    if (!uid) {
      throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
    }

    const { code, name } = request.data;

    if (!code || typeof code !== 'string') {
      throw new HttpsError('invalid-argument', 'Codul este obligatoriu.');
    }

    // Validate code format (alphanumeric, 2-10 characters)
    if (!/^[A-Z0-9]{2,10}$/i.test(code)) {
      throw new HttpsError(
        'invalid-argument',
        'Codul trebuie să conțină 2-10 caractere alfanumerice.'
      );
    }

    const db = admin.firestore();
    const normalizedCode = code.toUpperCase();

    try {
      // Check if code is already taken by another user
      const existingSnap = await db
        .collection('staffProfiles')
        .where('code', '==', normalizedCode)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        const existingDoc = existingSnap.docs[0];
        if (existingDoc.id !== uid) {
          throw new HttpsError(
            'already-exists',
            'Acest cod este deja folosit de alt angajat.'
          );
        }
      }

      // Create or update staff profile
      const profileData = {
        code: normalizedCode,
        email: email || null,
        name: name || email || null,
        uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const profileRef = db.collection('staffProfiles').doc(uid);
      const profileDoc = await profileRef.get();

      if (profileDoc.exists) {
        // Update existing profile
        await profileRef.update(profileData);
      } else {
        // Create new profile
        profileData.createdAt = admin.firestore.FieldValue.serverTimestamp();
        await profileRef.set(profileData);
      }

      return {
        success: true,
        code: normalizedCode,
        message: 'Codul a fost salvat cu succes!',
      };
    } catch (error) {
      console.error('[staffCodeManager] Error setting staff code:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Eroare la salvarea codului: ' + error.message);
    }
  }
);

/**
 * Get staff profile by code
 * @param {string} code - Staff code
 * @returns {Promise<object|null>} - Staff profile or null
 */
async function getStaffByCode(code) {
  if (!code) return null;

  const db = admin.firestore();
  const normalizedCode = code.toUpperCase();

  try {
    const snap = await db
      .collection('staffProfiles')
      .where('code', '==', normalizedCode)
      .limit(1)
      .get();

    if (snap.empty) {
      return null;
    }

    const doc = snap.docs[0];
    return {
      uid: doc.id,
      ...doc.data(),
    };
  } catch (error) {
    console.error('[staffCodeManager] Error getting staff by code:', error);
    return null;
  }
}

/**
 * Get staff profile by UID
 * @param {string} uid - User ID
 * @returns {Promise<object|null>} - Staff profile or null
 */
async function getStaffByUid(uid) {
  if (!uid) return null;

  const db = admin.firestore();

  try {
    const doc = await db.collection('staffProfiles').doc(uid).get();

    if (!doc.exists) {
      return null;
    }

    return {
      uid: doc.id,
      ...doc.data(),
    };
  } catch (error) {
    console.error('[staffCodeManager] Error getting staff by UID:', error);
    return null;
  }
}

/**
 * Validate staff code
 * @param {string} code - Staff code
 * @returns {Promise<boolean>} - True if valid
 */
async function validateStaffCode(code) {
  const staff = await getStaffByCode(code);
  return staff !== null;
}

/**
 * Assign role to staff using code
 * @param {string} eventId - Event ID
 * @param {string} roleSlot - Role slot (e.g., "01A")
 * @param {string} staffCode - Staff code
 * @returns {Promise<object>} - Updated role
 */
async function assignRoleToStaff(eventId, roleSlot, staffCode) {
  const db = admin.firestore();

  // Validate staff code
  const staff = await getStaffByCode(staffCode);
  if (!staff) {
    throw new Error(`Cod invalid: ${staffCode}`);
  }

  // Get event
  const eventDoc = await db.collection('evenimente').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new Error('Evenimentul nu există');
  }

  const eventData = eventDoc.data();
  const rolesBySlot = eventData.rolesBySlot || {};

  if (!rolesBySlot[roleSlot]) {
    throw new Error(`Rolul ${roleSlot} nu există`);
  }

  // Update role with staff assignment
  rolesBySlot[roleSlot] = {
    ...rolesBySlot[roleSlot],
    assigneeUid: staff.uid,
    assigneeCode: staff.code,
    assignedCode: staff.code,
    status: 'ASSIGNED',
    assignedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Update event
  await eventDoc.ref.update({
    rolesBySlot,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: staff.uid,
  });

  // Log hours for salary tracking
  await logStaffHours(staff.uid, staff.code, eventId, roleSlot, rolesBySlot[roleSlot]);

  return rolesBySlot[roleSlot];
}

/**
 * Log staff hours for salary tracking
 * @param {string} uid - Staff UID
 * @param {string} code - Staff code
 * @param {string} eventId - Event ID
 * @param {string} roleSlot - Role slot
 * @param {object} role - Role data
 * @returns {Promise<void>}
 */
async function logStaffHours(uid, code, eventId, roleSlot, role) {
  const db = admin.firestore();

  const hoursData = {
    staffUid: uid,
    staffCode: code,
    eventId,
    roleSlot,
    roleType: role.roleType || null,
    startTime: role.startTime || null,
    durationMin: role.durationMin || 0,
    eventDate: role.eventDate || null,
    loggedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection('staffHours').add(hoursData);
}

/**
 * Get staff hours for a period
 * @param {string} staffCode - Staff code
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} - Array of hours entries
 */
async function getStaffHours(staffCode, startDate, endDate) {
  const db = admin.firestore();

  const snap = await db
    .collection('staffHours')
    .where('staffCode', '==', staffCode.toUpperCase())
    .where('loggedAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .where('loggedAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
    .orderBy('loggedAt', 'desc')
    .get();

  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Calculate total hours for staff in a period
 * @param {string} staffCode - Staff code
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<number>} - Total minutes
 */
async function calculateStaffHours(staffCode, startDate, endDate) {
  const hours = await getStaffHours(staffCode, startDate, endDate);
  
  return hours.reduce((total, entry) => {
    return total + (entry.durationMin || 0);
  }, 0);
}

module.exports = {
  getStaffByCode,
  getStaffByUid,
  validateStaffCode,
  assignRoleToStaff,
  logStaffHours,
  getStaffHours,
  calculateStaffHours,
};
