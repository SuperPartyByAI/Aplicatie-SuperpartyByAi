'use strict';

/**
 * WhatsApp Backend Proxy - QR Connect Routes Only
 * 
 * Secure proxy for Flutter app to interact with WhatsApp backend.
 * Provides account management and QR code generation for WhatsApp connections.
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const https = require('https');
const http = require('http');
const { getBackendBaseUrl } = require('./lib/backend-url');

// Super admin email
const SUPER_ADMIN_EMAIL = 'ursache.andrei1995@gmail.com';

// Backend base URL is resolved lazily via lib/backend-url.js

const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

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

// Validate and normalize phone number
function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  // Remove all non-digit characters except +
  const cleaned = phone.trim();
  if (cleaned.length < 10) {
    return { valid: false, error: 'Phone number too short' };
  }

  // Basic validation: should start with + or be digits
  if (!/^\+?[0-9]+$/.test(cleaned.replace(/\s/g, ''))) {
    return { valid: false, error: 'Invalid phone number format' };
  }

  return { valid: true, normalized: cleaned };
}

// Validate account name
function validateName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Account name is required' };
  }

  const trimmed = name.trim();
  if (trimmed.length < 1) {
    return { valid: false, error: 'Account name cannot be empty' };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'Account name too long (max 100 characters)' };
  }

  return { valid: true, normalized: trimmed };
}

// Auth middleware factory
async function requireAuth(req, res) {
  const token = extractIdToken(req);
  const decoded = await verifyIdToken(token);
  if (!decoded) {
    res.status(401).json({
      success: false,
      error: 'missing_auth_token',
      message: 'Missing or invalid Firebase ID token',
    });
    return null;
  }
  req.user = decoded;
  return decoded;
}

// Super-admin-only middleware
async function requireSuperAdmin(req, res) {
  const decoded = await requireAuth(req, res);
  if (!decoded) return null; // Response already sent

  const email = decoded.email || '';
  if (email !== SUPER_ADMIN_EMAIL) {
    res.status(403).json({
      success: false,
      error: 'super_admin_only',
      message: 'Only super-admin can access this resource',
    });
    return null;
  }

  return true;
}

/**
 * Forward HTTP request to backend
 * 
 * Security: No sensitive headers logged, timeout enforced, safe error messages
 * 
 * Exported for testing (can be mocked)
 */
let forwardRequest = function(url, options, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        ...options.headers,
        // Remove any sensitive headers that might leak
        'Authorization': undefined, // Don't forward client auth to backend
      },
    };

    // Remove undefined headers
    Object.keys(requestOptions.headers).forEach(key => {
      if (requestOptions.headers[key] === undefined) {
        delete requestOptions.headers[key];
      }
    });

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
      // Don't leak internal error details
      reject(new Error('Failed to connect to backend service'));
    });

    // Enforce timeout
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

// Export forwardRequest for testing (allows replacement)
exports._forwardRequest = forwardRequest;

// Internal helper to get forwardRequest (allows mocking in tests)
function getForwardRequest() {
  return exports._forwardRequest;
}

// Check if user is employee (for send endpoint)
async function requireEmployee(req, res) {
  const decoded = await requireAuth(req, res);
  if (!decoded) return null; // Response already sent

  const uid = decoded.uid;
  const email = decoded.email || '';
  const employeeInfo = await isEmployee(uid, email);

  if (!employeeInfo.isEmployee) {
    res.status(403).json({
      success: false,
      error: 'employee_only',
      message: 'Only employees can send messages',
    });
    return null;
  }

  req.employeeInfo = employeeInfo;
  return employeeInfo;
}

/**
 * POST /whatsappProxySend handler
 * 
 * Send WhatsApp message via proxy with owner/co-writer policy enforcement.
 * Creates outbox entry server-side (server-only writes).
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
async function sendHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'method_not_allowed',
      message: 'Only POST method is allowed',
    });
  }

  try {
    // Validate request body EARLY (before any Firestore reads)
    const { threadId, accountId, toJid, text, clientMessageId } = req.body;

    if (!threadId || !accountId || !toJid || !text || !clientMessageId) {
      return res.status(400).json({
        success: false,
        error: 'invalid_request',
        message: 'Missing required fields: threadId, accountId, toJid, text, clientMessageId',
      });
    }

    // Require employee auth EARLY (before any Firestore reads)
    const employeeInfo = await requireEmployee(req, res);
    if (!employeeInfo) return; // Response already sent (401/403)

    const uid = req.user.uid;
    const email = req.user.email || '';

    const db = admin.firestore();

    // Read thread document (only after validations pass)
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
    
    // SECURITY: Validate accountId matches thread accountId (prevent spoofing)
    if (threadData?.accountId !== accountId) {
      return res.status(403).json({
        success: false,
        error: 'account_mismatch',
        message: 'Thread accountId does not match request accountId',
      });
    }

    const ownerUid = threadData?.ownerUid;
    const coWriterUids = threadData?.coWriterUids || [];

    // Duplicate guard: if last outbound message matches within 2s, skip
    try {
      const lastText = (threadData?.lastMessageText || threadData?.lastMessagePreview || '').trim();
      const lastDirection = (threadData?.lastMessageDirection || '').toLowerCase();
      const lastAt = threadData?.lastMessageAt;
      let lastMillis = null;
      if (lastAt && typeof lastAt.toMillis === 'function') {
        lastMillis = lastAt.toMillis();
      } else if (lastAt?._seconds) {
        lastMillis = lastAt._seconds * 1000;
      }
      if (lastMillis &&
          lastText === text &&
          (lastDirection === 'outbound' || lastDirection === 'out') &&
          Date.now() - lastMillis < 2000) {
        return res.status(200).json({
          success: true,
          requestId: 'dup_last_message',
          duplicate: true,
          message: 'Duplicate send suppressed (recent outbound)',
        });
      }
    } catch (_) {
      // Ignore duplicate guard errors
    }

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
    const crypto = require('crypto');
    const requestIdInput = `${threadId}|${uid}|${clientMessageId}`;
    const requestId = crypto.createHash('sha256').update(requestIdInput).digest('hex');

    // Use transaction to atomically:
    // 1. Check outbox doc exists (idempotency)
    // 2. Read thread to get latest state
    // 3. Set ownerUid if needed
    // 4. Create outbox doc
    let duplicate = false;
    await db.runTransaction(async (transaction) => {
      // IMPORTANT: ALL READS MUST BE BEFORE ALL WRITES IN FIRESTORE TRANSACTIONS
      
      // Read 1: Check if outbox doc already exists (idempotency)
      const outboxRef = db.collection('outbox').doc(requestId);
      const outboxDoc = await transaction.get(outboxRef);

      if (outboxDoc.exists) {
        duplicate = true;
        return; // Don't create duplicate
      }

      // Read 2: Re-read thread to get latest state
      const latestThreadDoc = await transaction.get(threadRef);
      const latestThreadData = latestThreadDoc.data();

      // Write 1: Set ownerUid if needed (atomic)
      if (shouldSetOwner && !latestThreadData?.ownerUid) {
        transaction.update(threadRef, {
          ownerUid: uid,
          // Initialize coWriterUids as empty array if missing
          coWriterUids: latestThreadData?.coWriterUids || [],
        });
      }

      // Write 2: Create outbox document (server-only write via Admin SDK)
      const outboxData = {
        requestId,
        threadId,
        accountId,
        toJid,
        body: text,
        payload: { text },
        status: 'queued',
        attemptCount: 0,
        nextAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: uid,
      };

      transaction.set(outboxRef, outboxData);
    });

    // Also persist outbound message to thread (so UI shows immediately)
    // Use requestId so outbox worker can update status later.
    if (!duplicate) {
      const messageRef = threadRef.collection('messages').doc(requestId);
      await messageRef.set({
        accountId,
        clientJid: toJid,
        direction: 'outbound',
        body: text,
        status: 'queued',
        tsClient: new Date().toISOString(),
        tsServer: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        messageType: 'text',
        clientMessageId,
      }, { merge: true });

      await threadRef.set({
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessagePreview: text.substring(0, 100),
        lastMessageText: text.substring(0, 100),
        lastMessageDirection: 'outbound',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

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
    console.error('[whatsappProxy/send] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'internal_error',
      message: 'Internal server error',
    });
  }
}

exports.send = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 1, // Reduce CPU quota pressure
  },
  sendHandler
);

// Export handler for testing
exports.sendHandler = sendHandler;

/**
 * GET /whatsappProxyGetAccounts handler
 * 
 * Get list of WhatsApp accounts from backend.
 * SECURITY: Super-admin only (QR codes are sensitive).
 */
async function getAccountsHandler(req, res) {
    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        error: 'method_not_allowed',
        message: 'Only GET method is allowed',
      });
    }

    try {
      // Require super-admin auth (QR codes are sensitive)
      const isSuperAdmin = await requireSuperAdmin(req, res);
      if (!isSuperAdmin) return; // Response already sent (401/403)

      // Lazy-load backend base URL (computed at handler runtime, not module load time)
      const backendBaseUrl = getBackendBaseUrl();
      if (!backendBaseUrl) {
        console.error('[whatsappProxy/getAccounts] WHATSAPP_BACKEND_URL missing');
        console.error('[whatsappProxy/getAccounts] process.env.WHATSAPP_BACKEND_URL:', process.env.WHATSAPP_BACKEND_URL ? 'SET' : 'NOT SET');
        return res.status(500).json({
          success: false,
          error: 'configuration_missing',
          message: 'WHATSAPP_BACKEND_BASE_URL or WHATSAPP_BACKEND_URL must be set (env or functions.config().whatsapp.backend_base_url)',
        });
      }
      
      console.log('[whatsappProxy/getAccounts] Backend URL:', backendBaseUrl.substring(0, 30) + '...');

      // Forward to backend
      const backendUrl = `${backendBaseUrl}/api/whatsapp/accounts`;
      const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || `getAccounts_${Date.now()}`;
      console.log(`[whatsappProxy/getAccounts] Calling backend: ${backendUrl}, correlationId=${correlationId}`);
      const response = await getForwardRequest()(backendUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId, // Forward correlation ID for end-to-end tracing
        },
      });

      // Forward backend response, propagate status codes and body
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return res.status(response.statusCode).json(response.body);
      } else {
        // Special handling for specific status codes - propagate as-is
        if (response.statusCode === 503) {
          // PASSIVE mode - propagate full response
          return res.status(503).json(response.body || {
            success: false,
            error: 'passive_mode',
            message: 'Backend in PASSIVE mode',
          });
        } else if (response.statusCode === 404) {
          // Not found - propagate
          return res.status(404).json(response.body || {
            success: false,
            error: 'account_not_found',
            message: 'Account not found',
          });
        } else if (response.statusCode === 409) {
          // Conflict - propagate
          return res.status(409).json(response.body || {
            success: false,
            error: 'invalid_state',
            message: 'Invalid state',
          });
        } else if (response.statusCode === 429) {
          // Rate limited - propagate
          return res.status(429).json(response.body || {
            success: false,
            error: 'rate_limited',
            message: 'Rate limit exceeded',
          });
        } else if (response.statusCode === 401) {
          // Unauthorized - propagate (critical for 401 loop debugging)
          return res.status(401).json(response.body || {
            success: false,
            error: 'unauthorized',
            message: 'Unauthorized - authentication required or session expired',
          });
        } else if (response.statusCode === 403) {
          // Forbidden - propagate
          return res.status(403).json(response.body || {
            success: false,
            error: 'forbidden',
            message: 'Forbidden - insufficient permissions',
          });
        }
        
        // For other errors, return 500 but include backend error details
        return res.status(500).json({
          success: false,
          error: 'backend_error',
          message: `Backend service returned an error (status: ${response.statusCode})`,
          upstreamStatusCode: response.statusCode,
          ...(response.body && typeof response.body === 'object' ? response.body : {}),
        });
      }
    } catch (error) {
      console.error('[whatsappProxy/getAccounts] Error:', error.message);
      // Don't log full error object (might contain sensitive info)
      return res.status(500).json({
        success: false,
        error: 'internal_error',
        message: 'Internal server error',
      });
    }
}

/**
 * POST /whatsappProxyAddAccount handler
 * 
 * Add a new WhatsApp account via backend.
 * Requires super-admin authentication.
 */
async function addAccountHandler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'method_not_allowed',
        message: 'Only POST method is allowed',
      });
    }

    try {
      // Require super-admin auth
      const isSuperAdmin = await requireSuperAdmin(req, res);
      if (!isSuperAdmin) return; // Response already sent (401/403)

      // Lazy-load backend base URL (computed at handler runtime, not module load time)
      const backendBaseUrl = getBackendBaseUrl();
      if (!backendBaseUrl) {
        return res.status(500).json({
          success: false,
          error: 'configuration_missing',
          message: 'WHATSAPP_BACKEND_BASE_URL or WHATSAPP_BACKEND_URL must be set (env or functions.config().whatsapp.backend_base_url)',
        });
      }

      // Validate request body
      const { name, phone } = req.body;

      // Validate name
      const nameValidation = validateName(name);
      if (!nameValidation.valid) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: nameValidation.error,
        });
      }

      // Validate phone
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.valid) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: phoneValidation.error,
        });
      }

      // Forward to backend with normalized values
      const backendUrl = `${backendBaseUrl}/api/whatsapp/add-account`;
      const response = await getForwardRequest()(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }, {
        name: nameValidation.normalized,
        phone: phoneValidation.normalized,
      });

      // Forward backend response, but sanitize non-2xx errors
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return res.status(response.statusCode).json(response.body);
      } else {
        // Special handling for 503 (PASSIVE mode) - propagate error message with full details
        if (response.statusCode === 503) {
          return res.status(503).json({
            success: false,
            error: response.body?.error || 'passive_mode',
            message: response.body?.message || response.body?.error || 'Backend in PASSIVE mode - lock not acquired',
            mode: response.body?.mode || 'passive',
            instanceId: response.body?.instanceId,
            holderInstanceId: response.body?.holderInstanceId,
            retryAfterSeconds: response.body?.retryAfterSeconds || 15,
            waMode: response.body?.waMode || 'passive',
            requestId: response.body?.requestId,
          });
        } else if (response.statusCode === 401) {
          // Unauthorized - propagate (critical for 401 loop debugging)
          return res.status(401).json({
            success: false,
            error: response.body?.error || 'unauthorized',
            message: response.body?.message || 'Unauthorized - authentication required or session expired',
            ...(response.body && typeof response.body === 'object' ? {
              backendError: response.body.error,
              backendMessage: response.body.message,
              backendAccountId: response.body.accountId,
            } : {}),
          });
        } else if (response.statusCode === 403) {
          // Forbidden - propagate
          return res.status(403).json({
            success: false,
            error: response.body?.error || 'forbidden',
            message: response.body?.message || 'Forbidden - insufficient permissions',
            ...(response.body && typeof response.body === 'object' ? response.body : {}),
          });
        }
        
        // For other errors, return safe message but include status code
        return res.status(500).json({
          success: false,
          error: 'backend_error',
          message: `Backend service returned an error (status: ${response.statusCode})`,
          upstreamStatusCode: response.statusCode,
          ...(response.body && typeof response.body === 'object' && response.body.error ? {
            backendError: response.body.error,
            backendMessage: response.body.message || response.body.error,
          } : {}),
        });
      }
    } catch (error) {
      console.error('[whatsappProxy/addAccount] Error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'internal_error',
        message: 'Internal server error',
      });
    }
}

/**
 * DELETE /whatsappProxyDeleteAccount handler
 * 
 * Delete a WhatsApp account via backend.
 * Requires super-admin authentication.
 */
async function deleteAccountHandler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'method_not_allowed',
      message: 'Only DELETE or POST method is allowed',
    });
  }

  try {
    // Require super-admin auth
    const isSuperAdmin = await requireSuperAdmin(req, res);
    if (!isSuperAdmin) return; // Response already sent (401/403)

    // Lazy-load backend base URL
    const backendBaseUrl = getBackendBaseUrl();
    if (!backendBaseUrl) {
      return res.status(500).json({
        success: false,
        error: 'configuration_missing',
        message: 'WHATSAPP_BACKEND_BASE_URL or WHATSAPP_BACKEND_URL must be set (env or functions.config().whatsapp.backend_base_url)',
      });
    }

    // Extract and validate accountId
    const accountId = req.query.accountId || req.body.accountId;
    if (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'invalid_request',
        message: 'Missing or invalid accountId (query parameter or body)',
      });
    }

    // Forward to backend
    const backendUrl = `${backendBaseUrl}/api/whatsapp/accounts/${accountId.trim()}`;
    const response = await getForwardRequest()(backendUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Forward backend response, but sanitize non-2xx errors
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return res.status(response.statusCode).json(response.body);
    } else {
      return res.status(500).json({
        success: false,
        error: 'backend_error',
        message: 'Backend service returned an error',
      });
    }
  } catch (error) {
    console.error('[whatsappProxy/deleteAccount] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'internal_error',
      message: 'Internal server error',
    });
  }
}

/**
 * POST /whatsappProxyBackfillAccount handler
 * 
 * Trigger backfill for a WhatsApp account via backend.
 * Requires super-admin authentication.
 */
async function backfillAccountHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'method_not_allowed',
      message: 'Only POST method is allowed',
    });
  }

  try {
    // Require super-admin auth
    const isSuperAdmin = await requireSuperAdmin(req, res);
    if (!isSuperAdmin) return; // Response already sent (401/403)

    // Lazy-load backend base URL
    const backendBaseUrl = getBackendBaseUrl();
    if (!backendBaseUrl) {
      return res.status(500).json({
        success: false,
        error: 'configuration_missing',
        message: 'WHATSAPP_BACKEND_BASE_URL or WHATSAPP_BACKEND_URL must be set (env or functions.config().whatsapp.backend_base_url)',
      });
    }

    // Extract and validate accountId
    const accountId = req.query.accountId || req.body.accountId;
    if (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'invalid_request',
        message: 'Missing or invalid accountId (query parameter or body)',
      });
    }

    // Forward to backend
    const backendUrl = `${backendBaseUrl}/api/whatsapp/backfill/${accountId.trim()}`;
    const response = await getForwardRequest()(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers['authorization'] ? `Bearer ${process.env.ADMIN_TOKEN || ''}` : undefined,
      },
    });

    // Forward backend response, but sanitize non-2xx errors
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return res.status(response.statusCode).json(response.body);
    } else {
      return res.status(500).json({
        success: false,
        error: 'backend_error',
        message: 'Backend service returned an error',
      });
    }
  } catch (error) {
    console.error('[whatsappProxy/backfillAccount] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'internal_error',
      message: 'Internal server error',
    });
  }
}

/**
 * GET /whatsappProxyGetThreads handler
 *
 * Returns threads directly from Firestore (no backend base URL required).
 * SECURITY: Employee-only.
 */
async function getThreadsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'method_not_allowed',
      message: 'Only GET method is allowed',
    });
  }

  try {
    const employeeInfo = await requireEmployee(req, res);
    if (!employeeInfo) return;

    const accountId = (req.query.accountId || '').toString().trim();
    const limit = Math.min(parseInt(req.query.limit || '500', 10) || 500, 500);

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'invalid_request',
        message: 'Missing required query param: accountId',
      });
    }

    const db = admin.firestore();
    const snapshot = await db
      .collection('threads')
      .where('accountId', '==', accountId)
      .orderBy('lastMessageAt', 'desc')
      .limit(limit)
      .get();

    const threads = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({
      success: true,
      threads,
      count: threads.length,
    });
  } catch (error) {
    console.error('[whatsappProxy/getThreads] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'internal_error',
      message: 'Internal server error',
    });
  }
}

// Export handlers for use in index.js
exports.getAccounts = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 1, // Reduce CPU quota pressure
  },
  getAccountsHandler
);

// Export handler for testing
exports.getAccountsHandler = getAccountsHandler;

exports.getThreads = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 1,
  },
  getThreadsHandler
);

exports.getThreadsHandler = getThreadsHandler;

exports.addAccount = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 1, // Reduce CPU quota pressure
  },
  addAccountHandler
);

// Export handler for testing
exports.addAccountHandler = addAccountHandler;

exports.regenerateQr = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 1, // Reduce CPU quota pressure
  },
  regenerateQrHandler
);

// Export handler for testing
exports.regenerateQrHandler = regenerateQrHandler;

exports.deleteAccount = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 1, // Reduce CPU quota pressure
  },
  deleteAccountHandler
);

// Export handler for testing
exports.deleteAccountHandler = deleteAccountHandler;

exports.backfillAccount = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 1, // Reduce CPU quota pressure
  },
  backfillAccountHandler
);

// Export handler for testing
exports.backfillAccountHandler = backfillAccountHandler;

/**
 * POST /whatsappProxyRegenerateQr handler
 * 
 * Regenerate QR code for a WhatsApp account via backend.
 * Requires super-admin authentication.
 */
async function regenerateQrHandler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'method_not_allowed',
        message: 'Only POST method is allowed',
      });
    }

    try {
      // Require super-admin auth
      const isSuperAdmin = await requireSuperAdmin(req, res);
      if (!isSuperAdmin) return; // Response already sent (401/403)

      // Lazy-load backend base URL (computed at handler runtime, not module load time)
      const backendBaseUrl = getBackendBaseUrl();
      if (!backendBaseUrl) {
        return res.status(500).json({
          success: false,
          error: 'configuration_missing',
          message: 'WHATSAPP_BACKEND_BASE_URL or WHATSAPP_BACKEND_URL must be set (env or functions.config().whatsapp.backend_base_url)',
        });
      }

      // Extract and validate accountId
      const accountId = req.query.accountId || req.body.accountId;
      if (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Missing or invalid accountId (query parameter or body)',
        });
      }

      // Extract requestId and correlationId from headers for correlation
      const requestId = req.headers['x-request-id'] || `proxy_${Date.now()}`;
      const correlationId = req.headers['x-correlation-id'] || requestId;
      
      // DEBUG MODE: Check if super-admin requested debug info (X-Debug header + non-production)
      const isDebugMode = req.headers['x-debug'] === 'true' && 
                          process.env.GCLOUD_PROJECT !== 'superparty-frontend' &&
                          process.env.FUNCTIONS_EMULATOR === 'true';
      const userEmail = req.user?.email || '';
      const isSuperAdminDebug = isDebugMode && userEmail === SUPER_ADMIN_EMAIL;
      
      // Forward to backend
      const backendUrl = `${backendBaseUrl}/api/whatsapp/regenerate-qr/${accountId.trim()}`;
      console.log(`[whatsappProxy/regenerateQr] Calling backend: ${backendUrl}, requestId=${requestId}, correlationId=${correlationId}, debugMode=${isSuperAdminDebug}`);
      
      const response = await getForwardRequest()(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId, // Forward requestId to backend
          'X-Correlation-Id': correlationId, // Forward correlation ID for end-to-end tracing
        },
      });

      // Extract short error ID from backend response for correlation
      const errorId = response.body?.error || response.body?.errorCode || 'unknown';
      const shortErrorId = typeof errorId === 'string' ? errorId.substring(0, 20) : 'unknown';
      
      console.log(`[whatsappProxy/regenerateQr] Backend response: status=${response.statusCode}, errorId=${shortErrorId}, requestId=${requestId}, debugMode=${isSuperAdminDebug}`);

      // Forward backend response, but sanitize non-2xx errors
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return res.status(response.statusCode).json({
          ...response.body,
          requestId: requestId, // Ensure requestId is in response
        });
      } else {
        // CRITICAL: Log full backend response body for non-2xx to diagnose root cause
        // This is essential because proxy masks upstream errors as generic 500
        const backendBody = response.body || {};
        const backendBodyStr = typeof backendBody === 'string' 
          ? backendBody 
          : JSON.stringify(backendBody);
        const backendBodyPreview = backendBodyStr.length > 500 
          ? backendBodyStr.substring(0, 500) + '...' 
          : backendBodyStr;
        
        console.error(`[whatsappProxy/regenerateQr] Backend error (non-2xx): status=${response.statusCode}, requestId=${requestId}`);
        console.error(`[whatsappProxy/regenerateQr] Backend error body: ${backendBodyPreview}`);
        console.error(`[whatsappProxy/regenerateQr] Backend error details: error=${backendBody.error || 'none'}, message=${backendBody.message || 'none'}, status=${backendBody.status || 'none'}, accountId=${backendBody.accountId || 'none'}`);
        
        // Special handling for 503 (PASSIVE mode) - propagate error message with full details
        if (response.statusCode === 503) {
          return res.status(503).json({
            success: false,
            error: response.body?.error || 'passive_mode',
            message: response.body?.message || response.body?.error || 'Backend in PASSIVE mode - lock not acquired',
            mode: response.body?.mode || 'passive',
            instanceId: response.body?.instanceId,
            holderInstanceId: response.body?.holderInstanceId,
            retryAfterSeconds: response.body?.retryAfterSeconds || 15,
            waMode: response.body?.waMode || 'passive',
            requestId: requestId,
          });
        } else if (response.statusCode === 401) {
          // Unauthorized - propagate (critical for 401 loop debugging)
          return res.status(401).json({
            success: false,
            error: response.body?.error || 'unauthorized',
            message: response.body?.message || 'Unauthorized - authentication required or session expired',
            requestId: requestId,
            ...(response.body && typeof response.body === 'object' ? {
              backendError: response.body.error,
              backendMessage: response.body.message,
              backendAccountId: response.body.accountId,
            } : {}),
          });
        } else if (response.statusCode === 403) {
          // Forbidden - propagate
          return res.status(403).json({
            success: false,
            error: response.body?.error || 'forbidden',
            message: response.body?.message || 'Forbidden - insufficient permissions',
            requestId: requestId,
            ...(response.body && typeof response.body === 'object' ? response.body : {}),
          });
        }
        
        // For other 4xx/5xx errors, return structured error with requestId
        // Include backend error details for debugging (not just generic message)
        const httpStatus = response.statusCode;
        // backendBody already declared above, reuse it
        
        // DEBUG MODE: For super-admin in debug mode, include backendStatusCode and backendErrorSafe
        const debugInfo = isSuperAdminDebug ? {
          backendStatusCode: httpStatus,
          backendErrorSafe: typeof backendBody.error === 'string' 
            ? backendBody.error.substring(0, 50) 
            : (backendBody.errorCode || 'unknown_error'),
          backendStatus: backendBody.status,
          backendAccountId: backendBody.accountId,
          backendRequestId: backendBody.requestId,
        } : {};
        
        return res.status(httpStatus >= 400 && httpStatus < 500 ? httpStatus : 500).json({
          success: false,
          error: `UPSTREAM_HTTP_${httpStatus}`,
          message: backendBody.message || `Backend service returned an error (status: ${httpStatus})`,
          requestId: requestId,
          hint: `Check backend logs for requestId: ${requestId}`,
          upstreamStatusCode: httpStatus,
          // Include backend error code and status for debugging (always logged server-side)
          // For debug mode, also include in response (only for super-admin in non-production)
          ...(response.body && typeof response.body === 'object' ? {
            backendError: response.body.error || response.body.errorCode,
            backendStatus: response.body.status,
            backendMessage: response.body.message,
            backendAccountId: response.body.accountId,
          } : {}),
          ...debugInfo, // Only included for super-admin in debug mode
        });
      }
    } catch (error) {
      const requestId = req.headers['x-request-id'] || `proxy_${Date.now()}`;
      console.error(`[whatsappProxy/regenerateQr] Error: ${error.message}, requestId=${requestId}, stack=${error.stack?.substring(0, 200)}`);
      return res.status(500).json({
        success: false,
        error: 'internal_error',
        message: 'Internal server error',
        requestId: requestId,
        hint: `Check Functions logs for requestId: ${requestId}`,
      });
    }
  }
