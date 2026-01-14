'use strict';

/**
 * WhatsApp Backend Proxy - QR Connect Routes Only
 * 
 * Secure proxy for Flutter app to interact with Railway WhatsApp backend.
 * Provides account management and QR code generation for WhatsApp connections.
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const https = require('https');
const http = require('http');

// Super admin email
const SUPER_ADMIN_EMAIL = 'ursache.andrei1995@gmail.com';

// Railway backend base URL - REQUIRED (fail fast if missing)
// Supports both v1 functions.config() and v2 process.env/defineSecret
function getRailwayBaseUrl() {
  // Try v2 process.env first (for v2 functions)
  if (process.env.WHATSAPP_RAILWAY_BASE_URL) {
    return process.env.WHATSAPP_RAILWAY_BASE_URL;
  }

  // Try v1 functions.config() (for v1 functions)
  try {
    const functions = require('firebase-functions');
    const config = functions.config();
    if (config?.whatsapp?.railway_base_url) {
      return config.whatsapp.railway_base_url;
    }
  } catch (e) {
    // functions.config() not available (v2 functions or test environment)
  }

  // Fail fast in production, but allow tests to mock
  if (process.env.NODE_ENV === 'production' || process.env.FIREBASE_CONFIG) {
    throw new Error(
      'WHATSAPP_RAILWAY_BASE_URL must be set via environment variable or functions.config().whatsapp.railway_base_url'
    );
  }

  // In test/dev, return a placeholder (tests will mock forwardRequest anyway)
  return 'https://test-railway-url.invalid';
}

const RAILWAY_BASE_URL = getRailwayBaseUrl();
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
 * Forward HTTP request to Railway backend
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
        'Authorization': undefined, // Don't forward client auth to Railway
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
    // Require employee auth
    const employeeInfo = await requireEmployee(req, res);
    if (!employeeInfo) return; // Response already sent (401/403)

    const uid = req.user.uid;
    const email = req.user.email || '';

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
          // Initialize coWriterUids as empty array if missing (don't use arrayUnion with no args)
          coWriterUids: latestThreadData?.coWriterUids || [],
        });
      }

      // Check if outbox doc already exists (idempotency)
      const outboxRef = db.collection('outbox').doc(requestId);
      const outboxDoc = await transaction.get(outboxRef);

      if (outboxDoc.exists) {
        duplicate = true;
        return; // Don't create duplicate
      }

      // Create outbox document (server-only write via Admin SDK)
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
  },
  sendHandler
);

// Export handler for testing
exports.sendHandler = sendHandler;

/**
 * GET /whatsappProxyGetAccounts handler
 * 
 * Get list of WhatsApp accounts from Railway backend.
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

      // Forward to Railway backend
      const railwayUrl = `${RAILWAY_BASE_URL}/api/whatsapp/accounts`;
      const response = await getForwardRequest()(railwayUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Forward Railway response, but sanitize non-2xx errors
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return res.status(response.statusCode).json(response.body);
      } else {
        // Non-2xx: return safe error message (don't leak Railway internals)
        return res.status(500).json({
          success: false,
          error: 'backend_error',
          message: 'Backend service returned an error',
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
 * Add a new WhatsApp account via Railway backend.
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

      // Forward to Railway backend with normalized values
      const railwayUrl = `${RAILWAY_BASE_URL}/api/whatsapp/add-account`;
      const response = await getForwardRequest()(railwayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }, {
        name: nameValidation.normalized,
        phone: phoneValidation.normalized,
      });

      // Forward Railway response, but sanitize non-2xx errors
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return res.status(response.statusCode).json(response.body);
      } else {
        // Non-2xx: return safe error message
        return res.status(500).json({
          success: false,
          error: 'backend_error',
          message: 'Backend service returned an error',
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

// Export handlers for use in index.js
exports.getAccounts = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  getAccountsHandler
);

exports.addAccount = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  addAccountHandler
);

exports.regenerateQr = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  regenerateQrHandler
);

/**
 * POST /whatsappProxyRegenerateQr handler
 * 
 * Regenerate QR code for a WhatsApp account via Railway backend.
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

      // Extract and validate accountId
      const accountId = req.query.accountId || req.body.accountId;
      if (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Missing or invalid accountId (query parameter or body)',
        });
      }

      // Forward to Railway backend
      const railwayUrl = `${RAILWAY_BASE_URL}/api/whatsapp/regenerate-qr/${accountId.trim()}`;
      const response = await getForwardRequest()(railwayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Forward Railway response, but sanitize non-2xx errors
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return res.status(response.statusCode).json(response.body);
      } else {
        // Non-2xx: return safe error message
        return res.status(500).json({
          success: false,
          error: 'backend_error',
          message: 'Backend service returned an error',
        });
      }
    } catch (error) {
      console.error('[whatsappProxy/regenerateQr] Error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'internal_error',
        message: 'Internal server error',
      });
    }
  }
