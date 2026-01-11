'use strict';

/**
 * Tasks Manager V3
 * Creates and manages tasks for pending actions
 */

const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');

const db = admin.firestore();

/**
 * Create PENDING_PERSONAJ task for Animator without character
 */
async function createPendingPersonajTask(eventId, eventShortId, roleSlot, eventData) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0); // 12:00 Europe/Bucharest
  
  const taskData = {
    type: 'PENDING_PERSONAJ',
    status: 'OPEN',
    dueAt: Timestamp.fromDate(tomorrow),
    eventShortId,
    roleSlot,
    eventDate: eventData.date || null,
    eventAddress: eventData.address || null,
    clientPhone: eventData.phoneE164 || null,
    assigneeUid: null,
    assigneeCode: null,
    createdAt: Timestamp.now(),
    createdBy: 'system',
    updatedAt: Timestamp.now(),
  };
  
  const taskRef = await db.collection('tasks').add(taskData);
  
  return {
    id: taskRef.id,
    ...taskData,
  };
}

/**
 * Complete task
 */
async function completeTask(taskId, completedBy) {
  await db.collection('tasks').doc(taskId).update({
    status: 'COMPLETED',
    completedAt: Timestamp.now(),
    completedBy,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Cancel task
 */
async function cancelTask(taskId, reason) {
  await db.collection('tasks').doc(taskId).update({
    status: 'CANCELLED',
    cancelReason: reason || null,
    cancelledAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

module.exports = {
  createPendingPersonajTask,
  completeTask,
  cancelTask,
};
