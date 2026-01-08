'use strict';

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

// Init admin once
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Audit trigger for evenimente collection
 * Logs all changes (create/update/archive) to evenimente/{eventId}/audit/{logId}
 */
exports.auditEventChanges = onDocumentWritten(
  {
    document: 'evenimente/{eventId}',
    region: 'us-central1',
  },
  async (event) => {
    const eventId = event.params.eventId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    // Determine action
    let action = 'unknown';
    if (!before && after) {
      action = 'create';
    } else if (before && after) {
      // Check if it's an archive operation
      if (!before.isArchived && after.isArchived) {
        action = 'archive';
      } else {
        action = 'update';
      }
    } else if (before && !after) {
      action = 'delete'; // Should never happen (NEVER DELETE policy)
    }

    // Extract actor UID
    let actorUid = 'unknown';
    if (action === 'create' && after?.createdBy) {
      actorUid = after.createdBy;
    } else if (action === 'update' && after?.updatedBy) {
      actorUid = after.updatedBy;
    } else if (action === 'archive' && after?.archivedBy) {
      actorUid = after.archivedBy;
    }

    // Calculate changed fields (shallow diff)
    const changedFields = [];
    if (before && after) {
      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const key of allKeys) {
        // Skip audit metadata fields
        if (['updatedAt', 'updatedBy', 'archivedAt', 'archivedBy'].includes(key)) {
          continue;
        }

        const beforeVal = JSON.stringify(before[key]);
        const afterVal = JSON.stringify(after[key]);

        if (beforeVal !== afterVal) {
          changedFields.push(key);
        }
      }
    }

    // Create audit log
    const auditLog = {
      eventId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      actorUid,
      action,
      changedFields,
      // Optional: store before/after (truncated for large objects)
      before: before ? truncateObject(before, 1000) : null,
      after: after ? truncateObject(after, 1000) : null,
    };

    // Write audit log to subcollection
    const db = admin.firestore();
    await db
      .collection('evenimente')
      .doc(eventId)
      .collection('audit')
      .add(auditLog);

    console.log(`[Audit] ${action} on event ${eventId} by ${actorUid}`);
  }
);

/**
 * Truncate object to max string length (prevent huge audit logs)
 */
function truncateObject(obj, maxLength) {
  const str = JSON.stringify(obj);
  if (str.length <= maxLength) {
    return obj;
  }

  // Return truncated string representation
  return {
    _truncated: true,
    _preview: str.substring(0, maxLength) + '...',
  };
}
