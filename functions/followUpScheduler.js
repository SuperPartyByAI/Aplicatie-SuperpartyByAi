'use strict';

/**
 * Follow-up Scheduler
 * 
 * Handles automated follow-ups for pending tasks.
 * Runs every hour to check for due follow-ups.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

/**
 * Process follow-up tasks that are due
 * Runs every hour
 */
exports.processFollowUps = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'Europe/Bucharest',
    region: 'us-central1',
    minInstances: 0,
    maxInstances: 1,
    memory: '256MiB',
  },
  async (event) => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    try {
      console.log('[followUpScheduler] Starting follow-up processing...');

      // Query tasks that are due for follow-up
      const tasksSnap = await db
        .collection('tasks')
        .where('status', '==', 'OPEN')
        .where('dueAt', '<=', now)
        .limit(50)
        .get();

      if (tasksSnap.empty) {
        console.log('[followUpScheduler] No due follow-ups found');
        return { processed: 0 };
      }

      const batch = db.batch();
      let processed = 0;

      for (const taskDoc of tasksSnap.docs) {
        const task = taskDoc.data();

        // Create notification for staff
        const notificationRef = db.collection('notifications').doc();
        batch.set(notificationRef, {
          type: 'FOLLOW_UP_DUE',
          taskId: taskDoc.id,
          eventShortId: task.eventShortId || null,
          roleSlot: task.roleSlot || null,
          eventDate: task.eventDate || null,
          eventAddress: task.eventAddress || null,
          message: `Follow-up pentru eveniment ${task.eventShortId || 'N/A'} - ${task.eventDate || 'N/A'}`,
          assigneeUid: task.assigneeUid || null,
          assigneeCode: task.assigneeCode || null,
          status: 'UNREAD',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update task status to IN_PROGRESS
        batch.update(taskDoc.ref, {
          status: 'IN_PROGRESS',
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        processed++;
      }

      await batch.commit();

      console.log(`[followUpScheduler] Processed ${processed} follow-ups`);
      return { processed };
    } catch (error) {
      console.error('[followUpScheduler] Error processing follow-ups:', error);
      throw error;
    }
  }
);

/**
 * Create a follow-up task
 * @param {object} params - Task parameters
 * @returns {Promise<string>} - Task ID
 */
async function createFollowUpTask(params) {
  const {
    type,
    eventShortId,
    roleSlot,
    eventDate,
    eventAddress,
    clientPhone,
    assigneeUid,
    assigneeCode,
    dueAt,
    createdBy,
  } = params;

  const db = admin.firestore();

  const taskData = {
    type: type || 'FOLLOW_UP',
    status: 'OPEN',
    eventShortId: eventShortId || null,
    roleSlot: roleSlot || null,
    eventDate: eventDate || null,
    eventAddress: eventAddress || null,
    clientPhone: clientPhone || null,
    assigneeUid: assigneeUid || null,
    assigneeCode: assigneeCode || null,
    dueAt: dueAt || admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: createdBy || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const taskRef = await db.collection('tasks').add(taskData);

  console.log(`[followUpScheduler] Created follow-up task: ${taskRef.id}`);
  return taskRef.id;
}

/**
 * Create a follow-up for "next day at 12:00"
 * @param {object} params - Task parameters
 * @returns {Promise<string>} - Task ID
 */
async function createNextDayFollowUp(params) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0); // 12:00 Europe/Bucharest

  return createFollowUpTask({
    ...params,
    dueAt: admin.firestore.Timestamp.fromDate(tomorrow),
  });
}

/**
 * Cancel a follow-up task
 * @param {string} taskId - Task ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise<void>}
 */
async function cancelFollowUpTask(taskId, reason) {
  const db = admin.firestore();

  await db.collection('tasks').doc(taskId).update({
    status: 'CANCELLED',
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    cancelReason: reason || 'Cancelled by user',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`[followUpScheduler] Cancelled follow-up task: ${taskId}`);
}

/**
 * Complete a follow-up task
 * @param {string} taskId - Task ID
 * @param {string} completedBy - User ID who completed the task
 * @returns {Promise<void>}
 */
async function completeFollowUpTask(taskId, completedBy) {
  const db = admin.firestore();

  await db.collection('tasks').doc(taskId).update({
    status: 'COMPLETED',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    completedBy: completedBy || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`[followUpScheduler] Completed follow-up task: ${taskId}`);
}

module.exports = {
  createFollowUpTask,
  createNextDayFollowUp,
  cancelFollowUpTask,
  completeFollowUpTask,
};
