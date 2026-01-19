'use strict';

/**
 * Process Outbox - Firestore Trigger
 * 
 * Monitors outbox collection and sends WhatsApp messages via Railway backend.
 * Triggered when outbox document is created with status='queued'.
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const https = require('https');
const http = require('http');

// Railway backend base URL
function getRailwayBaseUrl() {
  // Try v2 process.env first
  if (process.env.WHATSAPP_RAILWAY_BASE_URL) {
    return process.env.WHATSAPP_RAILWAY_BASE_URL;
  }

  // Try v1 functions.config()
  try {
    const functions = require('firebase-functions');
    const config = functions.config();
    if (config?.whatsapp?.railway_base_url) {
      return config.whatsapp.railway_base_url;
    }
  } catch (e) {
    // Ignore
  }

  return null;
}

const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Forward HTTP request to Railway backend
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

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
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

    req.on('error', (error) => {
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

  const outboxDoc = snapshot.data();
  const requestId = event.params.requestId || snapshot.id;

  // #region agent log
  const fs = require('fs');
  try {
    fs.appendFileSync('/Users/universparty/.cursor/debug.log', JSON.stringify({
      location: 'processOutbox.js:98',
      message: 'processOutbox triggered',
      data: {requestId, status: outboxDoc.status, hasThreadId: !!outboxDoc.threadId, hasAccountId: !!outboxDoc.accountId},
      timestamp: Date.now(),
      sessionId: 'debug-session',
      hypothesisId: 'H5'
    }) + '\n');
  } catch (e) { /* ignore */ }
  // #endregion

  console.log(`[processOutbox] Processing outbox doc: ${requestId}, status=${outboxDoc.status}`);

  // Only process queued messages
  if (outboxDoc.status !== 'queued') {
    console.log(`[processOutbox] Skipping doc with status=${outboxDoc.status}`);
    return;
  }

  const db = admin.firestore();
  const outboxRef = db.collection('outbox').doc(requestId);

  try {
    // Get Railway backend URL
    const railwayBaseUrl = getRailwayBaseUrl();
    if (!railwayBaseUrl) {
      throw new Error('WHATSAPP_RAILWAY_BASE_URL not configured');
    }

    // Extract message data
    const { threadId, accountId, toJid, body, payload } = outboxDoc;

    if (!threadId || !accountId || !toJid || !body) {
      throw new Error('Missing required fields in outbox document');
    }

    console.log(`[processOutbox] Sending message: threadId=${threadId}, accountId=${accountId}, toJid=${toJid}`);

    // Update status to 'sending'
    await outboxRef.update({
      status: 'sending',
      attemptCount: admin.firestore.FieldValue.increment(1),
      lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send message to Railway backend
    const railwayUrl = `${railwayBaseUrl}/api/whatsapp/send`;
    const response = await forwardRequest(railwayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
    }, {
      threadId,
      accountId,
      toJid,
      text: body,
      ...payload,
    });

    console.log(`[processOutbox] Railway response: status=${response.statusCode}`);

    // #region agent log
    try {
      fs.appendFileSync('/Users/universparty/.cursor/debug.log', JSON.stringify({
        location: 'processOutbox.js:172',
        message: 'Railway backend response',
        data: {requestId, statusCode: response.statusCode, body: response.body},
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'H7'
      }) + '\n');
    } catch (e) { /* ignore */ }
    // #endregion

    if (response.statusCode >= 200 && response.statusCode < 300) {
      // Success - update status to 'sent'
      await outboxRef.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        railwayResponse: response.body,
      });

      console.log(`[processOutbox] ✅ Message sent successfully: ${requestId}`);
    } else {
      // Error - update status to 'failed'
      await outboxRef.update({
        status: 'failed',
        error: response.body?.error || `HTTP ${response.statusCode}`,
        errorMessage: response.body?.message || 'Backend returned error',
        railwayResponse: response.body,
      });

      console.error(`[processOutbox] ❌ Message failed: ${requestId}, status=${response.statusCode}`);
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

// Export Firestore trigger
exports.processOutbox = onDocumentCreated(
  {
    document: 'outbox/{requestId}',
    region: 'us-central1',
    maxInstances: 3,
  },
  processOutboxHandler
);

// Export handler for testing
exports.processOutboxHandler = processOutboxHandler;
