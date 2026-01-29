'use strict';

/**
 * Process Outbox - Firestore Trigger
 *
 * Monitors outbox collection and sends WhatsApp messages via backend.
 * Triggered when outbox document is created with status='queued'.
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const https = require('https');
const http = require('http');
const { getBackendBaseUrl } = require('./lib/backend-url');

const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Forward HTTP request to backend
 */
function forwardRequest(url, options, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = client.request(requestOptions, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: jsonData,
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on('error', error => {
      reject(new Error(`Failed to connect to backend: ${error.message}`));
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Firestore trigger: Process outbox documents when created
 */
async function processOutboxHandler(event) {
  const snapshot = event.data;
  if (!snapshot) {
    console.log('[processOutbox] No data in snapshot');
    return;
  }

  if (process.env.OUTBOX_PROCESSOR_ENABLED === 'false') {
    console.log('[processOutbox] OUTBOX_PROCESSOR_ENABLED=false, skipping');
    return;
  }

  const outboxDoc = snapshot.data();
  const requestId = event.params.requestId || snapshot.id;

  // #region agent log
  const fs = require('fs');
  try {
    fs.appendFileSync(
      '/Users/universparty/.cursor/debug.log',
      JSON.stringify({
        location: 'processOutbox.js:98',
        message: 'processOutbox triggered',
        data: {
          requestId,
          status: outboxDoc.status,
          hasThreadId: !!outboxDoc.threadId,
          hasAccountId: !!outboxDoc.accountId,
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'H5',
      }) + '\n'
    );
  } catch (e) {
    /* ignore */
  }
  // #endregion

  console.log(`[processOutbox] Processing outbox doc: ${requestId}, status=${outboxDoc.status}`);

  const db = admin.firestore();
  const outboxRef = db.collection('outbox').doc(requestId);

  try {
    // Acquire single-processing lock: transition queued -> sending atomically
    const claimed = await db.runTransaction(async tx => {
      const doc = await tx.get(outboxRef);
      if (!doc.exists) return null;
      const data = doc.data();
      if (!data || data.status !== 'queued') {
        return null;
      }
      tx.update(outboxRef, {
        status: 'sending',
        attemptCount: admin.firestore.FieldValue.increment(1),
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return data;
    });

    if (!claimed) {
      console.log(`[processOutbox] Skipping doc (already processed): ${requestId}`);
      return;
    }

    // Get backend URL
    const backendBaseUrl = getBackendBaseUrl();
    if (!backendBaseUrl) {
      throw new Error('WHATSAPP_BACKEND_BASE_URL not configured. Set Firebase secret or functions.config().whatsapp.backend_base_url');
    }

    // Extract message data
    const { threadId, accountId, toJid, body, payload } = claimed;

    if (!threadId || !accountId || !toJid || !body) {
      throw new Error('Missing required fields in outbox document');
    }

    console.log(
      `[processOutbox] Sending message: threadId=${threadId}, accountId=${accountId}, toJid=${toJid}`
    );

    // Send message to backend
    const backendUrl = `${backendBaseUrl}/api/whatsapp/send-message`;
    const response = await forwardRequest(
      backendUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
      },
      {
        threadId,
        accountId,
        to: toJid,
        message: body,
      }
    );

    console.log(`[processOutbox] Backend response: status=${response.statusCode}`);

    // #region agent log
    try {
      fs.appendFileSync(
        '/Users/universparty/.cursor/debug.log',
        JSON.stringify({
          location: 'processOutbox.js:172',
          message: 'Backend response',
          data: { requestId, statusCode: response.statusCode, body: response.body },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          hypothesisId: 'H7',
        }) + '\n'
      );
    } catch (e) {
      /* ignore */
    }
    // #endregion

    if (response.statusCode >= 200 && response.statusCode < 300) {
      // Success - update status to 'sent'
      await outboxRef.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        backendResponse: response.body,
      });

      console.log(`[processOutbox] ✅ Message sent successfully: ${requestId}`);
    } else {
      // Error - update status to 'failed'
      await outboxRef.update({
        status: 'failed',
        error: response.body?.error || `HTTP ${response.statusCode}`,
        errorMessage: response.body?.message || 'Backend returned error',
        backendResponse: response.body,
      });

      console.error(
        `[processOutbox] ❌ Message failed: ${requestId}, status=${response.statusCode}`
      );
    }
  } catch (error) {
    console.error(`[processOutbox] Error processing outbox doc ${requestId}:`, error.message);

    // Update status to 'failed'
    try {
      await outboxRef.update({
        status: 'failed',
        error: error.message,
        errorMessage: error.message,
        attemptCount: admin.firestore.FieldValue.increment(1),
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (updateError) {
      console.error(`[processOutbox] Failed to update error status:`, updateError.message);
    }
  }
}

// Define secrets for backend URL resolution
const { defineSecret } = require('firebase-functions/params');
const whatsappBackendBaseUrl = defineSecret('WHATSAPP_BACKEND_BASE_URL');
const whatsappBackendUrl = defineSecret('WHATSAPP_BACKEND_URL');

// Export Firestore trigger
exports.processOutbox = onDocumentCreated(
  {
    document: 'outbox/{requestId}',
    region: 'us-central1',
    minInstances: 0,
    maxInstances: 1,
    secrets: [whatsappBackendBaseUrl, whatsappBackendUrl],
  },
  processOutboxHandler
);

// Export handler for testing
exports.processOutboxHandler = processOutboxHandler;
