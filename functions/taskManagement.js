const admin = require('firebase-admin');

/**
 * Create follow-up task for pending character decision
 * 
 * @param {string} eventId - Event document ID
 * @param {number} eventShortId - Event short ID (01, 02, etc)
 * @param {string} roleSlot - Role slot (01A, 01B, etc)
 * @param {string} date - Event date (DD-MM-YYYY)
 * @param {string} address - Event address
 * @param {string} phoneE164 - Client phone (E.164)
 * @param {string} createdByCode - Staff code who created the event
 * @returns {Promise<string>} - Task ID
 */
async function createPendingPersonajTask(
  eventId,
  eventShortId,
  roleSlot,
  date,
  address,
  phoneE164,
  createdByCode
) {
  const db = admin.firestore();

  // Calculate due date: tomorrow at 12:00 Europe/Bucharest
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0);

  // Convert to Europe/Bucharest timezone
  // Note: Firestore stores UTC, but we calculate based on local time
  const dueAt = admin.firestore.Timestamp.fromDate(tomorrow);

  const taskData = {
    tip: 'PENDING_PERSONAJ',
    status: 'open',
    dueAt,
    numarEveniment: String(eventShortId).padStart(2, '0'),
    slotRol: roleSlot,
    data: date,
    adresa: address,
    telefonClientE164: phoneE164,
    eventId,
    assigneeUid: null,
    assigneeCode: null,
    creatLa: admin.firestore.FieldValue.serverTimestamp(),
    creatDeCod: createdByCode,
    message: `Pentru petrecerea cu ID ${String(eventShortId).padStart(2, '0')} (${date}, ${address}), ce personaj rămâne pentru rolul ${roleSlot}?`,
  };

  const taskRef = await db.collection('tasks').add(taskData);

  return taskRef.id;
}

/**
 * Check if event has pending tasks
 * 
 * @param {string} eventId - Event document ID
 * @returns {Promise<boolean>}
 */
async function hasPendingTasks(eventId) {
  const db = admin.firestore();

  const snapshot = await db
    .collection('tasks')
    .where('eventId', '==', eventId)
    .where('status', '==', 'open')
    .limit(1)
    .get();

  return !snapshot.empty;
}

/**
 * Get pending tasks for event
 * 
 * @param {string} eventId - Event document ID
 * @returns {Promise<Array>}
 */
async function getPendingTasks(eventId) {
  const db = admin.firestore();

  const snapshot = await db
    .collection('tasks')
    .where('eventId', '==', eventId)
    .where('status', '==', 'open')
    .orderBy('dueAt', 'asc')
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Complete task
 * 
 * @param {string} taskId - Task ID
 * @param {string} completedByUid - User UID
 * @param {string} completedByCode - Staff code
 * @param {Object} resolution - Resolution data
 * @returns {Promise<void>}
 */
async function completeTask(taskId, completedByUid, completedByCode, resolution) {
  const db = admin.firestore();

  await db.collection('tasks').doc(taskId).update({
    status: 'done',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    completedByUid,
    completedByCode,
    resolution,
  });
}

module.exports = {
  createPendingPersonajTask,
  hasPendingTasks,
  getPendingTasks,
  completeTask,
};
