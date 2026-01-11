const admin = require('firebase-admin');

/**
 * Get staff profile by code
 * 
 * @param {string} code - Staff code (ex: "A13")
 * @returns {Promise<Object|null>} - { uid, email, displayName, code, role } or null
 */
async function getStaffByCode(code) {
  if (!code || typeof code !== 'string') {
    return null;
  }

  const db = admin.firestore();

  const snapshot = await db
    .collection('staffProfiles')
    .where('code', '==', code.toUpperCase())
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    uid: doc.id,
    email: data.email || null,
    displayName: data.displayName || data.nume || null,
    code: data.code,
    role: data.role || 'staff',
    isActive: data.isActive !== false,
  };
}

/**
 * Get staff profile by UID
 * 
 * @param {string} uid - User UID
 * @returns {Promise<Object|null>} - { uid, email, displayName, code, role } or null
 */
async function getStaffByUid(uid) {
  if (!uid || typeof uid !== 'string') {
    return null;
  }

  const db = admin.firestore();

  const doc = await db.collection('staffProfiles').doc(uid).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();

  return {
    uid: doc.id,
    email: data.email || null,
    displayName: data.displayName || data.nume || null,
    code: data.code || null,
    role: data.role || 'staff',
    isActive: data.isActive !== false,
  };
}

/**
 * List all active staff
 * 
 * @returns {Promise<Array>} - Array of staff profiles
 */
async function listActiveStaff() {
  const db = admin.firestore();

  const snapshot = await db
    .collection('staffProfiles')
    .where('isActive', '==', true)
    .orderBy('code', 'asc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      email: data.email || null,
      displayName: data.displayName || data.nume || null,
      code: data.code || null,
      role: data.role || 'staff',
      isActive: true,
    };
  });
}

module.exports = {
  getStaffByCode,
  getStaffByUid,
  listActiveStaff,
};
