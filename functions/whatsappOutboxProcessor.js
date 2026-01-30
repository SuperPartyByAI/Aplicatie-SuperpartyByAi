'use strict';

/**
 * WhatsApp Outbox Processor
 *
 * Processes outbox messages created by whatsappProxySend and sends them
 * to WhatsApp backend for actual delivery.
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const https = require('https');
const http = require('http');
const { getBackendBaseUrl } = require('./lib/backend-url');

const REQUEST_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRY_ATTEMPTS = 3;

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
      method: options.method || 'POST',
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
      reject(error);
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
 * Process outbox document and send message to backend
 */
async function processOutboxDocument(snapshot, context) {
  if (process.env.OUTBOX_PROCESSOR_ENABLED === 'false') {
    console.log('[OutboxProcessor] OUTBOX_PROCESSOR_ENABLED=false, skipping');
    return null;
  }

  const outboxId = context.params.outboxId;
  const data = snapshot.data();

  console.log(`[OutboxProcessor] Processing outbox document: ${outboxId}`);

  // Validate outbox document
  if (!data || data.status !== 'queued') {
    console.log(
      `[OutboxProcessor] Skipping document ${outboxId}: invalid status (${data?.status})`
    );
    return null;
  }

  const {
    threadId,
    accountId,
    toJid,
    body: messageText,
    requestId,
    attemptCount = 0,
    payload,
  } = data;

  // Check if max retries exceeded
  if (attemptCount >= MAX_RETRY_ATTEMPTS) {
    console.error(`[OutboxProcessor] Max retries exceeded for ${outboxId}`);
    await snapshot.ref.update({
      status: 'failed',
      error: 'Max retry attempts exceeded',
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return null;
  }

  // Get backend URL
  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) {
    console.error('[OutboxProcessor] Backend URL not configured');
    await snapshot.ref.update({
      status: 'failed',
      error: 'Backend URL not configured',
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return null;
  }

  try {
    // Update status to 'sending'
    await snapshot.ref.update({
      status: 'sending',
      attemptCount: attemptCount + 1,
      lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send message to backend
    const backendUrl = `${backendBaseUrl}/api/whatsapp/send-message`;
    console.log(`[OutboxProcessor] Sending to backend: ${backendUrl}`);

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
        message: messageText,
        clientMessageId: requestId,
        payload,
      }
    );

    // Check response
    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.log(`[OutboxProcessor] Message sent successfully: ${outboxId}`);

      // Mark as sent
      await snapshot.ref.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        backendResponse: response.body,
      });

      return { success: true, outboxId };
    } else {
      // Backend returned error
      console.error(
        `[OutboxProcessor] Backend error: status=${response.statusCode}, body=${JSON.stringify(response.body)}`
      );

      // Retry if temporary error
      if (response.statusCode >= 500 || response.statusCode === 429) {
        // Schedule retry
        const nextAttemptDelay = Math.pow(2, attemptCount) * 5000; // Exponential backoff: 5s, 10s, 20s
        await snapshot.ref.update({
          status: 'queued',
          error: `Backend error: ${response.statusCode}`,
          nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now() + nextAttemptDelay),
        });
        console.log(`[OutboxProcessor] Scheduled retry for ${outboxId} in ${nextAttemptDelay}ms`);
      } else {
        // Permanent error
        await snapshot.ref.update({
          status: 'failed',
          error: `Backend error: ${response.statusCode} - ${response.body?.message || response.body?.error || 'Unknown error'}`,
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
          backendResponse: response.body,
        });
      }

      return { success: false, error: `Backend error: ${response.statusCode}` };
    }
  } catch (error) {
    console.error(`[OutboxProcessor] Error processing ${outboxId}:`, error.message);

    // Schedule retry for network errors
    const nextAttemptDelay = Math.pow(2, attemptCount) * 5000;
    await snapshot.ref.update({
      status: 'queued',
      error: error.message,
      nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now() + nextAttemptDelay),
    });

    return { success: false, error: error.message };
  }
}

// Firestore trigger: on outbox document created
exports.processOutbox = onDocumentCreated(
  {
    document: 'outbox/{outboxId}',
    region: 'us-central1',
    maxInstances: 10,
  },
  async event => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data associated with the event');
      return;
    }

    return processOutboxDocument(snapshot, event);
  }
);

// Export for testing
exports.processOutboxDocument = processOutboxDocument;
