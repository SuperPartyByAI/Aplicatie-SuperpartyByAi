'use strict';

/**
 * WhatsApp Backend Proxy
 * 
 * Secure proxy for Flutter app to interact with Railway WhatsApp backend.
 * Enforces authentication and owner/co-writer policy for sending messages.
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

// Super admin email
const SUPER_ADMIN_EMAIL = 'ursache.andrei1995@gmail.com';

// Get admin emails from environment
function getAdminEmails() {
  const envEmails = process.env.ADMIN_EMAILS || '';
  return envEmails.split(',').map(e => e.trim()).filter(Boolean);
}

// Extract Firebase ID token from request
function extractIdToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

// Verify Firebase ID token
async function verifyIdToken(token) {
  if (!token) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded;
  } catch (error) {
    console.error('[whatsappProxy] Token verification failed:', error.message);
    return null;
  }
}

// Check if user is employee
async function isEmployee(uid, email) {
  const adminEmails = [SUPER_ADMIN_EMAIL, ...getAdminEmails()];
  if (adminEmails.includes(email)) {
    return {
      isEmployee: true,
      role: 'admin',
      isGmOrAdmin: true,
      isSuperAdmin: email === SUPER_ADMIN_EMAIL,
    };
  }

  const db = admin.firestore();
  const staffDoc = await db.collection('staffProfiles').doc(uid).get();

  if (!staffDoc.exists) {
    return {
      isEmployee: false,
      role: 'user',
      isGmOrAdmin: false,
      isSuperAdmin: false,
    };
  }

  const staffData = staffDoc.data();
  const role = staffData?.role || 'staff';
  const isGmOrAdmin = ['gm', 'admin'].includes(role.toLowerCase());

  return {
    isEmployee: true,
    role,
    isGmOrAdmin,
    isSuperAdmin: false,
  };
}

// Generate deterministic requestId for idempotency
function generateRequestId(threadId, uid, clientMessageId) {
  const input = `${threadId}|${uid}|${clientMessageId}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * POST /whatsappProxy/send
 * 
 * Send WhatsApp message via proxy with owner/co-writer policy enforcement.
 * 
 * Body:
 * {
 *   "threadId": string,
 *   "accountId": string,
 *   "toJid": string,
 *   "text": string,
 *   "clientMessageId": string
 * }
 */
exports.send = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  async (req, res) => {
    // Only POST allowed
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'method_not_allowed',
        message: 'Only POST method is allowed',
      });
    }

    try {
      // Extract and verify Firebase ID token
      const token = extractIdToken(req);
      const decoded = await verifyIdToken(token);
      if (!decoded) {
        return res.status(401).json({
          success: false,
          error: 'missing_auth_token',
          message: 'Missing or invalid Firebase ID token',
        });
      }

      const uid = decoded.uid;
      const email = decoded.email || '';

      // Check if user is employee
      const employeeInfo = await isEmployee(uid, email);
      if (!employeeInfo.isEmployee) {
        return res.status(403).json({
          success: false,
          error: 'employee_only',
          message: 'Only employees can send messages',
        });
      }

      // Validate request body
      const { threadId, accountId, toJid, text, clientMessageId } = req.body;

      if (!threadId || !accountId || !toJid || !text || !clientMessageId) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Missing required fields: threadId, accountId, toJid, text, clientMessageId',
        });
      }

      const db = admin.firestore();

      // Read thread document
      const threadRef = db.collection('threads').doc(threadId);
      const threadDoc = await threadRef.get();

      if (!threadDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'thread_not_found',
          message: `Thread ${threadId} does not exist`,
        });
      }

      const threadData = threadDoc.data();
      const ownerUid = threadData?.ownerUid;
      const coWriterUids = threadData?.coWriterUids || [];

      // Check owner/co-writer policy
      let isOwner = false;
      let shouldSetOwner = false;

      if (!ownerUid) {
        // First outbound send - set owner atomically
        shouldSetOwner = true;
        isOwner = true;
      } else {
        // Check if user is owner or co-writer
        isOwner = uid === ownerUid;
        const isCoWriter = coWriterUids.includes(uid);

        if (!isOwner && !isCoWriter) {
          return res.status(403).json({
            success: false,
            error: 'not_owner_or_cowriter',
            message: 'Only thread owner or co-writers can send messages',
          });
        }
      }

      // Generate deterministic requestId for idempotency
      const requestId = generateRequestId(threadId, uid, clientMessageId);

      // Use transaction to atomically:
      // 1. Set ownerUid if needed
      // 2. Create outbox doc (or detect duplicate)
      let duplicate = false;
      await db.runTransaction(async (transaction) => {
        // Re-read thread to get latest state
        const latestThreadDoc = await transaction.get(threadRef);
        const latestThreadData = latestThreadDoc.data();

        // Set ownerUid if needed (atomic)
        if (shouldSetOwner && !latestThreadData?.ownerUid) {
          transaction.update(threadRef, {
            ownerUid: uid,
            coWriterUids: admin.firestore.FieldValue.arrayUnion(), // Initialize if missing
          });
        }

        // Check if outbox doc already exists (idempotency)
        const outboxRef = db.collection('outbox').doc(requestId);
        const outboxDoc = await transaction.get(outboxRef);

        if (outboxDoc.exists) {
          duplicate = true;
          return; // Don't create duplicate
        }

        // Create outbox document
        const outboxData = {
          requestId,
          threadId,
          accountId,
          toJid,
          body: text,
          payload: { text },
          status: 'queued',
          attempts: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdByUid: uid,
        };

        transaction.set(outboxRef, outboxData);
      });

      // Return success response
      return res.status(200).json({
        success: true,
        requestId,
        duplicate,
        message: duplicate
          ? 'Message already queued (idempotent)'
          : 'Message queued successfully',
      });
    } catch (error) {
      console.error('[whatsappProxy/send] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'internal_error',
        message: error.message || 'Internal server error',
      });
    }
  }
);
