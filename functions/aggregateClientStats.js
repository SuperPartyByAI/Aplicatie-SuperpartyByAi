'use strict';

const {onDocumentWritten} = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

// Init admin once
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Aggregate client statistics when events are created/updated
 * Trigger: evenimente/{eventId} onCreate/onUpdate
 */
exports.aggregateClientStats = onDocumentWritten(
  {
    document: 'evenimente/{eventId}',
    region: 'us-central1',
  },
  async (event) => {
    const eventData = event.data?.after?.data();
    const eventDataBefore = event.data?.before?.data();
    const eventId = event.params.eventId;

    if (!eventData) {
      console.log(`[aggregateClientStats] Event ${eventId} deleted, skipping aggregation`);
      return null;
    }

    const phoneE164 = eventData.phoneE164;
    if (!phoneE164) {
      console.log(`[aggregateClientStats] Event ${eventId} has no phoneE164, skipping`);
      return null;
    }

    // Skip if event is archived (but still count if it was paid)
    if (eventData.isArchived === true) {
      console.log(`[aggregateClientStats] Event ${eventId} is archived, skipping active aggregation`);
      // Still update lastEventAt but don't include in active counts
    }

    // Calculate payment amounts
    const payment = eventData.payment || {};
    const paymentStatus = payment.status || 'UNPAID';
    const paymentAmount = typeof payment.amount === 'number' ? payment.amount : 0;
    
    // Get previous payment if this is an update
    let previousAmount = 0;
    let previousStatus = 'UNPAID';
    if (eventDataBefore) {
      const paymentBefore = eventDataBefore.payment || {};
      previousAmount = typeof paymentBefore.amount === 'number' ? paymentBefore.amount : 0;
      previousStatus = paymentBefore.status || 'UNPAID';
    }

    const clientRef = db.collection('clients').doc(phoneE164);

    try {
      await db.runTransaction(async (transaction) => {
        const clientDoc = await transaction.get(clientRef);
        const existing = clientDoc.data() || {};

        // Initialize fields if new client
        const lifetimeSpendPaid = existing.lifetimeSpendPaid || 0;
        const lifetimeSpendAll = existing.lifetimeSpendAll || 0;
        const eventsCount = existing.eventsCount || 0;

        // Calculate delta
        let deltaPaid = 0;
        let deltaAll = 0;
        let deltaCount = 0;

        if (!eventDataBefore) {
          // New event (onCreate)
          deltaCount = 1;
          deltaAll = paymentAmount;
          if (paymentStatus === 'PAID') {
            deltaPaid = paymentAmount;
          }
        } else {
          // Update event (onUpdate)
          // If payment amount changed
          if (paymentAmount !== previousAmount) {
            const amountDelta = paymentAmount - previousAmount;
            deltaAll = amountDelta;
            
            // Update paid amount based on status
            if (previousStatus === 'PAID' && paymentStatus === 'PAID') {
              // Status stayed PAID, only amount changed
              deltaPaid = amountDelta;
            } else if (previousStatus !== 'PAID' && paymentStatus === 'PAID') {
              // Status changed to PAID
              deltaPaid = paymentAmount;
            } else if (previousStatus === 'PAID' && paymentStatus !== 'PAID') {
              // Status changed from PAID to UNPAID/CANCELLED
              deltaPaid = -previousAmount;
            }
          } else if (previousStatus !== paymentStatus) {
            // Amount unchanged, but status changed
            if (previousStatus === 'PAID' && paymentStatus !== 'PAID') {
              deltaPaid = -paymentAmount;
            } else if (previousStatus !== 'PAID' && paymentStatus === 'PAID') {
              deltaPaid = paymentAmount;
            }
          }
        }

        // Update client document
        const updates = {
          phoneE164,
          phoneRaw: eventData.phoneRaw || phoneE164,
          displayName: eventData.parentName || eventData.childName || existing.displayName || null,
          lifetimeSpendPaid: Math.max(0, lifetimeSpendPaid + deltaPaid),
          lifetimeSpendAll: Math.max(0, lifetimeSpendAll + deltaAll),
          eventsCount: Math.max(0, eventsCount + deltaCount),
          lastEventAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Set createdAt if new client
        if (!clientDoc.exists) {
          updates.createdAt = admin.firestore.FieldValue.serverTimestamp();
        }

        transaction.set(clientRef, updates, {merge: true});

        console.log(`[aggregateClientStats] Updated client ${phoneE164}: deltaPaid=${deltaPaid}, deltaAll=${deltaAll}, deltaCount=${deltaCount}`);
      });

      return {success: true, phoneE164, eventId};
    } catch (error) {
      console.error(`[aggregateClientStats] Error aggregating stats for ${phoneE164}:`, error);
      throw error;
    }
  }
);
