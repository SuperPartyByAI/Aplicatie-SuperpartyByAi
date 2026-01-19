require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { useFirestoreAuthState } = require('./lib/persistence/firestore-auth');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const crypto = require('crypto');

// Initialize Sentry
const { Sentry, logger } = require('./sentry');

// Initialize Better Stack (Logtail)
const logtail = require('./logtail');

// Initialize Cache (Redis with fallback to memory)
const cache = require('./redis-cache');

// Swagger documentation
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

// Feature Flags
const featureFlags = require('./feature-flags');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Canonicalize phone number to E.164 format
 * @param {string} input - Phone number in any format
 * @returns {string} - E.164 format (e.g., +40737571397)
 */
function canonicalPhone(input) {
  if (!input) return null;

  // Remove all non-digit characters
  let digits = input.replace(/\D/g, '');

  // If starts with 0, assume Romanian number (replace 0 with +40)
  if (digits.startsWith('0')) {
    digits = '40' + digits.substring(1);
  }

  // Add + prefix if not present
  if (!digits.startsWith('+')) {
    digits = '+' + digits;
  }

  return digits;
}

/**
 * Generate deterministic accountId from phone number
 * @param {string} phone - Phone number (will be canonicalized)
 * @returns {string} - Deterministic accountId (stable across environments)
 */
function generateAccountId(phone) {
  const canonical = canonicalPhone(phone);
  const hash = crypto.createHash('sha256').update(canonical).digest('hex').substring(0, 32);
  
  // Use stable namespace (not NODE_ENV which can differ between instances)
  // Default to 'prod' for backwards compatibility with existing accounts
  const namespace = process.env.ACCOUNT_NAMESPACE || 'prod';
  return `account_${namespace}_${hash}`;
}

/**
 * Find accountId by phone (with backwards compatibility)
 * Tries new stable id first, then legacy ids (account_dev_*, account_production_*)
 * @param {string} phone - Phone number (canonicalized)
 * @returns {Promise<string|null>} - AccountId if found, null otherwise
 */
async function findAccountIdByPhone(phone) {
  const canonical = canonicalPhone(phone);
  const hash = crypto.createHash('sha256').update(canonical).digest('hex').substring(0, 32);
  
  if (!firestoreAvailable || !db) {
    // Fallback: try stable id only
    const stableId = `account_prod_${hash}`;
    return stableId;
  }

  // Try stable id first (account_prod_*)
  const stableId = `account_prod_${hash}`;
  const stableDoc = await db.collection('accounts').doc(stableId).get();
  if (stableDoc.exists) {
    return stableId;
  }

  // Try legacy ids for backwards compatibility
  const legacyIds = [
    `account_dev_${hash}`,
    `account_development_${hash}`,
    `account_production_${hash}`,
  ];

  for (const legacyId of legacyIds) {
    const legacyDoc = await db.collection('accounts').doc(legacyId).get();
    if (legacyDoc.exists) {
      console.log(`ℹ️  Found account with legacy id: ${legacyId} (migrating to stable id: ${stableId})`);
      // Optionally migrate to stable id (copy data, but don't delete legacy)
      // For now, just return legacy id
      return legacyId;
    }
  }

  // Not found - return stable id for new account creation
  return stableId;
}

/**
 * Mask phone number for logging (show first 3 and last 2 digits)
 * @param {string} phone - Phone number
 * @returns {string} - Masked phone (e.g., +407****97)
 */
function maskPhone(phone) {
  if (!phone || phone.length < 6) return '[REDACTED]';
  return phone.substring(0, 4) + '****' + phone.substring(phone.length - 2);
}

// ============================================================================
// ACCOUNT CONNECTION REGISTRY (Prevent duplicate sockets)
// ============================================================================

class AccountConnectionRegistry {
  constructor() {
    this.locks = new Map(); // accountId -> { connecting: boolean, connectedAt: timestamp, connectingSince: timestamp }
    this.CONNECTING_TTL_MS = 90_000; // 90s - TTL for stale connecting locks
  }

  /**
   * Try to acquire lock for connecting
   * @returns {boolean} - true if acquired, false if already connecting/connected
   */
  tryAcquire(accountId) {
    const existing = this.locks.get(accountId);

    if (existing && existing.connecting) {
      const age = Date.now() - (existing.connectingSince || Date.now());
      if (age > this.CONNECTING_TTL_MS) {
        // Stale lock - force release to prevent deadlock
        console.log(`⚠️  [${accountId}] Stale connecting lock (${Math.round(age / 1000)}s old), forcing release`);
        this.locks.delete(accountId);
      } else {
        console.log(`⚠️  [${accountId}] Already connecting, skipping duplicate`);
        return false;
      }
    }

    if (existing && existing.connectedAt && Date.now() - existing.connectedAt < 5000) {
      console.log(
        `⚠️  [${accountId}] Recently connected (${Date.now() - existing.connectedAt}ms ago), skipping duplicate`
      );
      return false;
    }

    this.locks.set(accountId, { connecting: true, connectedAt: null, connectingSince: Date.now() });
    console.log(`🔒 [${accountId}] Connection lock acquired`);
    return true;
  }

  /**
   * Mark connection as established
   */
  markConnected(accountId) {
    this.locks.set(accountId, { connecting: false, connectedAt: Date.now(), connectingSince: null });
    console.log(`✅ [${accountId}] Connection lock: marked as connected`);
  }

  /**
   * Release lock
   */
  release(accountId) {
    this.locks.delete(accountId);
    console.log(`🔓 [${accountId}] Connection lock released`);
  }
}

const connectionRegistry = new AccountConnectionRegistry();

const app = express();
const PORT = process.env.PORT || 8080; // Railway injects PORT
const MAX_ACCOUNTS = 30;

// Health monitoring and auto-recovery
const connectionHealth = new Map(); // accountId -> { lastEventAt, lastMessageAt, reconnectCount, isStale }
const STALE_CONNECTION_THRESHOLD = 5 * 60 * 1000; // 5 minutes without events = stale
const HEALTH_CHECK_INTERVAL = 60 * 1000; // Check every 60 seconds

// Session stability tracking
const sessionStability = new Map(); // accountId -> { lastRestoreAt, restoreCount, lastStableAt }

// Admin token for protected endpoints
// CRITICAL: In production (Railway), ADMIN_TOKEN must be set via env var (no random fallback)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || (process.env.NODE_ENV === 'production' 
  ? null // Fail fast in prod if missing
  : 'dev-token-' + Math.random().toString(36).substring(7)); // Random only in dev
if (!ADMIN_TOKEN) {
  console.error('❌ ADMIN_TOKEN is required in production. Set it via Railway env var.');
  process.exit(1);
}
console.log(`🔐 ADMIN_TOKEN configured: ${ADMIN_TOKEN.substring(0, 10)}...`);

// ONE_TIME_TEST_TOKEN for orchestrator (30 min validity)
const ONE_TIME_TEST_TOKEN = 'test-' + Math.random().toString(36).substring(2, 15);
const TEST_TOKEN_EXPIRY = Date.now() + 30 * 60 * 1000;
console.log(`🧪 ONE_TIME_TEST_TOKEN: ${ONE_TIME_TEST_TOKEN} (valid 30min)`);

// Trust Railway proxy for rate limiting
app.set('trust proxy', 1);

// Use hybrid: disk for Baileys, Firestore for backup/restore
const USE_FIRESTORE_BACKUP = true;
console.log(`🔧 Auth: disk + Firestore backup`);

// Initialize Firebase Admin with Railway env var
let firestoreAvailable = false;
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      // Validate JSON format before parsing
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      } catch (parseError) {
        console.error('❌ FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
        console.log('⚠️  Continuing without Firestore...');
        serviceAccount = null;
      }

      if (serviceAccount) {
        // Validate required fields
        const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
        const missingFields = requiredFields.filter(field => !serviceAccount[field]);

        if (missingFields.length > 0) {
          console.error(
            `❌ FIREBASE_SERVICE_ACCOUNT_JSON missing required fields: ${missingFields.join(', ')}`
          );
          console.log('⚠️  Continuing without Firestore...');
        } else {
          // Initialize Firebase Admin
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
          firestoreAvailable = true;
          console.log('✅ Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON');
        }
      }
    } else {
      console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT_JSON not set - Firestore disabled');
    }
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', {
      code: error.code,
      message: error.message,
    });
    console.log('⚠️  Continuing without Firestore...');
  }
}

const db = firestoreAvailable ? admin.firestore() : null;

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'https://superparty-frontend.web.app',
        'https://superparty-frontend.firebaseapp.com',
        'http://localhost:5173',
        'http://localhost:3000',
      ];

      // Allow Gitpod preview URLs (*.gitpod.dev)
      const isGitpod = origin && origin.includes('.gitpod.dev');

      if (!origin || allowedOrigins.includes(origin) || isGitpod) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Handle preflight requests explicitly
app.options('*', cors());

app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Async error handler wrapper (prevents unhandled promise rejections in routes)
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global rate limiting: 200 requests per IP per minute
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: {
    success: false,
    error: 'Too many requests. Limit: 200 per minute per IP.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

// Rate limiting for message sending: 30 messages per IP per minute
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: 'Too many messages. Limit: 30 per minute per IP.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for account operations: 10 per IP per minute
const accountLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many account operations. Limit: 10 per minute per IP.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for QR regeneration: 30 per IP per minute (more permissive since it's a user action)
const qrRegenerateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: 'Too many QR regeneration requests. Limit: 30 per minute per IP. Please wait a moment.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// In-memory store for active connections
const connections = new Map();
const reconnectAttempts = new Map();
// Connection session ID counter per account (for debugging)
const connectionSessionIds = new Map(); // accountId -> sessionId (incremental)

// Note: makeInMemoryStore not available in Baileys 6.7.21
// Message handling works without store (events still emit)
console.log('📦 Baileys initialized (store not required)');

// Admin authentication middleware (ADMIN_TOKEN defined at line 18)
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.substring(7);
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }

  next();
}

// Test runs storage
const testRuns = new Map();
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_TIMEOUT_MS = 60000;

// Auth directory: use SESSIONS_PATH env var (Railway Volume)
// Priority: SESSIONS_PATH > RAILWAY_VOLUME_MOUNT_PATH > local fallback
const authDir =
  process.env.SESSIONS_PATH ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'baileys_auth')
    : path.join(__dirname, '.baileys_auth'));

// Ensure directory exists at startup
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
  console.log(`📁 Created auth directory: ${authDir}`);
} else {
  console.log(`📁 Auth directory exists: ${authDir}`);
}

// Check if directory is writable
let isWritable = false;
try {
  const testFile = path.join(authDir, '.write-test');
  fs.writeFileSync(testFile, 'test');
  fs.unlinkSync(testFile);
  isWritable = true;
} catch (error) {
  console.error(`❌ Auth directory not writable: ${error.message}`);
}

// Log session path configuration (sanitized, safe for operators)
console.log(`📁 SESSIONS_PATH: ${process.env.SESSIONS_PATH || 'NOT SET (using fallback)'}`);
console.log(`📁 Auth directory: ${authDir}`);
console.log(`📁 Sessions dir exists: ${fs.existsSync(authDir)}`);
console.log(`📁 Sessions dir writable: ${isWritable}`);

// CRITICAL: Verify SESSIONS_PATH is writable (fail fast if not)
// This prevents silent failures where sessions are lost on redeploy
if (!isWritable) {
  console.error('❌ CRITICAL: Auth directory is not writable!');
  console.error(`   Path: ${authDir}`);
  console.error('   Check: SESSIONS_PATH env var and Railway volume mount');
  console.error('   Fix: Create Railway volume and set SESSIONS_PATH=/data/sessions');
  process.exit(1);
}

const VERSION = '2.0.0';
let COMMIT_HASH = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) || null;
const BOOT_TIMESTAMP = new Date().toISOString();

// Long-run jobs (production-grade v2)
const longrunJobsModule = require('./lib/longrun-jobs-v2');
const longrunJobsInstance = null;

// Long-run schema and evidence endpoints
const LongRunSchemaComplete = require('./lib/longrun-schema-complete');
const EvidenceEndpoints = require('./lib/evidence-endpoints');
const DeployGuard = require('./lib/deploy-guard');
const waBootstrap = require('./lib/wa-bootstrap');
const LONGRUN_ADMIN_TOKEN = process.env.LONGRUN_ADMIN_TOKEN || ADMIN_TOKEN;
const START_TIME = Date.now();

console.log(`🚀 SuperParty WhatsApp Backend v${VERSION} (${COMMIT_HASH})`);
console.log(`📍 PORT: ${PORT}`);
console.log(`📁 Auth directory: ${authDir}`);
const CONNECTING_TIMEOUT_MS = parseInt(process.env.WHATSAPP_CONNECT_TIMEOUT_MS || '60000', 10);
console.log(`⏱️  WhatsApp connect timeout: ${Math.floor(CONNECTING_TIMEOUT_MS / 1000)}s`);
console.log(`🔥 Firestore: ${admin.apps.length > 0 ? 'Connected' : 'Not connected'}`);
console.log(`📊 Max accounts: ${MAX_ACCOUNTS}`);

// Listen for ACTIVE mode transition to auto-reconnect stuck accounts
process.on('wa-bootstrap:active', async ({ instanceId }) => {
  console.log(`🔄 [Auto-Reconnect] ACTIVE mode detected, checking for stuck connections...`);
  
  // Reconnect accounts that were stuck during passive mode
  for (const [accountId, account] of connections.entries()) {
    if (['connecting', 'reconnecting', 'disconnected'].includes(account.status)) {
      console.log(`🔄 [${accountId}] Auto-reconnecting after ACTIVE mode transition (status: ${account.status})`);
      
      // Small delay to avoid overwhelming the system
      setTimeout(() => {
        if (connections.has(accountId)) {
          const acc = connections.get(accountId);
          if (acc && ['connecting', 'reconnecting', 'disconnected'].includes(acc.status)) {
            createConnection(accountId, acc.name, acc.phone);
          }
        }
      }, Math.random() * 2000); // Random delay 0-2s per account
    }
  }
});

// History sync configuration
const SYNC_FULL_HISTORY = process.env.WHATSAPP_SYNC_FULL_HISTORY !== 'false'; // Default: true
const BACKFILL_COUNT = parseInt(process.env.WHATSAPP_BACKFILL_COUNT || '100', 10);
const BACKFILL_THREADS = parseInt(process.env.WHATSAPP_BACKFILL_THREADS || '50', 10);
const HISTORY_SYNC_DRY_RUN = process.env.WHATSAPP_HISTORY_SYNC_DRY_RUN === 'true';
console.log(`📚 History sync: ${SYNC_FULL_HISTORY ? 'enabled' : 'disabled'} (WHATSAPP_SYNC_FULL_HISTORY=${SYNC_FULL_HISTORY})`);
if (HISTORY_SYNC_DRY_RUN) {
  console.log(`🧪 History sync DRY RUN mode: enabled (will log but not write)`);
}

// Helper: Save account to Firestore
// Helper: Generate lease data for account ownership
function generateLeaseData() {
  const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();

  return {
    claimedBy: process.env.RAILWAY_DEPLOYMENT_ID || process.env.HOSTNAME || 'unknown',
    claimedAt: admin.firestore.Timestamp.fromMillis(now),
    leaseUntil: admin.firestore.Timestamp.fromMillis(now + LEASE_DURATION_MS),
  };
}

// Helper: Refresh leases for all active accounts
async function refreshLeases() {
  if (!firestoreAvailable || !db) {
    return;
  }

  const leaseData = generateLeaseData();

  for (const [accountId, account] of connections.entries()) {
    if (account.status === 'connected' || account.status === 'connecting') {
      try {
        await saveAccountToFirestore(accountId, leaseData);
        console.log(
          `🔄 [${accountId}] Lease refreshed until ${new Date(leaseData.leaseUntil.toMillis()).toISOString()}`
        );
      } catch (error) {
        console.error(`❌ [${accountId}] Lease refresh failed:`, error.message);
      }
    }
  }
}

// Start lease refresh interval (every 2 minutes)
const LEASE_REFRESH_INTERVAL = 2 * 60 * 1000;
let leaseRefreshTimer = null;

function startLeaseRefresh() {
  if (leaseRefreshTimer) {
    clearInterval(leaseRefreshTimer);
  }

  leaseRefreshTimer = setInterval(() => {
    refreshLeases().catch(err => console.error('❌ Lease refresh error:', err));
  }, LEASE_REFRESH_INTERVAL);

  console.log(`✅ Lease refresh started (interval: ${LEASE_REFRESH_INTERVAL / 1000}s)`);
}

// Release leases on shutdown
async function releaseLeases() {
  if (!firestoreAvailable || !db) {
    return;
  }

  console.log('🔓 Releasing leases on shutdown...');

  for (const [accountId] of connections.entries()) {
    try {
      await saveAccountToFirestore(accountId, {
        claimedBy: null,
        claimedAt: null,
        leaseUntil: null,
      });
      console.log(`🔓 [${accountId}] Lease released`);
    } catch (error) {
      console.error(`❌ [${accountId}] Lease release failed:`, error.message);
    }
  }
}

async function saveAccountToFirestore(accountId, data) {
  if (!firestoreAvailable || !db) {
    console.log(`⚠️  [${accountId}] Firestore not available, skipping save`);
    return;
  }

  try {
    await db
      .collection('accounts')
      .doc(accountId)
      .set(
        {
          ...data,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    console.log(`💾 [${accountId}] Saved to Firestore`);
  } catch (error) {
    console.error(`❌ [${accountId}] Firestore save failed:`, error.message);
  }
}

// Helper: Log incident to Firestore
async function logIncident(accountId, type, details) {
  if (!firestoreAvailable || !db) {
    console.log(`⚠️  [${accountId}] Firestore not available, skipping incident log`);
    return;
  }

  try {
    const incidentId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db
      .collection('incidents')
      .doc(incidentId)
      .set({
        accountId,
        type,
        severity: type.includes('fail') || type.includes('error') ? 'high' : 'medium',
        details,
        ts: admin.firestore.FieldValue.serverTimestamp(),
      });
    console.log(`📝 [${accountId}] Incident logged: ${type}`);
  } catch (error) {
    console.error(`❌ [${accountId}] Incident logging failed:`, error.message);
  }
}

/**
 * Send FCM push notification for new inbound WhatsApp message
 * @param {string} accountId - Account ID
 * @param {string} threadId - Thread ID
 * @param {string} clientJid - Client JID
 * @param {string} messageBody - Message text
 * @param {string} displayName - Sender display name
 */
async function sendWhatsAppNotification(accountId, threadId, clientJid, messageBody, displayName) {
  if (!firestoreAvailable || !db) return;
  
  try {
    // Get all users with FCM tokens (admin users who manage WhatsApp)
    const usersSnapshot = await db.collection('users')
      .where('fcmToken', '!=', null)
      .where('notificationsEnabled', '==', true)
      .get();
    
    if (usersSnapshot.empty) {
      console.log(`📱 [${accountId}] No FCM tokens found for notifications`);
      return;
    }
    
    const tokens = usersSnapshot.docs.map(doc => doc.data().fcmToken).filter(Boolean);
    
    if (tokens.length === 0) {
      console.log(`📱 [${accountId}] No valid FCM tokens`);
      return;
    }
    
    // Truncate message body for notification
    const truncatedBody = messageBody.length > 100 
      ? messageBody.substring(0, 100) + '...' 
      : messageBody;
    
    const message = {
      notification: {
        title: `${displayName || 'WhatsApp Message'}`,
        body: truncatedBody,
      },
      data: {
        type: 'whatsapp_message',
        accountId,
        threadId,
        clientJid,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      tokens,
    };
    
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`📱 [${accountId}] FCM sent: ${response.successCount}/${tokens.length} success`);
    
    if (response.failureCount > 0) {
      console.warn(`📱 [${accountId}] FCM failures: ${response.failureCount}`, 
        response.responses.filter(r => !r.success).map(r => r.error?.message));
    }
  } catch (error) {
    console.error(`❌ [${accountId}] FCM send error:`, error.message);
  }
}

// Helper: Save message to Firestore (idempotent upsert)
// Used by both real-time messages.upsert and history sync
async function saveMessageToFirestore(accountId, msg, isFromHistory = false, sock = null) {
  if (!firestoreAvailable || !db) {
    if (!isFromHistory) {
      console.log(`⚠️  [${accountId}] Firestore not available, message not persisted`);
    }
    return null;
  }

  try {
    if (!msg.message || !msg.key) {
      return null;
    }

    const messageId = msg.key.id;
    const from = msg.key.remoteJid;
    const isFromMe = msg.key.fromMe || false;

    // Extract message body (text content)
    let body = '';
    let messageType = 'text';
    if (msg.message.conversation) {
      body = msg.message.conversation;
      messageType = 'text';
      if (!isFromHistory) {
        console.log(`📝 [${accountId}] Extracted conversation text (length: ${body.length})`);
      }
    } else if (msg.message.extendedTextMessage?.text) {
      body = msg.message.extendedTextMessage.text;
      messageType = 'text';
      if (!isFromHistory) {
        console.log(`📝 [${accountId}] Extracted extendedTextMessage text (length: ${body.length})`);
      }
    } else if (msg.message.imageMessage) {
      body = msg.message.imageMessage.caption || '';
      messageType = 'image';
      if (!isFromHistory) {
        console.log(`🖼️  [${accountId}] Extracted image caption (length: ${body.length})`);
      }
    } else if (msg.message.videoMessage) {
      body = msg.message.videoMessage.caption || '';
      messageType = 'video';
      if (!isFromHistory) {
        console.log(`🎥 [${accountId}] Extracted video caption (length: ${body.length})`);
      }
    } else if (msg.message.audioMessage) {
      messageType = 'audio';
      if (!isFromHistory) {
        console.log(`🎵 [${accountId}] Audio message (no caption)`);
      }
    } else if (msg.message.documentMessage) {
      body = msg.message.documentMessage.caption || '';
      messageType = 'document';
      if (!isFromHistory) {
        console.log(`📄 [${accountId}] Extracted document caption (length: ${body.length})`);
      }
    } else {
      // Protocol messages or other types without text content
      if (!isFromHistory) {
        const messageKeys = Object.keys(msg.message || {});
        console.log(`⚠️  [${accountId}] Message type not recognized, keys: ${messageKeys.join(', ')}, skipping save`);
      }
      // Don't save protocol messages or other non-text messages
      return null;
    }

    const threadId = `${accountId}__${from}`;
    
    // Sanitize messageData - remove undefined values before saving to Firestore
    const messageData = {
      accountId,
      clientJid: from,
      direction: isFromMe ? 'outbound' : 'inbound',
      body: body.substring(0, 10000), // Limit body size (Firestore limit)
      waMessageId: messageId,
      status: isFromMe ? 'sent' : 'delivered', // Default status
      tsClient: msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toISOString() : new Date().toISOString(),
      tsServer: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      messageType,
    };

    // Add media metadata if present (only defined values)
    if (msg.message.imageMessage) {
      messageData.mediaType = 'image';
      if (msg.message.imageMessage.url) messageData.mediaUrl = msg.message.imageMessage.url;
      if (msg.message.imageMessage.mimetype) messageData.mediaMimetype = msg.message.imageMessage.mimetype;
    } else if (msg.message.videoMessage) {
      messageData.mediaType = 'video';
      if (msg.message.videoMessage.url) messageData.mediaUrl = msg.message.videoMessage.url;
      if (msg.message.videoMessage.mimetype) messageData.mediaMimetype = msg.message.videoMessage.mimetype;
    } else if (msg.message.audioMessage) {
      messageData.mediaType = 'audio';
      if (msg.message.audioMessage.url) messageData.mediaUrl = msg.message.audioMessage.url;
      if (msg.message.audioMessage.mimetype) messageData.mediaMimetype = msg.message.audioMessage.mimetype;
    } else if (msg.message.documentMessage) {
      messageData.mediaType = 'document';
      if (msg.message.documentMessage.url) messageData.mediaUrl = msg.message.documentMessage.url;
      if (msg.message.documentMessage.mimetype) messageData.mediaMimetype = msg.message.documentMessage.mimetype;
      if (msg.message.documentMessage.fileName) messageData.mediaFilename = msg.message.documentMessage.fileName;
    }

    // Idempotent upsert (set with merge)
    const messageRef = db.collection('threads').doc(threadId).collection('messages').doc(messageId);
    
    // Remove any undefined values recursively before saving
    const sanitizedData = JSON.parse(JSON.stringify(messageData, (key, value) => {
      return value === undefined ? null : value;
    }));
    
    await messageRef.set(sanitizedData, { merge: true });

    // Update thread metadata
    const threadData = {
      accountId,
      clientJid: from,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessagePreview: body.substring(0, 100), // First 100 chars
    };

    // Try to extract display name from message pushName or other sources
    if (msg.pushName) {
      threadData.displayName = msg.pushName;
    } else if (sock && from.endsWith('@lid')) {
      // For LID (Lidded IDs), try to fetch contact info from WhatsApp
      try {
        console.log(`🔍 [${accountId}] Fetching contact info for LID: ${from}`);
        const [contact] = await sock.onWhatsApp(from);
        if (contact?.name) {
          threadData.displayName = contact.name;
          console.log(`✅ [${accountId}] Found contact name for LID: ${contact.name}`);
        } else if (contact?.jid && contact.jid !== from) {
          // Sometimes onWhatsApp returns the real JID
          threadData.displayName = contact.jid.split('@')[0];
          console.log(`✅ [${accountId}] Using JID as display name: ${contact.jid}`);
        }
      } catch (e) {
        console.log(`⚠️  [${accountId}] Could not fetch contact info for LID: ${e.message}`);
      }
    } else {
      // For other cases without pushName, try verifiedBizName or participant
      const contactName = msg.verifiedBizName || msg.key.participant || null;
      if (contactName && contactName !== from) {
        threadData.displayName = contactName;
      }
      // If still no displayName, leave it empty - Flutter will show formatted phone
    }

    await db.collection('threads').doc(threadId).set(threadData, { merge: true });

    // Return full data including body for FCM notifications
    return { 
      threadId, 
      messageId,
      messageBody: body, // Add body for FCM notifications
      displayName: msg.pushName || null,
    };
  } catch (error) {
    console.error(`❌ [${accountId}] Error saving message:`, error.message);
    console.error(`❌ [${accountId}] Stack:`, error.stack?.substring(0, 300));
    return null;
  }
}

// Helper: Convert Long (protobuf) to Number for Firestore compatibility
// Baileys uses Long objects from protobuf which Firestore can't serialize
function convertLongToNumber(value) {
  if (!value) return 0;
  // If it's already a number, return it
  if (typeof value === 'number') return value;
  // If it's a Long object (from protobuf), convert to number
  if (value && typeof value === 'object' && ('low' in value || 'high' in value || 'toNumber' in value)) {
    try {
      return typeof value.toNumber === 'function' ? value.toNumber() : Number(value);
    } catch (e) {
      // Fallback: try to extract numeric value
      return value.low || value.high || 0;
    }
  }
  // Try to parse as number
  return Number(value) || 0;
}

// Helper: Process messages in batch (for history sync)
// Uses Firestore batch writes (max 500 ops per batch)
async function saveMessagesBatch(accountId, messages, source = 'history') {
  if (!firestoreAvailable || !db) {
    return { saved: 0, skipped: 0, errors: 0 };
  }

  if (HISTORY_SYNC_DRY_RUN) {
    console.log(`🧪 [${accountId}] DRY RUN: Would save ${messages.length} messages from ${source}`);
    return { saved: 0, skipped: 0, errors: 0, dryRun: true };
  }

  const BATCH_SIZE = 500; // Firestore batch limit
  let saved = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const batchMessages = messages.slice(i, i + BATCH_SIZE);
    let batchOps = 0;

    const threadUpdates = new Map(); // Track thread updates per threadId

    for (const msg of batchMessages) {
      try {
        if (!msg.message || !msg.key) {
          skipped++;
          continue;
        }

        const messageId = msg.key.id;
        const from = msg.key.remoteJid;
        const isFromMe = msg.key.fromMe || false;

        // Extract body
        let body = '';
        let messageType = 'text';
        if (msg.message.conversation) {
          body = msg.message.conversation;
        } else if (msg.message.extendedTextMessage?.text) {
          body = msg.message.extendedTextMessage.text;
        } else if (msg.message.imageMessage) {
          body = msg.message.imageMessage.caption || '';
          messageType = 'image';
        } else if (msg.message.videoMessage) {
          body = msg.message.videoMessage.caption || '';
          messageType = 'video';
        } else if (msg.message.audioMessage) {
          messageType = 'audio';
        } else if (msg.message.documentMessage) {
          body = msg.message.documentMessage.caption || '';
          messageType = 'document';
        }

        const threadId = `${accountId}__${from}`;
        
        // Convert messageTimestamp from Long to Number (Firestore compatibility)
        const messageTimestamp = convertLongToNumber(msg.messageTimestamp);
        
        const messageData = {
          accountId,
          clientJid: from,
          direction: isFromMe ? 'outbound' : 'inbound',
          body: body.substring(0, 10000),
          waMessageId: messageId,
          status: isFromMe ? 'sent' : 'delivered',
          tsClient: messageTimestamp ? new Date(messageTimestamp * 1000).toISOString() : new Date().toISOString(),
          tsServer: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          messageType,
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          syncSource: source,
        };

        // Add media metadata if present
        if (msg.message.imageMessage) {
          messageData.mediaType = 'image';
          messageData.mediaUrl = msg.message.imageMessage.url || null;
        } else if (msg.message.videoMessage) {
          messageData.mediaType = 'video';
          messageData.mediaUrl = msg.message.videoMessage.url || null;
        } else if (msg.message.audioMessage) {
          messageData.mediaType = 'audio';
          messageData.mediaUrl = msg.message.audioMessage.url || null;
        } else if (msg.message.documentMessage) {
          messageData.mediaType = 'document';
          messageData.mediaUrl = msg.message.documentMessage.url || null;
          messageData.mediaFilename = msg.message.documentMessage.fileName || null;
        }

        const messageRef = db.collection('threads').doc(threadId).collection('messages').doc(messageId);
        batch.set(messageRef, messageData, { merge: true });
        batchOps++;

        // Track thread update (will apply after message batch)
        if (!threadUpdates.has(threadId)) {
          threadUpdates.set(threadId, {
            accountId,
            clientJid: from,
            lastMessagePreview: body.substring(0, 100),
          });
          if (msg.pushName) {
            threadUpdates.get(threadId).displayName = msg.pushName;
          }
        } else {
          // Update preview if this message is more recent
          const existing = threadUpdates.get(threadId);
          // Convert Long to Number for Firestore compatibility
          const msgTime = convertLongToNumber(msg.messageTimestamp);
          const existingTime = convertLongToNumber(existing.lastMessageTimestamp);
          if (msgTime > existingTime) {
            existing.lastMessagePreview = body.substring(0, 100);
            existing.lastMessageTimestamp = msgTime; // Now it's a Number, not Long
          }
        }
      } catch (error) {
        console.error(`❌ [${accountId}] Error preparing message for batch:`, error.message);
        errors++;
      }
    }

    // Commit message batch
    if (batchOps > 0) {
      try {
        await batch.commit();
        saved += batchOps;
      } catch (error) {
        console.error(`❌ [${accountId}] Batch commit failed:`, error.message);
        errors += batchOps;
      }
    }

    // Update threads (separate batch to avoid mixing with messages)
    if (threadUpdates.size > 0) {
      const threadBatch = db.batch();
      for (const [threadId, threadData] of threadUpdates.entries()) {
        threadData.lastMessageAt = admin.firestore.FieldValue.serverTimestamp();
        const threadRef = db.collection('threads').doc(threadId);
        threadBatch.set(threadRef, threadData, { merge: true });
      }
      try {
        await threadBatch.commit();
      } catch (error) {
        console.error(`❌ [${accountId}] Thread batch commit failed:`, error.message);
      }
    }

    // Throttle between batches to avoid overwhelming Firestore
    if (i + BATCH_SIZE < messages.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return { saved, skipped, errors };
}

// Helper: Backfill messages for an account (best-effort gap filling after reconnect)
// Fetches recent messages from active threads to fill gaps
async function backfillAccountMessages(accountId) {
  if (!firestoreAvailable || !db) {
    console.log(`⚠️  [${accountId}] Firestore not available, skipping backfill`);
    return { success: false, reason: 'firestore_unavailable' };
  }

  const account = connections.get(accountId);
  if (!account || !account.sock || account.status !== 'connected') {
    console.log(`⚠️  [${accountId}] Account not connected, skipping backfill`);
    return { success: false, reason: 'not_connected' };
  }

  try {
    console.log(`📚 [${accountId}] Starting backfill for recent threads...`);

    // Get recent active threads for this account (ordered by lastMessageAt desc)
    const threadsSnapshot = await db
      .collection('threads')
      .where('accountId', '==', accountId)
      .orderBy('lastMessageAt', 'desc')
      .limit(BACKFILL_THREADS)
      .get();

    if (threadsSnapshot.empty) {
      console.log(`📚 [${accountId}] No threads found for backfill`);
      return { success: true, threads: 0, messages: 0 };
    }

    console.log(`📚 [${accountId}] Found ${threadsSnapshot.size} threads for backfill`);

    let totalMessages = 0;
    let totalErrors = 0;
    const threadResults = [];

    // Process threads with concurrency limit (1-2 at a time)
    const CONCURRENCY = 2;
    for (let i = 0; i < threadsSnapshot.docs.length; i += CONCURRENCY) {
      const batchThreads = threadsSnapshot.docs.slice(i, i + CONCURRENCY);
      
      await Promise.all(batchThreads.map(async (threadDoc) => {
        const threadId = threadDoc.id;
        const threadData = threadDoc.data();
        const clientJid = threadData.clientJid;

        if (!clientJid) {
          return;
        }

        try {
          // Get last stored message timestamp for this thread
          const messagesSnapshot = await db
            .collection('threads')
            .doc(threadId)
            .collection('messages')
            .orderBy('tsClient', 'desc')
            .limit(1)
            .get();

          let lastMessageTimestamp = null;
          if (!messagesSnapshot.empty) {
            const lastMsg = messagesSnapshot.docs[0].data();
            if (lastMsg.tsClient) {
              lastMessageTimestamp = new Date(lastMsg.tsClient).getTime() / 1000; // Convert to seconds
            }
          }

          // Fetch recent messages from WhatsApp (best-effort)
          // Note: Baileys doesn't have a direct fetchMessageHistory API, so we rely on
          // pending notifications and messages.upsert events that may arrive after connect
          // This backfill is primarily a safety net - most gaps are filled by syncFullHistory

          // Mark thread as backfilled (for tracking)
          await db.collection('threads').doc(threadId).set({
            lastBackfillAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

          threadResults.push({ threadId, status: 'processed' });
        } catch (threadError) {
          console.error(`❌ [${accountId}] Backfill failed for thread ${threadId}:`, threadError.message);
          totalErrors++;
          threadResults.push({ threadId, status: 'error', error: threadError.message });
        }
      }));

      // Throttle between batches
      if (i + CONCURRENCY < threadsSnapshot.docs.length) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2s between batches
      }
    }

    // Update account metadata
    await saveAccountToFirestore(accountId, {
      lastBackfillAt: admin.firestore.FieldValue.serverTimestamp(),
      lastBackfillResult: {
        threads: threadsSnapshot.size,
        messages: totalMessages,
        errors: totalErrors,
        threadResults: threadResults.slice(0, 10), // Store first 10 results for debugging
      },
    }).catch(err => console.error(`❌ [${accountId}] Failed to update backfill marker:`, err.message));

    console.log(`✅ [${accountId}] Backfill complete: ${threadsSnapshot.size} threads, ${totalMessages} messages, ${totalErrors} errors`);

    return {
      success: true,
      threads: threadsSnapshot.size,
      messages: totalMessages,
      errors: totalErrors,
    };
  } catch (error) {
    console.error(`❌ [${accountId}] Backfill error:`, error.message);
    await logIncident(accountId, 'backfill_failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Clear account session (disk + Firestore backup)
 * This ensures next pairing starts fresh with no stale credentials
 * @param {string} accountId - Account ID
 */
async function clearAccountSession(accountId) {
  try {
    const sessionPath = path.join(authDir, accountId);
    
    // Delete disk session directory
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log(`🗑️  [${accountId}] Session directory deleted: ${sessionPath}`);
    }
    
    // Delete Firestore session backup
    if (firestoreAvailable && db) {
      try {
        await db.collection('wa_sessions').doc(accountId).delete();
        console.log(`🗑️  [${accountId}] Firestore session backup deleted`);
      } catch (error) {
        console.error(`⚠️  [${accountId}] Failed to delete Firestore session backup:`, error.message);
      }
    }
  } catch (error) {
    console.error(`❌ [${accountId}] Failed to clear session:`, error.message);
    throw error;
  }
}

/**
 * Check if disconnect reason is terminal (requires re-pairing)
 * @param {number} reasonCode - Disconnect reason code
 * @returns {boolean} - true if terminal (401, loggedOut, badSession)
 */
function isTerminalLogout(reasonCode) {
  const TERMINAL_REASONS = [
    DisconnectReason.loggedOut, // 401
    DisconnectReason.badSession,
    DisconnectReason.unauthorized, // 401 (alias)
  ];
  return TERMINAL_REASONS.includes(reasonCode);
}

// Helper: Create WhatsApp connection
async function createConnection(accountId, name, phone) {
  // HARD GATE: PASSIVE mode - do NOT start Baileys connections
  if (!waBootstrap.canStartBaileys()) {
    const status = await waBootstrap.getWAStatus();
    console.log(`⏸️  [${accountId}] PASSIVE mode - cannot start Baileys connection (lock not held)`);
    console.log(`⏸️  [${accountId}] PASSIVE mode details: reason=${status.reason || 'unknown'}, instanceId=${status.instanceId || 'unknown'}`);
    
    // Save passive status to Firestore so Flutter can display it
    await saveAccountToFirestore(accountId, {
      status: 'passive',
      lastError: `Backend in PASSIVE mode: ${status.reason || 'lock not acquired'}`,
      passiveModeReason: status.reason || 'lock_not_acquired',
    }).catch(err => console.error(`❌ [${accountId}] Failed to save passive status:`, err));
    
    return;
  }

  // Guard: Do not auto-connect accounts with terminal logout status
  // These require explicit user action (Regenerate QR)
  // CRITICAL FIX: Check both in-memory AND Firestore to prevent 401 loops
  const account = connections.get(accountId);
  if (account) {
    const terminalStatuses = ['needs_qr', 'logged_out'];
    if (terminalStatuses.includes(account.status) || account.requiresQR === true) {
      console.log(`⏸️  [${accountId}] Account status is ${account.status} (requiresQR: ${account.requiresQR}), skipping auto-connect. Use Regenerate QR endpoint.`);
      // #region agent log
      console.log(`📋 [${accountId}] createConnection blocked: inMemory status=${account.status}, requiresQR=${account.requiresQR}, timestamp=${Date.now()}`);
      // #endregion
      return;
    }
  }
  
  // CRITICAL FIX: Also check Firestore if account not in memory (might have been cleaned up)
  // This prevents race conditions where cleanup sets needs_qr in Firestore but something triggers createConnection
  if (!account && firestoreAvailable && db) {
    try {
      const accountDoc = await db.collection('accounts').doc(accountId).get();
      if (accountDoc.exists) {
        const data = accountDoc.data();
        const terminalStatuses = ['needs_qr', 'logged_out'];
        if (terminalStatuses.includes(data.status) || data.requiresQR === true) {
          console.log(`⏸️  [${accountId}] Account status in Firestore is ${data.status} (requiresQR: ${data.requiresQR}), skipping auto-connect. Use Regenerate QR endpoint.`);
          // #region agent log
          console.log(`📋 [${accountId}] createConnection blocked: firestore status=${data.status}, requiresQR=${data.requiresQR}, timestamp=${Date.now()}`);
          // #endregion
          return;
        }
      }
    } catch (error) {
      console.error(`⚠️  [${accountId}] Failed to check Firestore status:`, error.message);
      // Continue anyway - might be first connection
    }
  }

  // Try to acquire connection lock (prevent duplicate sockets)
  if (!connectionRegistry.tryAcquire(accountId)) {
    console.log(`⚠️  [${accountId}] Connection already in progress, skipping`);
    return;
  }

  // Set timeout to prevent "connecting forever" (configurable via env)
  const CONNECTING_TIMEOUT = parseInt(process.env.WHATSAPP_CONNECT_TIMEOUT_MS || '60000', 10);

  try {
    console.log(`\n🔌 [${accountId}] Creating connection...`);

    const sessionPath = path.join(authDir, accountId);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
      console.log(`📁 [${accountId}] Created session directory: ${sessionPath}`);
    }

    // Check if session exists (creds.json)
    const credsPath = path.join(sessionPath, 'creds.json');
    const credsExists = fs.existsSync(credsPath);
    console.log(`🔑 [${accountId}] Session path: ${sessionPath}`);
    console.log(`🔑 [${accountId}] Credentials exist: ${credsExists}`);

    // CRITICAL: Restore from Firestore if disk session is missing
    // This ensures session stability across redeploys and crashes
    if (!credsExists && USE_FIRESTORE_BACKUP && firestoreAvailable && db) {
      console.log(`🔄 [${accountId}] Disk session missing, attempting Firestore restore...`);
      try {
        const sessionDoc = await db.collection('wa_sessions').doc(accountId).get();
        
        if (sessionDoc.exists) {
          const sessionData = sessionDoc.data();
          
          if (sessionData.files && typeof sessionData.files === 'object') {
            // Restore session files from Firestore
            let restoredCount = 0;
            for (const [filename, content] of Object.entries(sessionData.files)) {
              const filePath = path.join(sessionPath, filename);
              try {
                await fs.promises.writeFile(filePath, content, 'utf8');
                restoredCount++;
              } catch (writeError) {
                console.error(`❌ [${accountId}] Failed to restore file ${filename}:`, writeError.message);
              }
            }
            
            if (restoredCount > 0) {
              console.log(`✅ [${accountId}] Session restored from Firestore (${restoredCount} files)`);
              // Verify creds.json was restored
              const restoredCredsExists = fs.existsSync(credsPath);
              if (restoredCredsExists) {
                console.log(`✅ [${accountId}] Credentials restored successfully`);
              } else {
                console.warn(`⚠️  [${accountId}] Session files restored but creds.json missing`);
              }
            } else {
              console.log(`⚠️  [${accountId}] Firestore backup exists but contains no files`);
            }
          } else {
            console.log(`⚠️  [${accountId}] Firestore backup exists but format is not recognized`);
          }
        } else {
          console.log(`🆕 [${accountId}] No Firestore backup found, will generate new QR`);
        }
      } catch (restoreError) {
        console.error(`❌ [${accountId}] Firestore restore failed (non-fatal):`, restoreError.message);
        // Continue with fresh session - restore failure shouldn't block connection
      }
    }

    // Fetch latest Baileys version (CRITICAL FIX)
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`✅ [${accountId}] Baileys version: ${version.join('.')}, isLatest: ${isLatest}`);

    // Use disk auth + Firestore backup (will use restored session if available)
    let { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    // Wrap saveCreds to backup to Firestore
    // CRITICAL: Errors in backup must NEVER affect Baileys socket
    if (USE_FIRESTORE_BACKUP && firestoreAvailable && db) {
      const originalSaveCreds = saveCreds;
      saveCreds = async () => {
        // Always call original saveCreds first (critical for Baileys)
        await originalSaveCreds();

        // Backup to Firestore (fire-and-forget, errors don't affect socket)
        // Use setImmediate to ensure it doesn't block the main flow
        setImmediate(async () => {
          try {
            const sessionFiles = fs.readdirSync(sessionPath);
            const sessionData = {};

            for (const file of sessionFiles) {
              const filePath = path.join(sessionPath, file);
              if (fs.statSync(filePath).isFile()) {
                sessionData[file] = fs.readFileSync(filePath, 'utf8');
              }
            }

            await db.collection('wa_sessions').doc(accountId).set({
              files: sessionData,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              schemaVersion: 2,
            });

            console.log(
              `💾 [${accountId}] Session backed up to Firestore (${Object.keys(sessionData).length} files)`
            );
          } catch (error) {
            // CRITICAL: Log error but don't throw - backup failure must not kill socket
            console.error(`❌ [${accountId}] Firestore backup failed (non-fatal):`, error.message, error.stack?.substring(0, 200));
            // Don't rethrow - backup is optional, socket integrity is critical
          }
        });
      };
    }

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'warn' }), // Changed from 'silent' to see errors
      browser: ['SuperParty', 'Chrome', '2.0.0'], // Browser metadata (not real browser)
      version, // CRITICAL: Use fetched version
      syncFullHistory: SYNC_FULL_HISTORY, // Sync full history on connect (configurable via WHATSAPP_SYNC_FULL_HISTORY)
      markOnlineOnConnect: true,
      getMessage: async key => {
        // Return undefined to indicate message not found in cache
        return undefined;
      },
    });

    // Generate connection session ID for debugging (incremental per account)
    const currentSessionId = (connectionSessionIds.get(accountId) || 0) + 1;
    connectionSessionIds.set(accountId, currentSessionId);

    const account = {
      id: accountId,
      name,
      phone,
      status: 'connecting',
      qrCode: null,
      pairingCode: null,
      sock,
      sessionId: currentSessionId, // Debugging: unique ID for this connection attempt
      createdAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
    };

    connections.set(accountId, account);
    
    console.log(`🔌 [${accountId}] Connection session #${currentSessionId} started`);

    // Set timeout to prevent "connecting forever" (configurable via env)
    // CRITICAL: Only apply timeout for normal connecting, NOT for pairing phase (qr_ready/awaiting_scan)
    // Pairing phase uses QR_SCAN_TIMEOUT (10 minutes) instead
    // CRITICAL: Cancel/extend timeout when QR is generated or status changes to pairing phase
    const CONNECTING_TIMEOUT = parseInt(process.env.WHATSAPP_CONNECT_TIMEOUT_MS || '60000', 10);
    account.connectingTimeout = setTimeout(() => {
      const timeoutSeconds = Math.floor(CONNECTING_TIMEOUT / 1000);
      const acc = connections.get(accountId);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1175',message:'Timeout handler entry',data:{accountId,hasAccount:!!acc,accountStatus:acc?.status,accountConnectingTimeout:acc?.connectingTimeout},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      // CRITICAL FIX: Don't timeout if status is pairing phase (qr_ready, awaiting_scan, pairing, connecting)
      // NOTE: 'connecting' is included because during pairing phase close (reason 515), status may be set to 'connecting'
      // but we still want to preserve the account and not timeout it
      // These states use QR_SCAN_TIMEOUT instead (10 minutes)
      // This prevents timeout from transitioning to disconnected while waiting for QR scan
      const isPairingPhase = acc && ['qr_ready', 'awaiting_scan', 'pairing', 'connecting'].includes(acc.status);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1183',message:'Timeout pairing phase check',data:{accountId,hasAccount:!!acc,accountStatus:acc?.status,isPairingPhase,pairingPhaseList:['qr_ready','awaiting_scan','pairing','connecting']},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      if (isPairingPhase) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1187',message:'Timeout skipped - pairing phase',data:{accountId,status:acc.status,timeoutId:account.connectingTimeout},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.log(`⏰ [${accountId}] Connecting timeout skipped (status: ${acc.status} - pairing phase uses QR_SCAN_TIMEOUT)`);
        return; // Don't timeout pairing phase - QR scan timeout handles expiration
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1193',message:'Timeout firing - not pairing phase',data:{accountId,status:acc?.status,hasAccount:!!acc,isPairingPhase},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      // CRITICAL FIX: Get fresh account state BEFORE logging - might have been cleaned up or preserved during timeout
      const currentAcc = connections.get(accountId);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1199',message:'Timeout fresh account check',data:{accountId,hasCurrentAcc:!!currentAcc,currentAccStatus:currentAcc?.status,currentAccTimeout:currentAcc?.connectingTimeout},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      if (!currentAcc) {
        console.log(`⏰ [${accountId}] Timeout fired but account already removed, ignoring`);
        return; // Account already cleaned up (e.g., 401 cleanup)
      }
      
      // CRITICAL FIX: Double-check pairing phase BEFORE logging transition - account might have been preserved
      // This prevents misleading "transitioning to disconnected" log when status is qr_ready after 515
      const isPairingPhaseNow = ['qr_ready', 'awaiting_scan', 'pairing', 'connecting'].includes(currentAcc.status);
      if (isPairingPhaseNow) {
        console.log(`⏰ [${accountId}] Timeout fired but status is ${currentAcc.status} (pairing phase), skipping timeout transition`);
        currentAcc.connectingTimeout = null; // Clear timeout property
        return; // Don't timeout pairing phase
      }
      
      // Only log "transitioning to disconnected" if we're actually going to transition
      console.log(`⏰ [${accountId}] Connecting timeout (${timeoutSeconds}s), transitioning to disconnected`);
      
      // CRITICAL FIX: Only transition if still connecting - might have been cleaned up by 401 handler
      // Also check if timeout was already cleared (account.connectingTimeout should be null if cleared)
      if (currentAcc.status === 'connecting' && currentAcc.connectingTimeout !== null) {
        currentAcc.status = 'disconnected';
        currentAcc.lastError = 'Connection timeout - no progress after 60s';
        // Clear timeout property
        currentAcc.connectingTimeout = null;
        
        // #region agent log
        console.log(`📋 [${accountId}] Connecting timeout: status=connecting -> disconnected, clearedTimeout=true, timestamp=${Date.now()}`);
        // #endregion
        
        saveAccountToFirestore(accountId, {
          status: 'disconnected',
          lastError: 'Connection timeout',
        }).catch(err => console.error(`❌ [${accountId}] Timeout save failed:`, err));
      } else {
        // Status already changed (e.g., needs_qr from 401 cleanup) - don't override
        console.log(`⏰ [${accountId}] Timeout fired but status is ${currentAcc.status} (not connecting), ignoring timeout transition`);
        currentAcc.connectingTimeout = null; // Clear timeout property anyway
      }
    }, CONNECTING_TIMEOUT);

    // Note: Store binding not required in Baileys 6.7.21
    // Events emit directly from sock.ev
    console.log(`📦 [${accountId}] Socket events configured`);
    const evListeners = sock.ev._events || {};
    const msgListeners = evListeners['messages.upsert'];
    console.log(
      `📦 [${accountId}] messages.upsert listeners: ${Array.isArray(msgListeners) ? msgListeners.length : msgListeners ? 1 : 0}`
    );

    // Save to Firestore with lease data
    await saveAccountToFirestore(accountId, {
      accountId,
      name,
      phoneE164: phone,
      status: 'connecting',
      qrCode: null,
      pairingCode: null,
      createdAt: account.createdAt,
      ...generateLeaseData(),
      worker: {
        service: 'railway',
        instanceId: process.env.RAILWAY_DEPLOYMENT_ID || 'local',
        version: VERSION,
        commit: COMMIT_HASH,
        uptime: process.uptime(),
        bootTs: new Date().toISOString(),
      },
    });

    // Connection update handler
    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect, qr } = update;

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1353',message:'connection.update event received',data:{accountId,connection:connection||'null',hasQr:!!qr,hasLastDisconnect:!!lastDisconnect,updateKeys:Object.keys(update)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      console.log(`🔔 [${accountId}] Connection update: ${connection || 'qr'}`);

      if (qr && typeof qr === 'string' && qr.length > 0) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1358',message:'QR code detected in update',data:{accountId,qrLength:qr.length,currentStatus:account.status,sessionId:account.sessionId||'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        console.log(`📱 [${accountId}] QR Code generated (length: ${qr.length}, sessionId: ${account.sessionId || 'unknown'})`);

        // CRITICAL: Set status to 'qr_ready' IMMEDIATELY when QR is detected
        // This prevents timeout from firing (timeout checks pairing phase)
        // IMPORTANT: Get account from connections map (not closure variable) to ensure latest state
        const currentAccount = connections.get(accountId);
        if (currentAccount) {
          // Set status IMMEDIATELY (before async QR generation)
          currentAccount.status = 'qr_ready';
          console.log(`⏰ [${accountId}] Status set to 'qr_ready' (QR detected)`);
          
          // Clear connecting timeout IMMEDIATELY when QR is detected
          // QR pairing should not be limited by 60s connecting timeout
          // Use QR_SCAN_TIMEOUT instead (10 minutes for user to scan)
          if (currentAccount.connectingTimeout) {
            clearTimeout(currentAccount.connectingTimeout);
            currentAccount.connectingTimeout = null;
            console.log(`⏰ [${accountId}] Connecting timeout cleared (QR detected, pairing phase)`);
          }
        }

        // Set QR scan timeout (10 minutes) - regenerate if user doesn't scan
        const QR_SCAN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
        // IMPORTANT: Get account from connections map (not closure variable) to ensure latest state
        const currentAccountForQR = connections.get(accountId);
        if (currentAccountForQR) {
          currentAccountForQR.qrScanTimeout = setTimeout(() => {
          console.log(`⏰ [${accountId}] QR scan timeout (${QR_SCAN_TIMEOUT_MS / 1000}s) - QR expired`);
          const acc = connections.get(accountId);
          if (acc && acc.status === 'qr_ready') {
            acc.status = 'needs_qr'; // Mark for regeneration
            saveAccountToFirestore(accountId, {
              status: 'needs_qr',
              lastError: 'QR scan timeout - QR expired after 10 minutes',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }).catch(err => console.error(`❌ [${accountId}] QR timeout save failed:`, err));
          }
        }, QR_SCAN_TIMEOUT_MS);
        }

        try {
          const qrDataURL = await Sentry.startSpan(
            { op: 'whatsapp.qr.generate', name: 'Generate QR Code' },
            () => QRCode.toDataURL(qr)
          );
          // IMPORTANT: Get account from connections map to ensure latest state
          const currentAccountForSave = connections.get(accountId);
          if (currentAccountForSave) {
            currentAccountForSave.qrCode = qrDataURL;
            currentAccountForSave.status = 'qr_ready';
            currentAccountForSave.lastUpdate = new Date().toISOString();
          }

          // Save QR to Firestore
          await saveAccountToFirestore(accountId, {
            qrCode: qrDataURL,
            qrUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'qr_ready',
          });

          console.log(`✅ [${accountId}] QR saved to Firestore`);

    // Invalidate accounts cache so frontend gets updated QR
    if (featureFlags.isEnabled('API_CACHING')) {
      await cache.delete('whatsapp:accounts');
      console.log(`🗑️  [${accountId}] Cache invalidated for QR update`);
    }

    logger.info('QR code generated and saved', { accountId, qrLength: qr.length });
    logtail.info('QR code generated', {
      accountId,
      qrLength: qr.length,
      phone: maskPhone(phone),
      instanceId: process.env.RAILWAY_DEPLOYMENT_ID || 'local',
    });
        } catch (error) {
          console.error(`❌ [${accountId}] QR generation failed:`, error.message);
          logger.error('QR generation failed', { accountId, error: error.message });
          logtail.error('QR generation failed', {
            accountId,
            error: error.message,
            stack: error.stack,
          });
          await logIncident(accountId, 'qr_generation_failed', { error: error.message });
        }
      }

      if (connection === 'open') {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1446',message:'connection.open handler ENTRY',data:{accountId,currentStatus:account.status,hasSock:!!account.sock,hasUser:!!account.sock?.user,userId:account.sock?.user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion

        console.log(`✅ [${accountId}] connection.update: open (sessionId: ${account.sessionId || 'unknown'})`);
        console.log(`✅ [${accountId}] Connected! Session persisted at: ${sessionPath}`);
        
        // Reset reconnect attempts on successful connection
        reconnectAttempts.delete(accountId);

        // Clear connecting timeout
        if (account.connectingTimeout) {
          clearTimeout(account.connectingTimeout);
          account.connectingTimeout = null;
        }

        // Clear QR scan timeout (connection established, QR no longer needed)
        if (account.qrScanTimeout) {
          clearTimeout(account.qrScanTimeout);
          account.qrScanTimeout = null;
          console.log(`⏰ [${accountId}] QR scan timeout cleared (connected)`);
        }

        // Mark connection as established in registry
        connectionRegistry.markConnected(accountId);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1467',message:'BEFORE status change to connected',data:{accountId,oldStatus:account.status,hasSock:!!account.sock,hasUser:!!account.sock?.user,userId:account.sock?.user?.id,phoneFromSock:sock.user?.id?.split(':')[0]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        account.status = 'connected';
        account.qrCode = null;
        account.phone = sock.user?.id?.split(':')[0] || phone;
        account.waJid = sock.user?.id;
        account.lastUpdate = new Date().toISOString();
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1473',message:'AFTER status change to connected',data:{accountId,newStatus:account.status,phone:account.phone,waJid:account.waJid,lastUpdate:account.lastUpdate},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion

        // Reset reconnect attempts
        reconnectAttempts.delete(accountId);

        // Invalidate accounts cache so frontend sees connected status
        if (featureFlags.isEnabled('API_CACHING')) {
          await cache.delete('whatsapp:accounts');
          console.log(`🗑️  [${accountId}] Cache invalidated for connection update`);
        }

        // Save to Firestore
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1484',message:'BEFORE Firestore save',data:{accountId,status:account.status,waJid:account.waJid,phone:account.phone},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        await saveAccountToFirestore(accountId, {
          status: 'connected',
          waJid: account.waJid,
          phoneE164: account.phone,
          lastConnectedAt: admin.firestore.FieldValue.serverTimestamp(),
          qrCode: null,
        });
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1490',message:'AFTER Firestore save',data:{accountId,status:account.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion

        // Schedule backfill after connection is established (best-effort gap filling)
        // Use jitter to avoid hitting all 30 accounts at once
        const backfillDelay = Math.floor(Math.random() * 30000) + 10000; // 10-40 seconds
        setTimeout(async () => {
          if (connections.has(accountId) && connections.get(accountId).status === 'connected') {
            console.log(`📚 [${accountId}] Scheduling backfill after connect (delay: ${backfillDelay}ms)`);
            try {
              await backfillAccountMessages(accountId);
            } catch (error) {
              console.error(`❌ [${accountId}] Backfill after connect failed:`, error.message);
            }
          }
        }, backfillDelay);
      }

      if (connection === 'close') {
        // CRITICAL: Extract real disconnect reason from Boom error
        // Check multiple sources (Boom error, output.statusCode, error.code, etc.)
        const error = lastDisconnect?.error;
        
        // DEBUG: Log raw error structure to diagnose "unknown" reasons
        console.log(`🔍 [${accountId}] Raw lastDisconnect structure:`, {
          hasError: !!error,
          errorName: error?.name,
          errorMessage: error?.message,
          errorCode: error?.code,
          errorStatusCode: error?.statusCode,
          hasOutput: !!error?.output,
          outputStatusCode: error?.output?.statusCode,
          outputPayload: error?.output?.payload,
          errorStack: error?.stack?.substring(0, 300), // First 300 chars
          lastDisconnectKeys: lastDisconnect ? Object.keys(lastDisconnect) : [],
        });
        
        const boomStatus = error?.output?.statusCode;
        const errorCode = error?.code || error?.statusCode;
        const rawReason = boomStatus ?? errorCode ?? 'unknown';
        
        // Normalize reason to number for comparison
        // CRITICAL: Handle 515 (restart required) explicitly
        let reason = typeof rawReason === 'number' ? rawReason : (typeof rawReason === 'string' ? parseInt(rawReason, 10) || 'unknown' : 'unknown');
        
        // CRITICAL: If error message contains "restart required" but statusCode is not 515, set it
        if (error?.message && error.message.includes('restart required') && reason !== 515) {
          console.log(`🔍 [${accountId}] Detected "restart required" in message but statusCode is ${reason}, normalizing to 515`);
          reason = 515;
        }
        
        // Extract Boom error details for better logging
        const boomPayload = error?.output?.payload;
        const errorMessage = error?.message || 'No error message';
        const errorStack = error?.stack;
        
        // CRITICAL: Detect reason code 515 (restart required) and 428 (connection closed) - common in pairing phase
        // 515 = "Stream Errored (restart required)" - requires socket recreation + new QR
        // 428 = "Connection closed" - transient error, preserve QR and reconnect
        const isRestartRequired = (typeof reason === 'number' && reason === 515) || 
                                 (typeof boomStatus === 'number' && boomStatus === 515) ||
                                 (errorMessage && errorMessage.includes('restart required'));
        const isConnectionClosed = (typeof reason === 'number' && reason === 428) ||
                                  (typeof boomStatus === 'number' && boomStatus === 428) ||
                                  (errorMessage && errorMessage.includes('connection closed'));
        const isTransientError = isRestartRequired || isConnectionClosed;
        
        // Log detailed disconnect information (helps diagnose "unknown" reasons)
        // CRITICAL: Log full error object for reason 515 to diagnose "stream errored out"
        const logData = {
          sessionId: account.sessionId || 'unknown', // Connection session ID for debugging
          status: reason,
          rawStatus: rawReason,
          boomStatus,
          errorCode,
          reasonPayload: boomPayload,
          message: errorMessage,
          stack: errorStack?.substring(0, 500), // Extended stack for 515 debugging
          shouldReconnect: reason !== DisconnectReason.loggedOut,
          currentStatus: account.status,
          isPairingPhase: ['qr_ready', 'awaiting_scan', 'pairing', 'connecting'].includes(account.status),
          isRestartRequired: isRestartRequired, // CRITICAL: Flag for 515 handling
          isConnectionClosed: isConnectionClosed, // CRITICAL: Flag for 428 handling
          isTransientError: isTransientError, // CRITICAL: Flag for 515/428 handling
          lastDisconnect: lastDisconnect ? {
            error: error ? {
              name: error.name,
              message: error.message,
              output: error.output ? {
                statusCode: error.output.statusCode,
                payload: error.output.payload,
              } : undefined,
            } : undefined,
            date: lastDisconnect.date,
          } : undefined,
        };
        
        // For reason 515, log full error object to diagnose underlying cause
        if (isRestartRequired) {
          logData.underlyingError = error ? {
            name: error.name,
            message: error.message,
            code: error.code,
            errno: error.errno,
            syscall: error.syscall,
            address: error.address,
            port: error.port,
            stack: error.stack?.substring(0, 1000),
          } : null;
        }
        
        // CRITICAL: Enhanced logging for "unknown" reason codes to diagnose root cause
        if (reason === 'unknown' || rawReason === 'unknown') {
          console.error(`🔌 [${accountId}] connection.update: close - UNKNOWN REASON (investigating...)`);
          console.error(`🔌 [${accountId}] lastDisconnect object:`, JSON.stringify(lastDisconnect, null, 2));
          console.error(`🔌 [${accountId}] error object:`, error ? {
            name: error.name,
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            output: error.output,
            stack: error.stack?.substring(0, 500),
          } : 'null');
          console.error(`🔌 [${accountId}] connection object:`, connection ? {
            lastDisconnect: connection.lastDisconnect,
            qr: connection.qr,
            isNewLogin: connection.isNewLogin,
            isOnline: connection.isOnline,
          } : 'null');
        }
        
        console.error(`🔌 [${accountId}] connection.update: close`, logData);
        
        // CRITICAL FIX: For 515 (restart required) and 428 (connection closed), always reconnect (even in pairing phase)
        // 515 means stream errored but session is valid - need new socket + potentially new QR
        // 428 means connection closed transiently - preserve QR and reconnect
        const shouldReconnect = reason !== DisconnectReason.loggedOut || isTransientError;

        // Define explicit cleanup reasons (only these trigger account deletion)
        // Ensure we compare numbers consistently
        const EXPLICIT_CLEANUP_REASONS = [
          DisconnectReason.loggedOut, // 401
          DisconnectReason.badSession,
          DisconnectReason.unauthorized, // 401 (alias)
        ];

        // Normalize comparison: convert reason to number if needed
        const isExplicitCleanup = typeof reason === 'number' && EXPLICIT_CLEANUP_REASONS.includes(reason);

        // CRITICAL: Preserve account during pairing phase
        // Don't delete if: status is pairing-related AND reason is transient (not explicit cleanup)
        const isPairingPhase = ['qr_ready', 'awaiting_scan', 'pairing', 'connecting'].includes(
          account.status
        );

        if (isPairingPhase && !isExplicitCleanup) {
          console.log(
            `⏸️  [${accountId}] Pairing phase (${account.status}, sessionId: ${account.sessionId}), preserving account (reason: ${reason})`
          );
          
          // CRITICAL: Preserve QR code for user to scan (for 515/428 transient errors)
          // If QR exists and error is transient (515/428), keep status 'qr_ready' so Flutter app can display it
          // For 428 (connection closed), preserve QR and set status to 'awaiting_scan' (QR still valid)
          // For 515 (restart required), QR will be regenerated on reconnect
          const hasQR = account.qrCode || (account.data && account.data.qrCode);
          
          if (isConnectionClosed && hasQR) {
            // 428: Connection closed but QR is still valid - preserve it and set awaiting_scan
            console.log(`📱 [${accountId}] Preserving QR code (status: awaiting_scan) - connection closed (428) but QR still valid`);
            account.status = 'awaiting_scan';
          } else if (isRestartRequired) {
            // 515: Restart required - QR will be regenerated, clear it now
            // CRITICAL: Clear timeout BEFORE changing status to prevent race condition
            // The timeout handler checks pairing phase, and 'connecting' is now included, but we still want to clear it
            if (account.connectingTimeout) {
              clearTimeout(account.connectingTimeout);
              account.connectingTimeout = null;
              console.log(`⏱️  [${accountId}] Cleared connectingTimeout before status change to 'connecting' (reason: 515)`);
            }
            console.log(`🔄 [${accountId}] Clearing QR code (status: connecting) - restart required (515), will regenerate on reconnect`);
            account.qrCode = null;
            account.status = 'connecting';
          } else if (hasQR && account.status === 'qr_ready') {
            // Other transient errors: preserve QR if status is qr_ready
            console.log(`📱 [${accountId}] Preserving QR code (status: qr_ready) - user can scan`);
            account.status = 'qr_ready';
          } else {
            // No QR yet or other status, mark as awaiting scan
            account.status = 'awaiting_scan';
          }
          
          account.lastUpdate = new Date().toISOString();

          await saveAccountToFirestore(accountId, {
            status: account.status,
            lastDisconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastDisconnectReason: isConnectionClosed ? 'connection_closed_428' : 
                                 isRestartRequired ? 'restart_required_515' :
                                 (hasQR && account.status === 'qr_ready') ? 'qr_ready_preserved' : 'qr_waiting_scan',
            lastDisconnectCode: reason,
            // Preserve QR code in Firestore for 428 (connection closed) - QR still valid
            // Clear QR for 515 (restart required) - will be regenerated
            ...(isConnectionClosed && hasQR && account.qrCode ? { qrCode: account.qrCode } : {}),
            ...(isRestartRequired ? { qrCode: null } : {}),
          });

          // CRITICAL: Clean up old socket reference and timers before reconnect
          // Clear stale socket reference (socket is already closed, but reference may remain)
          if (account.sock) {
            try {
              // Remove all listeners to prevent memory leaks
              if (account.sock.ev) {
                account.sock.ev.removeAllListeners();
              }
            } catch (e) {
              // Ignore cleanup errors
            }
            account.sock = null;
          }
          
          // Clear any stale reconnect timers
          // CRITICAL: Clear timeout BEFORE status changes to prevent race condition
          // If status changes to 'connecting' for 515, timeout handler won't recognize it as pairing phase
          if (account.connectingTimeout) {
            clearTimeout(account.connectingTimeout);
            account.connectingTimeout = null;
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1588-1591',message:'Cleared connectingTimeout during pairing phase close',data:{accountId,reason,oldStatus:account.status,newStatus:account.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            console.log(`⏱️  [${accountId}] Cleared connectingTimeout during pairing phase close (reason: ${reason}, status: ${account.status})`);
          }
          
          if (account.qrScanTimeout) {
            clearTimeout(account.qrScanTimeout);
            account.qrScanTimeout = null;
          }

          // CRITICAL: Reset connecting state to allow fresh reconnect attempts
          // This prevents "Already connecting" deadlock when QR expires or connection closes
          connectionRegistry.release(accountId);
          
          // CRITICAL FIX: Auto-reconnect in pairing phase for transient errors
          // Don't leave account stuck in qr_ready if socket closes due to transient network issue
          // Only skip reconnect if reason is terminal (loggedOut/badSession/unauthorized)
          // SPECIAL HANDLING: 515 (restart required) and 428 (connection closed) always trigger reconnect
          if (shouldReconnect && (reason !== DisconnectReason.loggedOut || isTransientError)) {
            const attempts = reconnectAttempts.get(accountId) || 0;
            const MAX_PAIRING_RECONNECT_ATTEMPTS = parseInt(process.env.MAX_PAIRING_RECONNECT_ATTEMPTS || '10', 10);
            
            // CRITICAL: For 515, QR already cleared above. For 428, preserve QR.
            // Status already set above (connecting for 515, awaiting_scan for 428)
            
            if (attempts < MAX_PAIRING_RECONNECT_ATTEMPTS) {
              // Exponential backoff for pairing phase: 1s, 2s, 4s, 8s, 16s, 30s (max)
              // For 515/428, use shorter backoff (2s, 4s, 8s) since they're known recoverable errors
              const baseBackoff = isTransientError ? 2000 : 1000;
              const backoff = Math.min(baseBackoff * Math.pow(2, attempts), 30000);
              const reasonLabel = isRestartRequired ? ' [515 restart required]' : 
                                 isConnectionClosed ? ' [428 connection closed]' : '';
              console.log(
                `🔄 [${accountId}] Pairing phase reconnect in ${backoff}ms (attempt ${attempts + 1}/${MAX_PAIRING_RECONNECT_ATTEMPTS}, reason: ${reason}${reasonLabel})`
              );
              
              reconnectAttempts.set(accountId, attempts + 1);
              
              setTimeout(() => {
                const acc = connections.get(accountId);
                if (acc && ['qr_ready', 'awaiting_scan', 'connecting', 'needs_qr'].includes(acc.status)) {
                  const reconnectNote = isRestartRequired ? ', QR will be regenerated' : 
                                       isConnectionClosed ? ', QR preserved' : '';
                  console.log(`🔄 [${accountId}] Starting pairing phase reconnect (session will be new${reconnectNote})`);
                  // Status already set above (connecting for 515, awaiting_scan for 428)
                  createConnection(accountId, acc.name, acc.phone);
                }
              }, backoff);
            } else {
              console.log(`❌ [${accountId}] Max pairing reconnect attempts reached, requires manual QR regeneration`);
              account.status = 'needs_qr';
              await saveAccountToFirestore(accountId, {
                status: 'needs_qr',
                lastError: `Max pairing reconnect attempts (${MAX_PAIRING_RECONNECT_ATTEMPTS}) reached${isRestartRequired ? ' (reason: 515 restart required)' : ''}`,
              });
              reconnectAttempts.delete(accountId);
            }
          } else {
            console.log(`⏸️  [${accountId}] Pairing phase close: no reconnect (reason: ${reason}, shouldReconnect: ${shouldReconnect}, isRestartRequired: ${isRestartRequired})`);
          }
          
          return;
        }
        
        // CRITICAL: Reset connecting state on close (before reconnect attempt)
        // This prevents "Already connecting" deadlock where reconnect is blocked by stale state
        // Release lock FIRST to reset connecting flag, then allow reconnect scheduling
        connectionRegistry.release(accountId);

        account.status = shouldReconnect ? 'reconnecting' : 'logged_out';
        account.lastUpdate = new Date().toISOString();

        // Save to Firestore
        await saveAccountToFirestore(accountId, {
          status: account.status,
          lastDisconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastDisconnectReason: reason.toString(),
          lastDisconnectCode: reason,
        });

        if (shouldReconnect) {
          const attempts = reconnectAttempts.get(accountId) || 0;

          if (attempts < MAX_RECONNECT_ATTEMPTS) {
            const backoff = Math.min(1000 * Math.pow(2, attempts), 30000);
            console.log(
              `🔄 [${accountId}] Reconnecting in ${backoff}ms (attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`
            );

            reconnectAttempts.set(accountId, attempts + 1);

            // NOTE: Lock already released above (on close), so reconnect can proceed
            // No need to release again - lock is already cleared for fresh connection attempt

            setTimeout(() => {
              if (connections.has(accountId)) {
                createConnection(accountId, account.name, account.phone);
              }
            }, backoff);
          } else {
            console.log(`❌ [${accountId}] Max reconnect attempts reached, generating new QR...`);
            account.status = 'needs_qr';

            await saveAccountToFirestore(accountId, {
              status: 'needs_qr',
            });

            await logIncident(accountId, 'max_reconnect_attempts', {
              attempts: MAX_RECONNECT_ATTEMPTS,
              lastReason: reason,
            });

            // Clean up and regenerate
            connections.delete(accountId);
            reconnectAttempts.delete(accountId);
            connectionRegistry.release(accountId);

            setTimeout(() => {
              createConnection(accountId, account.name, account.phone);
            }, 5000);
          }
        } else {
          // Terminal logout (401/loggedOut/badSession) - requires re-pairing
          // CRITICAL: Check if this is a real logout or temporary network issue
          const logoutCount = (account.logoutCount || 0) + 1;
          account.logoutCount = logoutCount;
          
          // Retry with restore before clearing session (logout might be temporary)
          const MAX_LOGOUT_RETRIES = parseInt(process.env.MAX_LOGOUT_RETRIES || '2', 10);
          
          if (logoutCount <= MAX_LOGOUT_RETRIES) {
            console.log(`⚠️  [${accountId}] Terminal logout (${reason}), retry ${logoutCount}/${MAX_LOGOUT_RETRIES} with restore...`);
            
            // Clear connectingTimeout BEFORE retry
            if (account.connectingTimeout) {
              clearTimeout(account.connectingTimeout);
              account.connectingTimeout = null;
            }
            
            // Clear any reconnect timers
            reconnectAttempts.delete(accountId);
            
            account.status = 'logged_out';
            
            await saveAccountToFirestore(accountId, {
              status: 'logged_out',
              logoutCount: logoutCount,
              lastDisconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastDisconnectReason: `Terminal logout (retry ${logoutCount}/${MAX_LOGOUT_RETRIES})`,
              lastDisconnectCode: reason,
            });
            
            // Retry with exponential backoff: 5s, 15s
            const backoff = logoutCount === 1 ? 5000 : 15000;
            console.log(`🔄 [${accountId}] Retrying connection in ${backoff}ms with session restore...`);
            
            setTimeout(async () => {
              // At reconnect, restore from Firestore if disk session was cleared
              // The restore logic in createConnection() will handle this
              const acc = connections.get(accountId);
              if (acc && acc.status === 'logged_out') {
                console.log(`🔄 [${accountId}] Attempting reconnect with session restore (logout retry ${logoutCount})`);
                createConnection(accountId, acc.name, acc.phone);
              }
            }, backoff);
          } else {
            // Real logout - clear session after max retries
            console.log(`❌ [${accountId}] Terminal logout confirmed (${logoutCount} attempts), clearing session`);
            
            // CRITICAL FIX: Clear connectingTimeout BEFORE clearing session to prevent stale timer
            if (account.connectingTimeout) {
              clearTimeout(account.connectingTimeout);
              account.connectingTimeout = null;
              console.log(`⏱️  [${accountId}] Cleared connectingTimeout on terminal logout`);
            }
            
            // Clear any reconnect timers
            reconnectAttempts.delete(accountId);
            account.logoutCount = 0; // Reset for next time
            account.status = 'needs_qr';

            // Clear session (disk + Firestore) to ensure fresh pairing
            // #region agent log
            const logTimestamp = Date.now();
            const sessionPath = path.join(authDir, accountId);
            const sessionExistsBefore = fs.existsSync(sessionPath);
            // #endregion
            
            try {
              await clearAccountSession(accountId);
              // #region agent log
              const sessionExistsAfter = fs.existsSync(sessionPath);
              console.log(`📋 [${accountId}] 401 handler: sessionExistsBefore=${sessionExistsBefore}, sessionExistsAfter=${sessionExistsAfter}, timestamp=${logTimestamp}`);
              // #endregion
            } catch (error) {
              console.error(`⚠️  [${accountId}] Failed to clear session:`, error.message);
              // #region agent log
              console.error(`📋 [${accountId}] 401 handler: clearAccountSession failed, error=${error.message}, stack=${error.stack?.substring(0, 200)}, timestamp=${logTimestamp}`);
              // #endregion
              // Continue anyway - account will be marked logged_out
            }
          }

          // CRITICAL: Set status to 'logged_out' (not 'needs_qr') to indicate session expired and re-link required
          // 'needs_qr' is for expired QR during pairing, 'logged_out' is for invalid session credentials
          await saveAccountToFirestore(accountId, {
            status: 'logged_out',
            lastError: `logged_out (${reason}) - requires re-link`,
            requiresQR: true,
            lastDisconnectReason: reason,
            lastDisconnectCode: reason,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            // #region agent log
            nextRetryAt: null, // Explicitly set to null to prevent auto-reconnect
            retryCount: 0, // Reset retry count on terminal logout
            // #endregion
          });

          await logIncident(accountId, 'wa_logged_out_requires_pairing', {
            reason: reason,
            requiresQR: true,
            traceId: `${accountId}_${Date.now()}`,
            // #region agent log
            clearedSession: true,
            connectingTimeoutCleared: true,
            reconnectScheduled: false,
            // #endregion
          });

          // Clean up in-memory connection and release lock
          connections.delete(accountId);
          connectionRegistry.release(accountId);

          // #region agent log
          console.log(`📋 [${accountId}] 401 handler complete: status=needs_qr, nextRetryAt=null, retryCount=0, reconnectScheduled=false, timestamp=${logTimestamp}`);
          // #endregion

          // CRITICAL: DO NOT schedule createConnection() for terminal logout
          // User must explicitly request "Regenerate QR" to re-pair
          // This prevents infinite reconnect loop with invalid credentials
        }
      }
    });

    // Creds update handler
    sock.ev.on('creds.update', saveCreds);

    // REMOVED: Flush outbox on connect handler
    // Single sending path: only outbox worker loop handles queued messages
    // This prevents duplicate sends on reconnect

    // History sync handler (ingest full conversation history on pairing/re-pair)
    sock.ev.on('messaging-history.set', async (history) => {
      try {
        console.log(`📚 [${accountId}] messaging-history.set event received`);
        
        if (!firestoreAvailable || !db) {
          console.log(`⚠️  [${accountId}] Firestore not available, skipping history sync`);
          return;
        }

        const { chats, contacts, messages } = history || {};
        
        let historyMessages = [];
        let historyChats = [];

        // Extract messages from history
        if (messages && Array.isArray(messages)) {
          historyMessages = messages;
          console.log(`📚 [${accountId}] History sync: ${historyMessages.length} messages found`);
        } else if (messages && typeof messages === 'object') {
          // Handle different message formats (Baileys may structure differently)
          historyMessages = Object.values(messages).flat();
          console.log(`📚 [${accountId}] History sync: ${historyMessages.length} messages extracted from history object`);
        }

        // Extract chats/contacts metadata
        if (chats && Array.isArray(chats)) {
          historyChats = chats;
        } else if (chats && typeof chats === 'object') {
          historyChats = Object.values(chats);
        }

        // Process messages in batches
        if (historyMessages.length > 0) {
          console.log(`📚 [${accountId}] Starting history sync: ${historyMessages.length} messages`);
          const result = await saveMessagesBatch(accountId, historyMessages, 'history_sync');
          
          console.log(`✅ [${accountId}] History sync complete: ${result.saved} saved, ${result.skipped} skipped, ${result.errors} errors`);
          
          // Update account metadata
          await saveAccountToFirestore(accountId, {
            lastHistorySyncAt: admin.firestore.FieldValue.serverTimestamp(),
            historySyncCount: (result.saved || 0),
            lastHistorySyncResult: {
              saved: result.saved || 0,
              skipped: result.skipped || 0,
              errors: result.errors || 0,
              total: historyMessages.length,
              dryRun: result.dryRun || false,
            },
          }).catch(err => console.error(`❌ [${accountId}] Failed to update history sync marker:`, err.message));
        } else {
          console.log(`⚠️  [${accountId}] History sync: No messages found in history`);
        }

        // Optionally save chats metadata (for future reference)
        if (historyChats.length > 0 && !HISTORY_SYNC_DRY_RUN) {
          console.log(`📚 [${accountId}] History sync: ${historyChats.length} chats found (metadata only, not persisted separately)`);
        }

      } catch (error) {
        console.error(`❌ [${accountId}] History sync error:`, error.message);
        console.error(`❌ [${accountId}] Stack:`, error.stack);
        await logIncident(accountId, 'history_sync_failed', { error: error.message });
      }
    });

    // Messages handler
    sock.ev.on('messages.upsert', async ({ messages: newMessages, type }) => {
      try {
        console.log(
          `🔔🔔🔔 [${accountId}] messages.upsert EVENT TRIGGERED: type=${type}, count=${newMessages.length}, timestamp=${new Date().toISOString()}`
        );
        console.log(
          `🔔 [${accountId}] Account status: ${account?.status}, Socket exists: ${!!sock}`
        );
        console.log(
          `🔔 [${accountId}] Firestore available: ${firestoreAvailable}, DB exists: ${!!db}`
        );

        for (const msg of newMessages) {
          try {
            console.log(
              `📩 [${accountId}] RAW MESSAGE:`,
              JSON.stringify({
                id: msg.key.id,
                remoteJid: msg.key.remoteJid,
                fromMe: msg.key.fromMe,
                participant: msg.key.participant,
                hasMessage: !!msg.message,
                messageKeys: msg.message ? Object.keys(msg.message) : [],
              })
            );

            if (!msg.message) {
              console.log(`⚠️  [${accountId}] Skipping message ${msg.key.id} - no message content`);
              continue;
            }

            const messageId = msg.key.id;
            const from = msg.key.remoteJid;
            const isFromMe = msg.key.fromMe;

            console.log(
              `📨 [${accountId}] PROCESSING: ${isFromMe ? 'OUTBOUND' : 'INBOUND'} message ${messageId} from ${from}`
            );

            // INBOUND DEDUPE: Skip if already processed
            let shouldSkip = false;
            if (!isFromMe && firestoreAvailable && db) {
              const dedupeKey = `${accountId}__${messageId}`;
              const dedupeRef = db.collection('inboundDedupe').doc(dedupeKey);
              
              try {
                await db.runTransaction(async (transaction) => {
                  const dedupeDoc = await transaction.get(dedupeRef);
                  if (dedupeDoc.exists) {
                    console.log(`⏭️  [${accountId}] Message ${messageId} already processed (dedupe), skipping`);
                    shouldSkip = true;
                    return; // Skip duplicate
                  }
                  
                  // Mark as processed (TTL: 7 days)
                  const ttlTimestamp = admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
                  transaction.set(dedupeRef, {
                    accountId,
                    providerMessageId: messageId,
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    expiresAt: ttlTimestamp,
                  });
                });
              } catch (dedupeError) {
                // If transaction fails (e.g., already exists), skip processing
                console.log(`⏭️  [${accountId}] Dedupe check failed for ${messageId}, skipping:`, dedupeError.message);
                shouldSkip = true;
              }
            }
            
            if (shouldSkip) {
              continue; // Skip duplicate message
            }

            // Save to Firestore (use helper function for consistency)
            const saved = await saveMessageToFirestore(accountId, msg, false, sock);
            if (saved) {
              console.log(`💾 [${accountId}] Message saved to Firestore: ${saved.messageId} in thread ${saved.threadId}, body length: ${saved.messageBody?.length || 0}`);
              
              // Send FCM notification for inbound messages (not from me)
              if (!isFromMe && saved.messageBody) {
                const displayName = saved.displayName || from.split('@')[0];
                console.log(`📱 [${accountId}] Sending FCM notification for inbound message from ${from}`);
                await sendWhatsAppNotification(
                  accountId,
                  saved.threadId,
                  from,
                  saved.messageBody,
                  displayName
                );
              } else if (!isFromMe && !saved.messageBody) {
                console.log(`⚠️  [${accountId}] Inbound message saved but no body (protocol message?), skipping FCM`);
              }
            } else {
              console.log(`⚠️  [${accountId}] saveMessageToFirestore returned null for message ${messageId} from ${from}`);
            }
          } catch (msgError) {
            console.error(`❌ [${accountId}] Error processing message:`, msgError.message);
            console.error(`❌ [${accountId}] Stack:`, msgError.stack);
          }
        }
      } catch (eventError) {
        console.error(`❌ [${accountId}] Error in messages.upsert handler:`, eventError.message);
        console.error(`❌ [${accountId}] Stack:`, eventError.stack);
      }
    });

    // Messages update handler (for status updates: delivered/read receipts)
    sock.ev.on('messages.update', async (updates) => {
      try {
        console.log(`🔄 [${accountId}] messages.update EVENT: ${updates.length} updates`);
        
        if (!firestoreAvailable || !db) {
          return;
        }

        for (const update of updates) {
          try {
            const messageKey = update.key;
            const messageId = messageKey.id;
            const remoteJid = messageKey.remoteJid;
            const updateData = update.update || {};

            // Extract status from update (status: 2 = delivered, 3 = read)
            let status = null;
            let deliveredAt = null;
            let readAt = null;

            if (updateData.status !== undefined) {
              if (updateData.status === 2) {
                status = 'delivered';
                deliveredAt = admin.firestore.FieldValue.serverTimestamp();
              } else if (updateData.status === 3) {
                status = 'read';
                readAt = admin.firestore.FieldValue.serverTimestamp();
              }
            }

            // Update message in Firestore if status changed
            if (status && remoteJid) {
              const threadId = `${accountId}__${remoteJid}`;
              const messageRef = db.collection('threads').doc(threadId).collection('messages').doc(messageId);
              
              const updateFields = {
                status,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              };
              
              if (deliveredAt) {
                updateFields.deliveredAt = deliveredAt;
              }
              if (readAt) {
                updateFields.readAt = readAt;
              }

              await messageRef.set(updateFields, { merge: true });
              console.log(`✅ [${accountId}] Updated message ${messageId} status to ${status}`);
            }
          } catch (updateError) {
            console.error(`❌ [${accountId}] Error updating message receipt:`, updateError.message);
          }
        }
      } catch (error) {
        console.error(`❌ [${accountId}] Error in messages.update handler:`, error.message);
      }
    });

    // Message receipt handler (complementary to messages.update)
    sock.ev.on('message-receipt.update', async (receipts) => {
      try {
        console.log(`📬 [${accountId}] message-receipt.update EVENT: ${receipts.length} receipts`);
        
        if (!firestoreAvailable || !db) {
          return;
        }

        for (const receipt of receipts) {
          try {
            const receiptKey = receipt.key;
            const messageId = receiptKey.id;
            const remoteJid = receiptKey.remoteJid;
            const receiptData = receipt.receipt || {};

            // Extract read receipts
            if (receiptData.readTimestamp && remoteJid) {
              const threadId = `${accountId}__${remoteJid}`;
              const messageRef = db.collection('threads').doc(threadId).collection('messages').doc(messageId);
              
              await messageRef.set({
                status: 'read',
                readAt: admin.firestore.Timestamp.fromMillis(receiptData.readTimestamp * 1000),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              }, { merge: true });
              
              console.log(`✅ [${accountId}] Updated message ${messageId} receipt: read`);
            }
          } catch (receiptError) {
            console.error(`❌ [${accountId}] Error updating receipt:`, receiptError.message);
          }
        }
      } catch (error) {
        console.error(`❌ [${accountId}] Error in message-receipt.update handler:`, error.message);
      }
    });

    console.log(`✅ [${accountId}] Connection created with event handlers`);
    return account;
  } catch (error) {
    console.error(`❌ [${accountId}] Connection creation failed:`, error.message);
    await logIncident(accountId, 'connection_creation_failed', { error: error.message });
    throw error;
  }
}

// Root endpoint
// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /:
 *   get:
 *     summary: Get API status
 *     description: Returns service status and available endpoints
 *     responses:
 *       200:
 *         description: Service status
 */
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'SuperParty WhatsApp Backend',
    version: VERSION,
    commit: COMMIT_HASH,
    bootTimestamp: BOOT_TIMESTAMP,
    uptime: process.uptime(),
    accounts: connections.size,
    maxAccounts: MAX_ACCOUNTS,
    firestore: admin.apps.length > 0 ? 'connected' : 'disconnected',
    documentation: '/api-docs',
    endpoints: [
      'GET /',
      'GET /health',
      'GET /api/whatsapp/accounts',
      'POST /api/whatsapp/add-account',
      'POST /api/whatsapp/regenerate-qr/:accountId',
      'POST /api/whatsapp/send-message',
      'GET /api/whatsapp/messages',
      'DELETE /api/whatsapp/accounts/:id',
    ],
  });
});

// /ready endpoint - readiness check (returns mode + reason for passive)
// MUST be fast - no blocking on lock or Firestore
// ALWAYS returns 200 (Railway uses /health for healthcheck, not /ready)
app.get('/ready', async (req, res) => {
  try {
    const status = await waBootstrap.getWAStatus();
    const isActive = waBootstrap.isActiveMode();
    
    // Get lock details if available (best-effort, non-blocking)
    let lockStatus = null;
    let heldBy = null;
    let lockExpiresInSeconds = null;
    
    try {
      if (waIntegration && waIntegration.stability && waIntegration.stability.lock) {
        const lockInfo = await waIntegration.stability.lock.getStatus();
        lockStatus = lockInfo.exists ? (lockInfo.isHolder ? 'held_by_this_instance' : 'held_by_other') : 'not_held';
        if (lockInfo.exists && lockInfo.holder) {
          heldBy = lockInfo.holder;
        }
        if (lockInfo.exists && lockInfo.remainingMs !== undefined) {
          lockExpiresInSeconds = Math.max(0, Math.ceil(lockInfo.remainingMs / 1000));
        }
      }
    } catch (lockError) {
      // Ignore lock status errors - continue with null values
      console.error('[ready] Error getting lock status:', lockError.message);
    }
    
    if (isActive) {
      res.status(200).json({
        ready: true,
        mode: 'active',
        instanceId: status.instanceId || 'unknown',
        lockStatus: lockStatus,
        heldBy: heldBy,
        lockExpiresInSeconds: lockExpiresInSeconds,
        timestamp: new Date().toISOString(),
      });
    } else {
      // PASSIVE mode - return 200 with mode=passive (not 503 to avoid healthcheck failure)
      // Railway/K8s can use this to check readiness, but /health is used for healthcheck
      res.status(200).json({
        ready: false,
        mode: 'passive',
        reason: status.reason || 'lock_not_acquired',
        instanceId: status.instanceId || 'unknown',
        lockStatus: lockStatus,
        heldBy: heldBy,
        lockExpiresInSeconds: lockExpiresInSeconds,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    // Even on error, return 200 to prevent healthcheck failures
    res.status(200).json({
      ready: false,
      mode: 'unknown',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Health endpoint - consolidated with WA mode and lock info
// REMOVED: Simple health endpoint (replaced by comprehensive one below)

// /api/longrun/status-now endpoint - comprehensive status including passive mode
app.get('/api/longrun/status-now', requireAdmin, async (req, res) => {
  try {
    const status = await waBootstrap.getWAStatus();
    const isActive = waBootstrap.isActiveMode();
    
    // Get account statuses
    const accountStatuses = [];
    for (const [accountId, account] of connections.entries()) {
      accountStatuses.push({
        accountId,
        name: account.name,
        phone: account.phone,
        status: account.status,
        hasQR: !!account.qrCode,
        sessionId: account.sessionId,
      });
    }
    
    res.json({
      waMode: isActive ? 'active' : 'passive',
      waStatus: status.waStatus || (isActive ? 'RUNNING' : 'NOT_RUNNING'),
      instanceId: status.instanceId || 'unknown',
      reason: status.reason || (isActive ? null : 'lock_not_acquired'),
      lockStatus: status.lockStatus || 'unknown',
      accounts: accountStatuses,
      accountsCount: connections.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[status-now] Error:', error.message);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Expose test token (temporary for orchestrator)
app.get('/api/test/token', (req, res) => {
  if (Date.now() > TEST_TOKEN_EXPIRY) {
    return res.status(410).json({ error: 'Token expired' });
  }

  res.json({
    token: ONE_TIME_TEST_TOKEN,
    expiresAt: new Date(TEST_TOKEN_EXPIRY).toISOString(),
    validFor: Math.floor((TEST_TOKEN_EXPIRY - Date.now()) / 1000) + 's',
  });
});

// Helper: Check PASSIVE mode guard (returns true if response sent, false if can proceed)
async function checkPassiveModeGuard(req, res) {
  try {
    if (!waBootstrap.canStartBaileys()) {
      const status = await waBootstrap.getWAStatus();
      const instanceId = status.instanceId || process.env.RAILWAY_DEPLOYMENT_ID || 'unknown';
      const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
      
      console.log(`⏸️  [${requestId}] PASSIVE mode guard: lock not acquired, reason=${status.reason || 'unknown'}, instanceId=${instanceId}`);
      
      res.status(503).json({
        success: false,
        error: 'instance_passive',
        message: `Backend in PASSIVE mode: ${status.reason || 'lock not acquired'}`,
        mode: 'passive',
        instanceId: instanceId,
        holderInstanceId: status.holderInstanceId,
        retryAfterSeconds: 15,
        waMode: 'passive',
        requestId: requestId,
      });
      return true; // Response sent
    }
    return false; // Can proceed
  } catch (error) {
    console.error(`[checkPassiveModeGuard] Error:`, error.message);
    // On error, allow to proceed (fail open) but log
    return false;
  }
}

// Health monitoring functions
function updateConnectionHealth(accountId, eventType) {
  if (!connectionHealth.has(accountId)) {
    connectionHealth.set(accountId, {
      lastEventAt: Date.now(),
      lastMessageAt: null,
      reconnectCount: 0,
      isStale: false,
    });
  }

  const health = connectionHealth.get(accountId);
  health.lastEventAt = Date.now();

  if (eventType === 'message') {
    health.lastMessageAt = Date.now();
  }

  health.isStale = false;
}

// Check session health and restore if needed
async function checkSessionHealth(accountId, account) {
  if (!account || !account.sock) return;
  
  try {
    // Check if socket is still connected
    const isConnected = account.sock?.user?.id && account.status === 'connected';
    
    if (!isConnected && account.status === 'connected') {
      // Socket might be disconnected but status not updated
      console.log(`⚠️  [${accountId}] Session health check: socket disconnected but status is connected`);
      
      // Verify disk session exists
      const sessionPath = path.join(authDir, accountId);
      const credsPath = path.join(sessionPath, 'creds.json');
      const credsExists = fs.existsSync(credsPath);
      
      if (!credsExists && USE_FIRESTORE_BACKUP && firestoreAvailable && db) {
        // Restore from Firestore
        console.log(`🔄 [${accountId}] Session health check: restoring missing disk session from Firestore...`);
        try {
          const sessionDoc = await db.collection('wa_sessions').doc(accountId).get();
          if (sessionDoc.exists && sessionDoc.data().files) {
            const sessionData = sessionDoc.data().files;
            let restoredCount = 0;
            for (const [filename, content] of Object.entries(sessionData)) {
              const filePath = path.join(sessionPath, filename);
              await fs.promises.writeFile(filePath, content, 'utf8');
              restoredCount++;
            }
            if (restoredCount > 0) {
              console.log(`✅ [${accountId}] Session restored from Firestore (${restoredCount} files)`);
              // Mark session as stable
              if (!sessionStability.has(accountId)) {
                sessionStability.set(accountId, { lastRestoreAt: Date.now(), restoreCount: 0, lastStableAt: Date.now() });
              }
              const stability = sessionStability.get(accountId);
              stability.restoreCount++;
              stability.lastRestoreAt = Date.now();
            }
          }
        } catch (restoreError) {
          console.error(`❌ [${accountId}] Session health restore failed:`, restoreError.message);
        }
      }
    } else if (isConnected) {
      // Session is healthy - update stability tracking
      if (!sessionStability.has(accountId)) {
        sessionStability.set(accountId, { lastRestoreAt: null, restoreCount: 0, lastStableAt: Date.now() });
      }
      const stability = sessionStability.get(accountId);
      stability.lastStableAt = Date.now();
    }
  } catch (error) {
    console.error(`❌ [${accountId}] Session health check error:`, error.message);
  }
}

function checkStaleConnections() {
  const now = Date.now();
  const staleAccounts = [];

  for (const [accountId, account] of connections.entries()) {
    if (account.status !== 'connected') continue;

    // Check session health (restore if needed)
    checkSessionHealth(accountId, account).catch(err => 
      console.error(`❌ [${accountId}] Session health check failed:`, err.message)
    );

    const health = connectionHealth.get(accountId);
    if (!health) {
      // No health data = just connected, give it time
      connectionHealth.set(accountId, {
        lastEventAt: now,
        lastMessageAt: null,
        reconnectCount: 0,
        isStale: false,
      });
      continue;
    }

    const timeSinceLastEvent = now - health.lastEventAt;

    if (timeSinceLastEvent > STALE_CONNECTION_THRESHOLD && !health.isStale) {
      console.log(
        `⚠️  [${accountId}] STALE CONNECTION detected (${Math.round(timeSinceLastEvent / 1000)}s since last event)`
      );
      health.isStale = true;
      staleAccounts.push(accountId);
    }
  }

  return staleAccounts;
}

async function recoverStaleConnection(accountId) {
  console.log(`🔄 [${accountId}] Starting auto-recovery for stale connection...`);

  const account = connections.get(accountId);
  if (!account) {
    console.log(`⚠️  [${accountId}] Account not found in connections`);
    return;
  }

  try {
    // Increment reconnect count
    const health = connectionHealth.get(accountId);
    if (health) {
      health.reconnectCount++;
    }

    // Close existing socket
    if (account.sock) {
      console.log(`🔌 [${accountId}] Closing stale socket...`);
      account.sock.end();
    }

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Remove from connections
    connections.delete(accountId);

    // Trigger restore (will recreate connection)
    console.log(`♻️  [${accountId}] Triggering reconnection...`);
    await restoreSingleAccount(accountId);

    console.log(`✅ [${accountId}] Auto-recovery completed`);
  } catch (error) {
    console.error(`❌ [${accountId}] Auto-recovery failed:`, error.message);
  }
}

// Health monitoring watchdog will be started after account restore

/**
 * @swagger
 * /api/cache/stats:
 *   get:
 *     summary: Get cache statistics
 *     tags: [Cache]
 *     responses:
 *       200:
 *         description: Cache statistics
 */
app.get('/api/cache/stats', async (req, res) => {
  try {
    const stats = await cache.getStats();
    res.json({
      success: true,
      cache: stats,
      featureFlags: {
        caching: featureFlags.isEnabled('API_CACHING'),
        cacheTTL: featureFlags.featureFlags.CACHE_TTL,
      },
    });
  } catch (error) {
    logger.error('Failed to get cache stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache stats',
    });
  }
});

// Debug endpoint for event listeners
app.get('/debug/listeners/:accountId', (req, res) => {
  const { accountId } = req.params;
  const account = connections.get(accountId);

  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const sock = account.sock;
  if (!sock) {
    return res.json({
      error: 'Socket not found',
      account: { id: accountId, status: account.status },
    });
  }

  // Check multiple possible event emitter structures
  const evListeners = sock.ev._events || sock.ev.events || {};
  const evEmitter = sock.ev;

  // Helper to count listeners
  const countListeners = eventName => {
    // Try direct _events access
    if (evListeners[eventName]) {
      return Array.isArray(evListeners[eventName]) ? evListeners[eventName].length : 1;
    }

    // Try listenerCount method (EventEmitter standard)
    if (typeof evEmitter.listenerCount === 'function') {
      return evEmitter.listenerCount(eventName);
    }

    // Try listeners method
    if (typeof evEmitter.listeners === 'function') {
      const listeners = evEmitter.listeners(eventName);
      return Array.isArray(listeners) ? listeners.length : 0;
    }

    return 0;
  };

  res.json({
    accountId,
    status: account.status,
    socketExists: !!sock,
    eventListeners: {
      'messages.upsert': countListeners('messages.upsert'),
      'connection.update': countListeners('connection.update'),
      'creds.update': countListeners('creds.update'),
      'messages.update': countListeners('messages.update'),
    },
    debug: {
      evType: evEmitter.constructor.name,
      hasListenerCount: typeof evEmitter.listenerCount === 'function',
      hasListeners: typeof evEmitter.listeners === 'function',
      evKeys: Object.keys(evEmitter),
      _eventsKeys: Object.keys(evListeners),
      evProto: Object.getOwnPropertyNames(Object.getPrototypeOf(evEmitter)),
      // Check for internal listener storage
      hasBuffer: !!evEmitter.buffer,
      bufferLength: Array.isArray(evEmitter.buffer) ? evEmitter.buffer.length : 0,
      // Try to inspect the actual event emitter internals
      evInspect: JSON.stringify(evEmitter, null, 2).substring(0, 500),
    },
    accountDetails: {
      name: account.name,
      phone: account.phone,
      createdAt: account.createdAt,
      lastUpdate: account.lastUpdate,
    },
  });
});

// Observability endpoints
app.get('/healthz', (req, res) => {
  // Simple liveness check (process is alive)
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Middleware to protect observability endpoints
const requireObsToken = (req, res, next) => {
  const obsToken = process.env.OBS_TOKEN;
  if (!obsToken) {
    // If OBS_TOKEN not set, allow access (dev mode)
    return next();
  }
  const providedToken = req.headers['x-internal-token'];
  if (providedToken !== obsToken) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid X-Internal-Token' });
  }
  next();
};

app.get('/readyz', requireObsToken, async (req, res) => {
  // Readiness check (dependencies available)
  const checks = {
    firestore: firestoreAvailable && !!db,
    worker: true, // Worker is always running (setInterval)
    timestamp: new Date().toISOString(),
  };
  
  const isReady = checks.firestore && checks.worker;
  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    checks,
  });
});

app.get('/metrics-json', requireObsToken, async (req, res) => {
  // Lightweight metrics endpoint (JSON format)
  if (!firestoreAvailable || !db) {
    return res.status(503).json({ error: 'Firestore not available' });
  }
  
  try {
    const now = admin.firestore.Timestamp.now();
    const fiveMinutesAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    
    // Active accounts
    const activeAccounts = Array.from(connections.values()).filter(
      conn => conn.status === 'connected'
    ).length;
    
    // Outbox stats
    const [queuedSnapshot, processingSnapshot, sentSnapshot, failedSnapshot] = await Promise.all([
      db.collection('outbox').where('status', '==', 'queued').get(),
      db.collection('outbox').where('status', '==', 'processing').get(),
      db.collection('outbox')
        .where('status', '==', 'sent')
        .where('sentAt', '>=', fiveMinutesAgo)
        .get(),
      db.collection('outbox')
        .where('status', '==', 'failed')
        .where('failedAt', '>=', fiveMinutesAgo)
        .get(),
    ]);
    
    // Outbox lag (max createdAt for queued messages)
    let outboxLagSeconds = 0;
    if (!queuedSnapshot.empty) {
      const oldestQueued = queuedSnapshot.docs
        .map(doc => doc.data().createdAt)
        .filter(ts => ts)
        .sort((a, b) => a.toMillis() - b.toMillis())[0];
      if (oldestQueued) {
        outboxLagSeconds = Math.floor((now.toMillis() - oldestQueued.toMillis()) / 1000);
      }
    }
    
    // Reconnect count (from connections map - approximate)
    const reconnectCount = Array.from(connections.values())
      .filter(conn => conn.reconnectCount || 0)
      .reduce((sum, conn) => sum + (conn.reconnectCount || 0), 0);
    
    res.json({
      activeAccounts,
      queuedCount: queuedSnapshot.size,
      processingCount: processingSnapshot.size,
      sentLast5m: sentSnapshot.size,
      failedLast5m: failedSnapshot.size,
      reconnectCount,
      outboxLagSeconds,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health endpoint - SIMPLE liveness check (ALWAYS returns 200)
// Railway/K8s healthcheck uses this - MUST be fast and never fail
// Use /ready for readiness (active/passive mode), /health/detailed for comprehensive status
app.get('/health', async (req, res) => {
  const requestId = req.headers['x-request-id'] || `health_${Date.now()}`;
  
  // Simple counters (non-blocking, no async dependencies)
  const connected = Array.from(connections.values()).filter(c => c.status === 'connected').length;
  const accountsTotal = connections.size;

  // Get commit (cached, non-blocking)
  const commit = COMMIT_HASH || 'unknown';
  
  // Get instance ID (non-blocking)
  const instanceId = process.env.RAILWAY_DEPLOYMENT_ID || process.env.HOSTNAME || 'unknown';

  // ALWAYS return 200 - this is liveness check, not readiness
  // Railway marks instance unhealthy if healthcheck returns non-200
  // /ready endpoint handles readiness (active/passive mode)
  res.status(200).json({
    ok: true,
    status: 'healthy',
    service: 'whatsapp-backend',
    version: VERSION,
    commit: commit,
    instanceId: instanceId,
    bootTimestamp: BOOT_TIMESTAMP,
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
    requestId: requestId,
    accounts_total: accountsTotal,
    connected: connected,
    // Note: Use /ready for mode (active/passive), /health/detailed for comprehensive status
  });
});

// Detailed health endpoint with connection metrics
app.get('/health/detailed', async (req, res) => {
  const accountsHealth = [];

  for (const [accountId, account] of connections.entries()) {
    const health = connectionHealth.get(accountId);

    accountsHealth.push({
      accountId,
      status: account.status,
      phoneNumber: account.phoneNumber,
      lastEventAt: health?.lastEventAt ? new Date(health.lastEventAt).toISOString() : null,
      lastMessageAt: health?.lastMessageAt ? new Date(health.lastMessageAt).toISOString() : null,
      timeSinceLastEvent: health?.lastEventAt
        ? Math.floor((Date.now() - health.lastEventAt) / 1000)
        : null,
      timeSinceLastMessage: health?.lastMessageAt
        ? Math.floor((Date.now() - health.lastMessageAt) / 1000)
        : null,
      reconnectCount: health?.reconnectCount || 0,
      isStale: health?.isStale || false,
    });
  }

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    monitoring: {
      staleThreshold: STALE_CONNECTION_THRESHOLD / 1000,
      checkInterval: HEALTH_CHECK_INTERVAL / 1000,
    },
    accounts: accountsHealth,
  });
});

// ============================================================================
// AI ENDPOINTS
// ============================================================================

const https = require('https');

// Rate limiter for AI endpoints
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: { success: false, error: 'Too many AI requests. Try again later.' },
});

// Helper: Save message to Firestore (permanent storage)
async function saveMessageToFirestore(phoneNumber, role, content, metadata = {}) {
  if (!db) {
    console.warn('Firestore not available, skipping message save');
    return;
  }

  try {
    const isImportant =
      content.length > 20 &&
      !['ok', 'da', 'nu', 'bine', 'multumesc', 'haha', 'lol'].includes(
        content.toLowerCase().trim()
      );

    await db
      .collection('whatsappChats')
      .doc(phoneNumber)
      .collection('messages')
      .add({
        role, // 'user' or 'assistant'
        content,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        important: isImportant,
        ...metadata, // model, tokensUsed, etc.
      });

    console.log(`[WhatsApp] Saved ${role} message for ${phoneNumber} (important: ${isImportant})`);
  } catch (error) {
    console.error(`[WhatsApp] Failed to save message:`, error.message);
  }
}

// Helper: Load conversation history from Firestore
async function loadConversationHistory(phoneNumber, limit = 10) {
  if (!db) {
    console.warn('Firestore not available, returning empty history');
    return [];
  }

  try {
    const snapshot = await db
      .collection('whatsappChats')
      .doc(phoneNumber)
      .collection('messages')
      .where('important', '==', true)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const messages = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      messages.push({
        role: data.role,
        content: data.content,
      });
    });

    // Reverse to get chronological order (oldest first)
    return messages.reverse();
  } catch (error) {
    console.error(`[WhatsApp] Failed to load history:`, error.message);
    return [];
  }
}

// Helper function to call Groq API (Llama 3.1 70B - FREE)
async function callGroqAI(messages, maxTokens = 500) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-70b-versatile',
      messages: messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// OpenAI GPT-4o-mini fallback (70% cheaper than GPT-3.5, better quality)
function callOpenAI(messages, maxTokens = 500) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return reject(new Error('OPENAI_API_KEY not configured'));
    }

    const postData = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 30000, // 30s timeout
    };

    const req = https.request(options, res => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (res.statusCode !== 200) {
            const errorMsg = parsed.error?.message || 'OpenAI API error';
            return reject(new Error(errorMsg));
          }

          resolve(parsed);
        } catch (e) {
          reject(new Error('Failed to parse OpenAI response'));
        }
      });
    });

    req.on('error', e => {
      reject(new Error(`Network error: ${e.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

// 1. Chat with AI
app.post('/api/ai/chat', aiLimiter, async (req, res) => {
  const startTime = Date.now();
  const requestId = `ai_chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  console.log(`[${requestId}] AI Chat request`, {
    hasMessages: !!req.body.messages,
    messageCount: req.body.messages?.length || 0,
  });

  try {
    const { messages, phoneNumber } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required',
      });
    }

    // Extract user message (last message)
    const userMessage = messages[messages.length - 1];

    // Load conversation history from Firestore (10 important messages)
    let conversationHistory = [];
    if (phoneNumber) {
      conversationHistory = await loadConversationHistory(phoneNumber, 10);
      console.log(`[${requestId}] Loaded ${conversationHistory.length} messages from history`);

      // Save user message to Firestore
      await saveMessageToFirestore(phoneNumber, 'user', userMessage.content);
    }

    // Build context: history + current messages
    const allMessages = [...conversationHistory, ...messages];

    // Try Groq first (FREE), fallback to OpenAI if fails
    let response;
    try {
      response = await callGroqAI(allMessages, 500);
    } catch (groqError) {
      console.warn(`[${requestId}] Groq failed, falling back to OpenAI:`, groqError.message);
      response = await callOpenAI(allMessages, 500);
    }

    const duration = Date.now() - startTime;
    const message = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;

    // Save AI response to Firestore
    if (phoneNumber) {
      await saveMessageToFirestore(phoneNumber, 'assistant', message, {
        model: response.model || 'llama-3.1-70b-versatile',
        tokensUsed,
      });
    }

    console.log(`[${requestId}] Success`, {
      duration: `${duration}ms`,
      responseLength: message.length,
    });

    res.json({
      success: true,
      message: message,
      requestId: requestId,
      duration: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`[${requestId}] Error`, {
      duration: `${duration}ms`,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: error.message,
      requestId: requestId,
    });
  }
});

// 2. Validate image with AI
app.post('/api/ai/validate-image', aiLimiter, async (req, res) => {
  const startTime = Date.now();
  const requestId = `ai_img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  console.log(`[${requestId}] AI Image validation request`, {
    hasImageUrl: !!req.body.imageUrl,
  });

  try {
    const { imageUrl, prompt } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'imageUrl is required',
      });
    }

    const messages = [
      {
        role: 'system',
        content:
          'You are an image validation assistant. Analyze images and provide validation results.',
      },
      {
        role: 'user',
        content:
          prompt || `Analyze this image and validate if it meets quality standards: ${imageUrl}`,
      },
    ];

    // Try Groq first (FREE), fallback to OpenAI if fails
    let response;
    try {
      response = await callGroqAI(messages, 300);
    } catch (groqError) {
      console.warn(`[${requestId}] Groq failed, falling back to OpenAI:`, groqError.message);
      response = await callOpenAI(messages, 300);
    }

    const duration = Date.now() - startTime;
    const analysis = response.choices[0]?.message?.content || '';

    console.log(`[${requestId}] Success`, {
      duration: `${duration}ms`,
      analysisLength: analysis.length,
    });

    res.json({
      success: true,
      analysis: analysis,
      imageUrl: imageUrl,
      requestId: requestId,
      duration: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`[${requestId}] Error`, {
      duration: `${duration}ms`,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: error.message,
      requestId: requestId,
    });
  }
});

// 3. Analyze text with AI
app.post('/api/ai/analyze-text', aiLimiter, async (req, res) => {
  const startTime = Date.now();
  const requestId = `ai_txt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  console.log(`[${requestId}] AI Text analysis request`, {
    hasText: !!req.body.text,
    textLength: req.body.text?.length || 0,
  });

  try {
    const { text, analysisType } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'text is required',
      });
    }

    const systemPrompts = {
      sentiment:
        'You are a sentiment analysis expert. Analyze the sentiment of the text and provide a detailed assessment.',
      summary: 'You are a text summarization expert. Provide a concise summary of the text.',
      keywords:
        'You are a keyword extraction expert. Extract the main keywords and topics from the text.',
      default: 'You are a text analysis expert. Analyze the provided text and provide insights.',
    };

    const messages = [
      {
        role: 'system',
        content: systemPrompts[analysisType] || systemPrompts.default,
      },
      {
        role: 'user',
        content: text,
      },
    ];

    // Try Groq first (FREE), fallback to OpenAI if fails
    let response;
    try {
      response = await callGroqAI(messages, 400);
    } catch (groqError) {
      console.warn(`[${requestId}] Groq failed, falling back to OpenAI:`, groqError.message);
      response = await callOpenAI(messages, 400);
    }

    const duration = Date.now() - startTime;
    const analysis = response.choices[0]?.message?.content || '';

    console.log(`[${requestId}] Success`, {
      duration: `${duration}ms`,
      analysisType: analysisType || 'default',
      analysisLength: analysis.length,
    });

    res.json({
      success: true,
      analysis: analysis,
      analysisType: analysisType || 'default',
      requestId: requestId,
      duration: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`[${requestId}] Error`, {
      duration: `${duration}ms`,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: error.message,
      requestId: requestId,
    });
  }
});

// QR Display endpoint (HTML for easy scanning)
app.get('/api/whatsapp/qr/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    // Try in-memory first
    let account = connections.get(accountId);

    // If not in memory, try Firestore
    if (!account) {
      const doc = await db.collection('accounts').doc(accountId).get();
      if (doc.exists) {
        account = doc.data();
      }
    }

    if (!account) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; padding: 20px;">
            <h2>❌ Account Not Found</h2>
            <p>Account ID: ${accountId}</p>
          </body>
        </html>
      `);
    }

    const qrCode = account.qrCode || account.qr_code;

    if (!qrCode) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; padding: 20px;">
            <h2>⏳ QR Code Not Ready</h2>
            <p>Account ID: ${accountId}</p>
            <p>Status: ${account.status}</p>
            <p>Refresh this page in a few seconds...</p>
            <script>setTimeout(() => location.reload(), 5000);</script>
          </body>
        </html>
      `);
    }

    res.send(`
      <html>
        <head>
          <title>WhatsApp QR Code - ${accountId}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
            }
            img {
              max-width: 400px;
              border: 2px solid #25D366;
              border-radius: 10px;
            }
            .instructions {
              margin-top: 20px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>📱 WhatsApp QR Code</h1>
            <p><strong>Account ID:</strong> ${accountId}</p>
            <img src="${qrCode}" alt="QR Code" />
            <div class="instructions">
              <h3>How to scan:</h3>
              <ol style="text-align: left; display: inline-block;">
                <li>Open WhatsApp on your phone</li>
                <li>Go to Settings → Linked Devices</li>
                <li>Tap "Link a Device"</li>
                <li>Scan this QR code</li>
              </ol>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Error displaying QR:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 20px;">
          <h2>❌ Error</h2>
          <p>${error.message}</p>
        </body>
      </html>
    `);
  }
});

// Get all accounts
/**
 * @swagger
 * /api/whatsapp/accounts:
 *   get:
 *     summary: Get all WhatsApp accounts
 *     description: Returns list of all WhatsApp accounts with their status
 *     responses:
 *       200:
 *         description: List of accounts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accounts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Account'
 *                 cached:
 *                   type: boolean
 */
app.get('/api/whatsapp/accounts', async (req, res) => {
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
  
  // Get WA status and mode (non-blocking, best-effort)
  let status, instanceId, isActive, lockReason;
  try {
    status = await waBootstrap.getWAStatus();
    instanceId = status.instanceId || process.env.RAILWAY_DEPLOYMENT_ID || 'unknown';
    isActive = waBootstrap.isActiveMode();
    lockReason = status.reason || null;
  } catch (error) {
    console.error(`[GET /accounts/${requestId}] Error getting WA status:`, error.message);
    instanceId = process.env.RAILWAY_DEPLOYMENT_ID || 'unknown';
    isActive = false;
    lockReason = 'status_check_failed';
  }
  
  // Log request with mode info
  console.log(`📋 [GET /accounts/${requestId}] Request: waMode=${isActive ? 'active' : 'passive'}, instanceId=${instanceId}, lockReason=${lockReason || 'none'}`);
  
  try {
    // Try cache first (if enabled)
    if (featureFlags.isEnabled('API_CACHING')) {
      const cacheKey = 'whatsapp:accounts';
      const cached = await cache.get(cacheKey);

      if (cached) {
        console.log(`📋 [GET /accounts/${requestId}] Cache hit: ${cached.length} accounts`);
        return res.json({ 
          success: true, 
          accounts: cached, 
          cached: true,
          instanceId: instanceId,
          waMode: isActive ? 'active' : 'passive',
          lockReason: lockReason,
          requestId: requestId,
        });
      }
    }

    const accounts = [];
    const accountIdsInMemory = new Set();
    
    // First, add accounts from memory (active connections)
    // NOTE: In PASSIVE mode, connections Map is empty (no Baileys connections)
    connections.forEach((conn, id) => {
      // CRITICAL: Filter out deleted accounts from memory too
      if (conn.status === 'deleted') {
        return; // Skip deleted accounts
      }
      
      accountIdsInMemory.add(id);
      accounts.push({
        id,
        name: conn.name,
        phone: conn.phone,
        status: conn.status,
        qrCode: conn.qrCode,
        pairingCode: conn.pairingCode,
        createdAt: conn.createdAt,
        lastUpdate: conn.lastUpdate,
      });
    });
    
    console.log(`📋 [GET /accounts/${requestId}] In-memory accounts: ${accounts.length}`);

    // CRITICAL: Also include accounts from Firestore that are not in memory
    // This ensures accounts with status 'needs_qr' remain visible after 401 logout
    // AND ensures accounts are visible even in PASSIVE mode (when connections Map is empty)
    if (firestoreAvailable && db) {
      try {
        const snapshot = await db.collection('accounts').get();
        console.log(`📋 [GET /accounts/${requestId}] Firestore accounts: ${snapshot.size} total`);
        
        for (const doc of snapshot.docs) {
          const accountId = doc.id;
          
          // Skip if already in memory (already added above)
          if (accountIdsInMemory.has(accountId)) {
            continue;
          }
          
          const data = doc.data();
          const accountStatus = data.status || 'unknown';
          
          // CRITICAL: Filter out deleted accounts (they should not appear in the list)
          // Deleted accounts are marked but not removed from Firestore for audit purposes
          // However, they should not clutter the UI
          if (accountStatus === 'deleted') {
            continue; // Skip deleted accounts
          }
          
          // Include all non-deleted accounts (including needs_qr, logged_out, disconnected, etc.)
          // This ensures accounts don't "disappear" from UI after 401 or in PASSIVE mode
          accounts.push({
            id: accountId,
            name: data.name || accountId,
            phone: data.phoneE164 || data.phone || null,
            status: accountStatus,
            qrCode: data.qrCode || null,
            pairingCode: data.pairingCode || null,
            createdAt: data.createdAt || null,
            lastUpdate: data.updatedAt || data.lastUpdate || null,
            lastError: data.lastError || null,
            passiveModeReason: data.passiveModeReason || null,
          });
        }
        
        console.log(`📋 [GET /accounts/${requestId}] Total accounts (memory + Firestore): ${accounts.length}`);
      } catch (error) {
        console.error(`⚠️  [GET /accounts/${requestId}] Failed to load accounts from Firestore:`, error.message);
        // Continue with in-memory accounts only
      }
    } else {
      console.log(`⚠️  [GET /accounts/${requestId}] Firestore not available - returning in-memory accounts only`);
    }

    // Cache if enabled
    if (featureFlags.isEnabled('API_CACHING')) {
      const ttl = featureFlags.get('CACHE_TTL_SECONDS', 30) * 1000;
      await cache.set('whatsapp:accounts', accounts, ttl);
    }

    // Response includes mode info for debugging
    res.json({ 
      success: true, 
      accounts, 
      cached: false,
      instanceId: instanceId,
      waMode: isActive ? 'active' : 'passive',
      lockReason: lockReason,
      requestId: requestId,
    });
    
    console.log(`✅ [GET /accounts/${requestId}] Response: ${accounts.length} accounts, waMode=${isActive ? 'active' : 'passive'}`);
  } catch (error) {
    console.error(`❌ [GET /accounts/${requestId}] Error:`, error.message, error.stack?.substring(0, 200));
    res.status(500).json({ 
      success: false, 
      error: error.message,
      requestId: requestId,
      hint: `Check Railway logs for requestId: ${requestId}`,
    });
  }
});

// Visual QR endpoint (temporary for testing)
app.get('/api/whatsapp/qr-visual', async (req, res) => {
  try {
    const accounts = [];
    connections.forEach((conn, id) => {
      if (conn.qrCode) {
        accounts.push({
          id,
          name: conn.name,
          phone: conn.phone,
          status: conn.status,
          qrCode: conn.qrCode,
        });
      }
    });

    if (accounts.length === 0) {
      return res.send(
        '<html><body><h1>No QR codes available</h1><p>Create an account first using POST /api/whatsapp/add-account</p></body></html>'
      );
    }

    const html = `
      <html>
      <head>
        <title>WhatsApp QR Codes</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .qr-container { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .qr-container h2 { margin-top: 0; color: #25D366; }
          .qr-container img { max-width: 400px; border: 2px solid #25D366; border-radius: 8px; }
          .info { color: #666; margin: 10px 0; }
          .status { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; }
          .status.qr_ready { background: #FFF3CD; color: #856404; }
          .status.connecting { background: #D1ECF1; color: #0C5460; }
          .status.connected { background: #D4EDDA; color: #155724; }
        </style>
      </head>
      <body>
        <h1>📱 WhatsApp QR Codes</h1>
        ${accounts
          .map(
            acc => `
          <div class="qr-container">
            <h2>${acc.name || acc.id}</h2>
            <div class="info">
              <strong>Phone:</strong> ${acc.phone || 'N/A'}<br>
              <strong>Status:</strong> <span class="status ${acc.status}">${acc.status}</span><br>
              <strong>Account ID:</strong> ${acc.id}
            </div>
            <img src="${acc.qrCode}" alt="QR Code">
            <p style="color: #666; font-size: 14px;">Scan this QR code with WhatsApp: Settings → Linked Devices → Link a Device</p>
          </div>
        `
          )
          .join('')}
        <script>
          // Auto-refresh every 5 seconds
          setTimeout(() => location.reload(), 5000);
        </script>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    res.status(500).send(`<html><body><h1>Error</h1><pre>${error.message}</pre></body></html>`);
  }
});

// Add new account
app.post('/api/whatsapp/add-account', accountLimiter, async (req, res) => {
  // HARD GATE: PASSIVE mode - do NOT create new Baileys connections
  const passiveGuard = await checkPassiveModeGuard(req, res);
  if (passiveGuard) return; // Response already sent

  try {
    const { name, phone } = req.body;

    if (connections.size >= MAX_ACCOUNTS) {
      return res.status(429).json({
        success: false,
        error: 'rate_limited',
        message: `Maximum ${MAX_ACCOUNTS} accounts reached`,
        maxAccounts: MAX_ACCOUNTS,
        currentAccounts: connections.size,
      });
    }

    // Generate deterministic accountId based on canonicalized phone number
    // If no phone provided, generate random ID
    let accountId;
    let canonicalPhoneNum = null;
    
    if (phone) {
      canonicalPhoneNum = canonicalPhone(phone);
      accountId = generateAccountId(canonicalPhoneNum);
    } else {
      // No phone provided - generate random ID for QR-only accounts
      const randomId = crypto.randomBytes(16).toString('hex');
      const namespace = process.env.ACCOUNT_NAMESPACE || 'prod';
      accountId = `account_${namespace}_${randomId}`;
    }

    // Check for duplicate phone number and disconnect old session
    if (phone) {
      const normalizedPhone = phone.replace(/\D/g, ''); // Remove non-digits

      // Check in active connections (memory)
      for (const [existingId, conn] of connections.entries()) {
        const existingPhone = conn.phone?.replace(/\D/g, '');
        if (existingPhone && existingPhone === normalizedPhone) {
          console.log(
            `🔄 [${existingId}] Disconnecting old session for phone ${maskPhone(normalizedPhone)}`
          );

          // Disconnect old session
          if (conn.sock) {
            try {
              conn.sock.end();
            } catch (e) {
              console.error(`❌ [${existingId}] Error ending socket:`, e.message);
            }
          }

          // Remove from connections
          connections.delete(existingId);
          reconnectAttempts.delete(existingId);
          connectionRegistry.release(existingId);

          // Update Firestore status
          if (firestoreAvailable && db) {
            await saveAccountToFirestore(existingId, {
              status: 'disconnected',
              lastDisconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastDisconnectReason: 'replaced_by_new_session',
            }).catch(err => console.error(`❌ [${existingId}] Failed to update Firestore:`, err));
          }

          console.log(`✅ [${existingId}] Old session disconnected`);
        }
      }

      // Check in Firestore for any other accounts with same phone
      if (firestoreAvailable && db) {
        try {
          const accountsSnapshot = await db.collection('accounts').get();
          for (const doc of accountsSnapshot.docs) {
            const data = doc.data();
            const existingPhone =
              data.phoneE164?.replace(/\D/g, '') || data.phone?.replace(/\D/g, '');
            if (existingPhone && existingPhone === normalizedPhone && doc.id !== accountId) {
              console.log(`🗑️ [${doc.id}] Marking old Firestore account as disconnected`);
              await db.collection('accounts').doc(doc.id).update({
                status: 'disconnected',
                lastDisconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastDisconnectReason: 'replaced_by_new_session',
              });
            }
          }
        } catch (error) {
          console.error('❌ Error checking Firestore for duplicates:', error.message);
        }
      }
    }

    console.log(`📞 [${accountId}] Canonical phone: ${maskPhone(canonicalPhoneNum)}`);

    // Invalidate accounts cache
    if (featureFlags.isEnabled('API_CACHING')) {
      await cache.delete('whatsapp:accounts');
    }

    // HARD GATE: PASSIVE mode - do NOT create connection (requires Baileys)
    if (!waBootstrap.canStartBaileys()) {
      const status = await waBootstrap.getWAStatus();
      const instanceId = status.instanceId || process.env.RAILWAY_DEPLOYMENT_ID || 'unknown';
      console.log(`⏸️  [${accountId}] Add account blocked: PASSIVE mode (instanceId: ${instanceId})`);
      return res.status(503).json({
        success: false,
        error: 'PASSIVE mode: another instance holds lock; retry shortly',
        message: `Backend in PASSIVE mode: ${status.reason || 'lock not acquired'}`,
        mode: 'passive',
        instanceId: instanceId,
        waMode: 'passive',
        requestId: req.headers['x-request-id'] || `req_${Date.now()}`,
      });
    }

    // Get instance info for response
    const status = await waBootstrap.getWAStatus();
    const instanceId = status.instanceId || process.env.RAILWAY_DEPLOYMENT_ID || 'unknown';
    const isActive = waBootstrap.isActiveMode();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;

    console.log(`[${requestId}] Add account: accountId=${accountId}, instanceId=${instanceId}, waMode=${isActive ? 'active' : 'passive'}`);

    // Create connection (async, will emit QR later)
    createConnection(accountId, name, phone).catch(err => {
      console.error(`❌ [${accountId}] Failed to create:`, err.message);
      Sentry.captureException(err, {
        tags: { accountId, operation: 'create_connection', requestId },
        extra: { name, phone: maskPhone(canonicalPhoneNum) },
      });
    });

    // Return immediately with connecting status + instance info
    res.json({
      success: true,
      account: {
        id: accountId,
        name,
        phone,
        status: 'connecting',
        qrCode: null,
        pairingCode: null,
        createdAt: new Date().toISOString(),
      },
      instanceId: instanceId,
      waMode: isActive ? 'active' : 'passive',
      requestId: requestId,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { endpoint: 'add-account' },
      extra: { body: req.body },
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clean up duplicate accounts (public endpoint - temporary)
app.post('/api/cleanup-duplicates', async (req, res) => {
  try {
    if (!firestoreAvailable || !db) {
      return res.status(503).json({ error: 'Firestore not available' });
    }

    const accountsSnapshot = await db.collection('accounts').get();
    const phoneMap = new Map(); // phone -> [accountIds]
    const duplicates = [];

    // Group accounts by phone number
    for (const doc of accountsSnapshot.docs) {
      const data = doc.data();
      const phone = data.phoneE164?.replace(/\D/g, '') || data.phone?.replace(/\D/g, '');

      if (phone) {
        if (!phoneMap.has(phone)) {
          phoneMap.set(phone, []);
        }
        phoneMap.get(phone).push({
          id: doc.id,
          name: data.name,
          status: data.status,
          createdAt: data.createdAt,
          lastUpdate: data.updatedAt || data.lastUpdate,
        });
      }
    }

    // Find duplicates and keep only the most recent connected one
    for (const [phone, accounts] of phoneMap.entries()) {
      if (accounts.length > 1) {
        // Sort by: connected first, then by most recent
        accounts.sort((a, b) => {
          if (a.status === 'connected' && b.status !== 'connected') return -1;
          if (a.status !== 'connected' && b.status === 'connected') return 1;

          const aTime = a.lastUpdate?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const bTime = b.lastUpdate?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return bTime - aTime; // Most recent first
        });

        // Keep first (most relevant), mark others as duplicates
        const toKeep = accounts[0];
        const toRemove = accounts.slice(1);

        duplicates.push({
          phone,
          kept: toKeep,
          removed: toRemove,
        });

        // Disconnect and mark duplicates
        for (const acc of toRemove) {
          console.log(`🗑️ [${acc.id}] Removing duplicate for phone ${phone}`);

          // Disconnect if in memory
          if (connections.has(acc.id)) {
            const conn = connections.get(acc.id);
            if (conn.sock) {
              try {
                conn.sock.end();
              } catch (e) {
                // Ignore
              }
            }
            connections.delete(acc.id);
            reconnectAttempts.delete(acc.id);
            connectionRegistry.release(acc.id);
          }

          // Update Firestore
          await db.collection('accounts').doc(acc.id).update({
            status: 'disconnected',
            lastDisconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastDisconnectReason: 'duplicate_cleanup',
          });
        }
      }
    }

    res.json({
      success: true,
      message: `Cleaned up ${duplicates.length} duplicate phone numbers`,
      duplicates: duplicates.map(d => ({
        phone: d.phone,
        kept: d.kept.id,
        removed: d.removed.map(r => r.id),
      })),
    });
  } catch (error) {
    console.error('❌ Cleanup duplicates error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update account name
app.patch('/api/whatsapp/accounts/:accountId/name', accountLimiter, async (req, res) => {
  // HARD GATE: PASSIVE mode - do NOT mutate account state
  const passiveGuard = await checkPassiveModeGuard(req, res);
  if (passiveGuard) return; // Response already sent
  
  try {
    const { accountId } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'invalid_request',
        message: 'Name is required',
        accountId: accountId,
      });
    }

    const account = connections.get(accountId);
    if (!account) {
      return res.status(404).json({ 
        success: false, 
        error: 'account_not_found',
        message: 'Account not found',
        accountId: accountId,
      });
    }

    // Update in memory
    account.name = name.trim();

    // Update in Firestore if available
    if (firestoreAvailable && db) {
      await db.collection('accounts').doc(accountId).update({
        name: name.trim(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.json({
      success: true,
      message: 'Account name updated',
      account: {
        id: accountId,
        name: account.name,
        phone: account.phone,
        status: account.status,
      },
    });
  } catch (error) {
    console.error('❌ Update account name error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Regenerate QR
app.post('/api/whatsapp/regenerate-qr/:accountId', qrRegenerateLimiter, async (req, res) => {
  // DEBUG: Log incoming request
  const accountId = req.params.accountId;
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
  console.log(`🔍 [${requestId}] Regenerate QR request: accountId=${accountId}, method=${req.method}, path=${req.path}`);
  
  // HARD GATE: PASSIVE mode - do NOT regenerate QR (requires Baileys connection)
  const passiveGuard = await checkPassiveModeGuard(req, res);
  if (passiveGuard) return; // Response already sent

  try {
    // Get current account state for logging
    let account = connections.get(accountId);
    const accountStatus = account?.status || (account?.data && account.data.status) || 'unknown';
    const lockStatus = await waBootstrap.getWAStatus();
    const isActive = waBootstrap.isActiveMode();
    
    console.log(`🔍 [${requestId}] Account state: status=${accountStatus}, hasAccount=${!!account}, waMode=${isActive ? 'active' : 'passive'}, lockOwner=${lockStatus.instanceId || 'unknown'}`);
    
    // If not in memory, try to load from Firestore
    if (!account && firestoreAvailable && db) {
      try {
        const accountDoc = await db.collection('accounts').doc(accountId).get();
        if (accountDoc.exists) {
          const data = accountDoc.data();
          account = { id: accountId, ...data };
          console.log(`📥 [${requestId}] Loaded account from Firestore: status=${data.status || 'unknown'}, lastError=${data.lastError || 'none'}`);
          
          // Log last disconnect info if available
          if (data.lastDisconnectReason) {
            console.log(`📥 [${requestId}] Last disconnect: reason=${data.lastDisconnectReason}, at=${data.lastDisconnectedAt?.toDate?.() || data.lastDisconnectedAt || 'unknown'}`);
          }
        }
      } catch (error) {
        console.error(`⚠️  [${accountId}/${requestId}] Failed to load account from Firestore:`, error.message, error.stack?.substring(0, 200));
      }
    }

    if (!account) {
      console.log(`❌ [${requestId}] Account not found: accountId=${accountId}`);
      return res.status(404).json({ 
        success: false, 
        error: 'account_not_found',
        message: 'Account not found',
        accountId: accountId,
        requestId: requestId,
      });
    }

    // IDEMPOTENCY: Check if regenerate is already in progress
    // Check both in-memory and Firestore for regenerating flag
    let isRegenerating = false;
    if (account && connections.has(accountId)) {
      isRegenerating = account.regeneratingQr === true || account.status === 'connecting';
    } else if (firestoreAvailable && db) {
      // Check Firestore if not in memory
      try {
        const accountDoc = await db.collection('accounts').doc(accountId).get();
        if (accountDoc.exists) {
          const data = accountDoc.data();
          isRegenerating = data.regeneratingQr === true || data.status === 'connecting';
        }
      } catch (error) {
        console.error(`⚠️  [${accountId}/${requestId}] Failed to check regenerating flag in Firestore:`, error.message);
      }
    }
    
    if (isRegenerating) {
      console.log(`ℹ️  [${accountId}/${requestId}] Regenerate already in progress (status=${account?.status || 'unknown'}), returning 202 Accepted`);
      return res.status(202).json({ 
        success: true, 
        message: 'QR regeneration already in progress',
        status: 'already_in_progress',
        accountId: accountId,
        requestId: requestId,
      });
    }

    // IDEMPOTENCY: Check if account is already in pairing phase with valid QR
    const currentStatus = account.status || (account.data && account.data.status);
    const hasValidQR = (currentStatus === 'qr_ready' || currentStatus === 'awaiting_scan') && account.qrCode;
    
    if (hasValidQR) {
      // Check QR age if available
      const qrAge = account.qrUpdatedAt 
        ? Date.now() - (account.qrUpdatedAt.toMillis ? account.qrUpdatedAt.toMillis() : new Date(account.qrUpdatedAt).getTime())
        : 0;
      const QR_EXPIRY_MS = 60 * 1000; // QR expires after 60 seconds (WhatsApp standard)
      
      if (qrAge < QR_EXPIRY_MS) {
        console.log(`ℹ️  [${accountId}/${requestId}] QR already exists and valid (status: ${currentStatus}, age: ${Math.round(qrAge/1000)}s), returning existing QR (idempotent)`);
        return res.json({ 
          success: true, 
          message: 'QR code already available',
          qrCode: account.qrCode,
          status: currentStatus,
          ageSeconds: Math.round(qrAge / 1000),
          idempotent: true,
          accountId: accountId,
          requestId: requestId,
        });
      } else {
        console.log(`ℹ️  [${accountId}/${requestId}] QR exists but expired (age: ${Math.round(qrAge/1000)}s), will regenerate`);
      }
    }
    
    // Per-account mutex: Mark as regenerating to prevent concurrent requests
    if (account && connections.has(accountId)) {
      account.regeneratingQr = true;
    } else if (firestoreAvailable && db) {
      // Also mark in Firestore if not in memory
      try {
        await db.collection('accounts').doc(accountId).update({
          regeneratingQr: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        console.error(`⚠️  [${accountId}/${requestId}] Failed to mark regenerating in Firestore:`, error.message);
      }
    }

    // Clear session to ensure fresh pairing (disk + Firestore) - only if QR expired or not valid
    try {
      await clearAccountSession(accountId);
      console.log(`🗑️  [${accountId}/${requestId}] Session cleared for QR regeneration${hasValidQR ? ' (QR expired)' : ''}`);
    } catch (error) {
      console.error(`⚠️  [${accountId}/${requestId}] Failed to clear session during QR regeneration:`, error.message, error.stack?.substring(0, 200));
      // Continue anyway - createConnection will handle fresh session
    }

    // CRITICAL: Check if already connecting BEFORE cleanup to prevent duplicate connections
    // This prevents 500 errors when regenerateQr is called while createConnection is already running
    const canConnect = connectionRegistry.tryAcquire(accountId);
    if (!canConnect) {
      console.log(`ℹ️  [${accountId}/${requestId}] Already connecting (connectionRegistry check), skip createConnection - QR will be available shortly`);
      // Clear regenerating flag since we're not actually regenerating
      if (account && connections.has(accountId)) {
        account.regeneratingQr = false;
      }
      if (firestoreAvailable && db) {
        db.collection('accounts').doc(accountId).update({
          regeneratingQr: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(e => console.error(`Failed to clear regenerating flag:`, e.message));
      }
      
      // Return success - connection already in progress will emit QR when ready
      const status = await waBootstrap.getWAStatus();
      const instanceId = status.instanceId || process.env.RAILWAY_DEPLOYMENT_ID || 'unknown';
      const isActiveMode = waBootstrap.canStartBaileys();
      
      return res.json({ 
        success: true, 
        message: 'Connection already in progress, QR will be available shortly',
        status: 'already_connecting',
        instanceId: instanceId,
        waMode: isActiveMode ? 'active' : 'passive',
        accountId: accountId,
        requestId: requestId,
      });
    }

    // Clean up old connection if exists
    if (account.sock) {
      try {
        account.sock.end();
      } catch (e) {
        // Ignore
      }
    }

    // Clean up in-memory state (but keep lock since we just acquired it)
    connections.delete(accountId);
    reconnectAttempts.delete(accountId);
    // NOTE: Don't release() here - we just acquired the lock above via tryAcquire

    // Update Firestore status to connecting (will transition to qr_ready)
    try {
      await saveAccountToFirestore(accountId, {
        status: 'connecting',
        lastError: null,
        requiresQR: true,
        regeneratingQr: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error(`⚠️  [${accountId}/${requestId}] Failed to update Firestore status:`, error.message);
    }

    // Get instance info for response
    const status = await waBootstrap.getWAStatus();
    const instanceId = status.instanceId || process.env.RAILWAY_DEPLOYMENT_ID || 'unknown';
    const isActiveMode = waBootstrap.isActiveMode();

    // Create new connection (will generate fresh QR since session is cleared)
    // CRITICAL FIX: Wrap in try-catch to handle sync errors (e.g., validation, null checks)
    // Note: createConnection is async but we don't await it - it will emit QR via connection.update event
    try {
      createConnection(accountId, account.name, account.phone).catch(err => {
      console.error(`❌ [${accountId}/${requestId}] Failed to create connection during QR regeneration:`, err.message, err.stack?.substring(0, 300));
      // Clear regenerating flag on error
      const acc = connections.get(accountId);
      if (acc) {
        acc.regeneratingQr = false;
      }
      // Also clear in Firestore
      if (firestoreAvailable && db) {
        db.collection('accounts').doc(accountId).update({
          regeneratingQr: false,
          lastError: `Connection creation failed: ${err.message}`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(e => console.error(`Failed to clear regenerating flag:`, e.message));
      }
      });
    } catch (syncError) {
      // CRITICAL FIX: Catch synchronous errors (e.g., validation, null checks)
      // These occur before async, so .catch() on the promise doesn't help
      console.error(`❌ [${accountId}/${requestId}] Sync error in regenerateQr (createConnection):`, syncError.message, syncError.stack?.substring(0, 300));
      
      // Release connection registry lock on sync error
      connectionRegistry.release(accountId);
      
      // Clear regenerating flag on sync error
      const acc = connections.get(accountId);
      if (acc) {
        acc.regeneratingQr = false;
      }
      if (firestoreAvailable && db) {
        db.collection('accounts').doc(accountId).update({
          regeneratingQr: false,
          lastError: `Sync error: ${syncError.message}`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(e => console.error(`Failed to clear regenerating flag:`, e.message));
      }
      
      return res.status(500).json({
        success: false,
        error: 'sync_error',
        message: syncError.message || 'Internal server error (sync)',
        accountId: accountId,
        requestId: requestId,
        hint: `Check Railway logs for requestId: ${requestId}`,
      });
    }

    console.log(`✅ [${accountId}/${requestId}] QR regeneration started (connection creation in progress)`);

    res.json({ 
      success: true, 
      message: 'QR regeneration started',
      status: 'in_progress',
      instanceId: instanceId,
      waMode: isActiveMode ? 'active' : 'passive',
      accountId: accountId,
      requestId: requestId,
    });
  } catch (error) {
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
    console.error(`❌ [${requestId}] Regenerate QR error:`, error.message, error.stack?.substring(0, 300));
    
    // NEVER throw unhandled exceptions - always respond with JSON
    res.status(500).json({ 
      success: false, 
      error: 'internal_error',
      message: error.message || 'Internal server error',
      accountId: accountId,
      requestId: requestId,
      hint: `Check Railway logs for requestId: ${requestId}`,
    });
  }
});

// Backfill messages for an account (admin endpoint)
app.post('/api/whatsapp/backfill/:accountId', accountLimiter, async (req, res) => {
  // HARD GATE: PASSIVE mode - do NOT process backfill (mutates state)
  const passiveGuard = await checkPassiveModeGuard(req, res);
  if (passiveGuard) return; // Response already sent
  
  try {
    const { accountId } = req.params;
    const account = connections.get(accountId);

    if (!account) {
      return res.status(404).json({ 
        success: false, 
        error: 'account_not_found',
        message: 'Account not found',
        accountId: accountId,
      });
    }

    if (account.status !== 'connected') {
      return res.status(409).json({
        success: false,
        error: 'invalid_state',
        message: 'Account must be connected to backfill messages',
        currentStatus: account.status,
        accountId: accountId,
      });
    }

    // Trigger backfill (async, don't wait for completion)
    backfillAccountMessages(accountId)
      .then(result => {
        console.log(`✅ [${accountId}] Backfill completed:`, result);
      })
      .catch(error => {
        console.error(`❌ [${accountId}] Backfill failed:`, error.message);
      });

    res.json({
      success: true,
      message: 'Backfill started (runs asynchronously)',
      accountId,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send message
app.post('/api/whatsapp/send-message', messageLimiter, async (req, res) => {
  // HARD GATE: PASSIVE mode - do NOT process outbox (messages queued but not sent immediately)
  const passiveGuard = await checkPassiveModeGuard(req, res);
  if (passiveGuard) return; // Response already sent
  // Note: Messages can still be queued (outbox), but worker won't process them in PASSIVE mode
  if (!waBootstrap.canProcessOutbox()) {
    // Queue message but return 503 to indicate immediate sending unavailable
    const { accountId, to, message } = req.body;
    if (firestoreAvailable && db) {
      try {
        const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        const threadId = `${accountId}__${jid}`;
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const outboxData = {
          accountId,
          toJid: jid,
          threadId,
          payload: { text: message },
          body: message,
          status: 'queued',
          attemptCount: 0,
          nextAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await db.collection('outbox').doc(messageId).set(outboxData);
        return res.status(503).json({
          success: true,
          message: 'Message queued (will be sent when ACTIVE mode)',
          messageId,
          queued: true,
          mode: 'passive',
        });
      } catch (error) {
        return res.status(503).json({
          success: false,
          error: `PASSIVE mode: ${error.message}`,
          mode: 'passive',
        });
      }
    }
    return res.status(503).json({
      success: false,
      error: 'PASSIVE mode: another instance holds lock; retry shortly',
      mode: 'passive',
    });
  }

  try {
    const { accountId, to, message } = req.body;
    const account = connections.get(accountId);

    if (!account) {
      return res.status(404).json({ 
        success: false, 
        error: 'account_not_found',
        message: 'Account not found',
        accountId: accountId,
      });
    }

    const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    const threadId = `${accountId}__${jid}`;
    const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (account.status !== 'connected') {
      // Queue message in Firestore outbox
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const outboxData = {
        accountId,
        toJid: jid,
        threadId,
        payload: { text: message },
        body: message,
        status: 'queued',
        attemptCount: 0,
        nextAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      await db.collection('outbox').doc(messageId).set(outboxData);

      // Also create message doc in thread with status=queued (will be updated when sent)
      if (firestoreAvailable && db) {
        const threadMessageRef = db.collection('threads').doc(threadId).collection('messages').doc(clientMessageId);
        await threadMessageRef.set({
          accountId,
          clientJid: jid,
          direction: 'outbound',
          body: message,
          status: 'queued',
          tsClient: new Date().toISOString(),
          tsServer: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          messageType: 'text',
        }, { merge: true });

        // Update thread
        await db.collection('threads').doc(threadId).set({
          accountId,
          clientJid: jid,
          lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
          lastMessagePreview: message.substring(0, 100),
        }, { merge: true });
      }

      return res.json({ success: true, queued: true, messageId, clientMessageId });
    }

    // Account is connected: send immediately and persist
    let result;
    try {
      result = await account.sock.sendMessage(jid, { text: message });
    } catch (sendError) {
      // If send fails, queue it instead
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.collection('outbox').doc(messageId).set({
        accountId,
        toJid: jid,
        threadId,
        payload: { text: message },
        body: message,
        status: 'queued',
        attemptCount: 0,
        nextAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw sendError; // Re-throw to return error to client
    }

    // Persist sent message to Firestore thread
    if (firestoreAvailable && db && result?.key) {
      const waMessageId = result.key.id;
      const messageRef = db.collection('threads').doc(threadId).collection('messages').doc(waMessageId);
      
      await messageRef.set({
        accountId,
        clientJid: jid,
        direction: 'outbound',
        body: message,
        waMessageId,
        status: 'sent',
        tsClient: new Date().toISOString(),
        tsServer: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        messageType: 'text',
      }, { merge: true });

      // Update thread
      await db.collection('threads').doc(threadId).set({
        accountId,
        clientJid: jid,
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessagePreview: message.substring(0, 100),
      }, { merge: true });
    }

    res.json({ success: true, messageId: result.key.id, status: 'sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get messages
// Get threads for an account
app.get('/api/whatsapp/threads/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 50, orderBy = 'lastMessageAt' } = req.query;

    if (!firestoreAvailable || !db) {
      return res.status(503).json({ success: false, error: 'Firestore not available' });
    }

    let query = db.collection('threads').where('accountId', '==', accountId);

    // Order by lastMessageAt desc (most recent first)
    if (orderBy === 'lastMessageAt') {
      query = query.orderBy('lastMessageAt', 'desc');
    }

    const threadsSnapshot = await query.limit(parseInt(limit)).get();
    const threads = [];
    const migrationPromises = [];

    // Get account phone number to exclude self-conversation
    let accountPhone = null;
    const account = connections.get(accountId);
    if (account && account.phone) {
      accountPhone = account.phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      console.log(`📋 [${accountId}] Inbox filter: Found phone in memory: ${accountPhone}`);
    } else if (firestoreAvailable && db) {
      // Try to get from Firestore if not in memory
      try {
        const accountDoc = await db.collection('accounts').doc(accountId).get();
        if (accountDoc.exists) {
          const accountData = accountDoc.data();
          if (accountData.phone) {
            accountPhone = accountData.phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            console.log(`📋 [${accountId}] Inbox filter: Found phone in Firestore: ${accountPhone}`);
          }
        }
      } catch (err) {
        console.log(`⚠️  [${accountId}] Inbox filter: Could not get phone from Firestore: ${err.message}`);
      }
    }
    
    if (!accountPhone) {
      console.log(`⚠️  [${accountId}] Inbox filter: No phone number found, will not filter self-conversation`);
    }

    for (const doc of threadsSnapshot.docs) {
      const threadId = doc.id;
      const threadData = doc.data();
      
      // Skip self-conversation (conversation with own phone number)
      if (accountPhone && threadData.clientJid === accountPhone) {
        console.log(`📋 [${accountId}] Inbox filter: Skipping self-conversation ${threadData.clientJid}`);
        continue; // Skip this thread
      }
      
      // Check if thread uses old format (doesn't start with accountId__)
      if (!threadId.startsWith(`${accountId}__`) && threadData.clientJid) {
        // Old format detected - migrate to new format
        const newThreadId = `${accountId}__${threadData.clientJid}`;
        console.log(`🔄 [${accountId}] Migrating thread from old format: ${threadId} → ${newThreadId}`);
        
        // Migrate messages from old thread to new thread
        const migrationPromise = (async () => {
          try {
            const oldMessagesRef = db.collection('threads').doc(threadId).collection('messages');
            const oldMessagesSnapshot = await oldMessagesRef.get();
            
            if (!oldMessagesSnapshot.empty) {
              const batch = db.batch();
              let batchOps = 0;
              
              for (const msgDoc of oldMessagesSnapshot.docs) {
                const newMsgRef = db.collection('threads').doc(newThreadId).collection('messages').doc(msgDoc.id);
                batch.set(newMsgRef, msgDoc.data(), { merge: true });
                batchOps++;
                
                // Firestore batch limit is 500
                if (batchOps >= 500) {
                  await batch.commit();
                  batchOps = 0;
                }
              }
              
              if (batchOps > 0) {
                await batch.commit();
              }
              
              // Update new thread with data from old thread
              await db.collection('threads').doc(newThreadId).set(threadData, { merge: true });
              
              // Delete old thread (messages already migrated)
              await db.collection('threads').doc(threadId).delete();
              
              console.log(`✅ [${accountId}] Thread migrated: ${oldMessagesSnapshot.size} messages moved`);
            } else {
              // No messages, just update thread ID
              await db.collection('threads').doc(newThreadId).set(threadData, { merge: true });
              await db.collection('threads').doc(threadId).delete();
              console.log(`✅ [${accountId}] Thread migrated (no messages)`);
            }
          } catch (migError) {
            console.error(`❌ [${accountId}] Thread migration failed for ${threadId}:`, migError.message);
          }
        })();
        
        migrationPromises.push(migrationPromise);
        
        // Add new thread to response (will be populated after migration)
        threads.push({
          id: newThreadId,
          ...threadData,
        });
      } else {
        // Already using new format
        threads.push({
          id: threadId,
          ...threadData,
        });
      }
    }

    // Wait for migrations to complete (but don't block response)
    if (migrationPromises.length > 0) {
      Promise.all(migrationPromises).catch(err => {
        console.error(`❌ [${accountId}] Some thread migrations failed:`, err.message);
      });
    }

    res.json({ success: true, threads, count: threads.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get unified inbox - all messages from all threads in chronological order
app.get('/api/whatsapp/inbox/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 100 } = req.query;

    if (!firestoreAvailable || !db) {
      return res.status(503).json({ success: false, error: 'Firestore not available' });
    }

    // Get account phone number to exclude self-conversation
    let accountPhone = null;
    const account = connections.get(accountId);
    if (account && account.phone) {
      accountPhone = account.phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    } else if (firestoreAvailable && db) {
      try {
        const accountDoc = await db.collection('accounts').doc(accountId).get();
        if (accountDoc.exists) {
          const accountData = accountDoc.data();
          if (accountData.phone) {
            accountPhone = accountData.phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          }
        }
      } catch (err) {
        // Ignore
      }
    }

    // Get all threads for this account (excluding self-conversation)
    let threadsQuery = db.collection('threads').where('accountId', '==', accountId);
    const threadsSnapshot = await threadsQuery.get();

    // Collect all messages from all threads
    const allMessages = [];

    for (const threadDoc of threadsSnapshot.docs) {
      const threadId = threadDoc.id;
      const threadData = threadDoc.data();

      // Skip self-conversation
      if (accountPhone && threadData.clientJid === accountPhone) {
        continue;
      }

      // Get messages from this thread
      try {
        const messagesSnapshot = await db
          .collection('threads')
          .doc(threadId)
          .collection('messages')
          .orderBy('tsServer', 'desc')
          .limit(parseInt(limit))
          .get();

        messagesSnapshot.forEach(msgDoc => {
          const msgData = msgDoc.data();
          allMessages.push({
            messageId: msgDoc.id,
            threadId: threadId,
            clientJid: threadData.clientJid,
            displayName: threadData.displayName || threadData.clientJid.split('@')[0],
            contactType: threadData.clientJid.includes('@g.us') ? 'group' : 
                        threadData.clientJid.includes('@lid') ? 'linked_device' : 'phone',
            ...msgData,
          });
        });
      } catch (err) {
        console.error(`❌ [${accountId}] Error fetching messages from thread ${threadId}:`, err.message);
      }
    }

    // Sort all messages by timestamp (most recent first)
    allMessages.sort((a, b) => {
      const timeA = a.tsServer?._seconds || a.createdAt?._seconds || 0;
      const timeB = b.tsServer?._seconds || b.createdAt?._seconds || 0;
      return timeB - timeA; // Descending (newest first)
    });

    // Limit to requested number
    const limitedMessages = allMessages.slice(0, parseInt(limit));

    res.json({ 
      success: true, 
      messages: limitedMessages,
      count: limitedMessages.length,
      totalMessages: allMessages.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get messages for a specific thread
app.get('/api/whatsapp/messages/:accountId/:threadId', async (req, res) => {
  try {
    const { accountId, threadId } = req.params;
    const { limit = 50, orderBy = 'createdAt' } = req.query;

    if (!firestoreAvailable || !db) {
      return res.status(503).json({ success: false, error: 'Firestore not available' });
    }

    // Verify thread belongs to accountId
    const threadDoc = await db.collection('threads').doc(threadId).get();
    if (!threadDoc.exists) {
      return res.status(404).json({ success: false, error: 'Thread not found' });
    }

    const threadData = threadDoc.data();
    if (threadData.accountId !== accountId) {
      return res.status(403).json({ success: false, error: 'Thread does not belong to account' });
    }

    // Get messages
    let messagesQuery = db
      .collection('threads')
      .doc(threadId)
      .collection('messages');

    if (orderBy === 'createdAt' || orderBy === 'tsClient') {
      messagesQuery = messagesQuery.orderBy('tsClient', 'desc');
    } else {
      messagesQuery = messagesQuery.orderBy('createdAt', 'desc');
    }

    const messagesSnapshot = await messagesQuery.limit(parseInt(limit)).get();
    const messages = messagesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      thread: {
        id: threadId,
        ...threadData,
      },
      messages,
      count: messages.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get messages (legacy endpoint - supports old query format)
app.get('/api/whatsapp/messages', async (req, res) => {
  try {
    const { accountId, threadId, limit = 50 } = req.query;

    if (!firestoreAvailable || !db) {
      return res.status(503).json({ success: false, error: 'Firestore not available' });
    }

    // If threadId is provided, use new endpoint format
    if (threadId && accountId) {
      const threadDoc = await db.collection('threads').doc(threadId).get();
      if (!threadDoc.exists) {
        return res.json({ success: true, threads: [], messages: [] });
      }

      const messagesSnapshot = await db
        .collection('threads')
        .doc(threadId)
        .collection('messages')
        .orderBy('tsClient', 'desc')
        .limit(parseInt(limit))
        .get();

      const messages = messagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      return res.json({
        success: true,
        thread: { id: threadId, ...threadDoc.data() },
        messages,
      });
    }

    // Legacy: return threads with messages nested
    let query = db.collection('threads');

    if (accountId) {
      query = query.where('accountId', '==', accountId);
    }

    const threadsSnapshot = await query.orderBy('lastMessageAt', 'desc').limit(parseInt(limit)).get();
    const threads = [];

    for (const threadDoc of threadsSnapshot.docs) {
      const threadData = threadDoc.data();
      const messagesSnapshot = await threadDoc.ref
        .collection('messages')
        .orderBy('tsClient', 'desc')
        .limit(10)
        .get();

      const messages = messagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      threads.push({
        id: threadDoc.id,
        ...threadData,
        messages,
      });
    }

    res.json({ success: true, threads });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete account
app.delete('/api/whatsapp/accounts/:id', accountLimiter, async (req, res) => {
  const accountId = req.params?.id;
  if (!accountId) {
    return res.status(400).json({ success: false, error: 'Account ID is required' });
  }

  try {
    console.log(`🗑️  [DELETE] Attempting to delete account: ${accountId}`);
    const account = connections.get(accountId);

    // Check if account exists in memory OR Firestore
    let accountExists = !!account;
    let accountInFirestore = false;
    let accountStatus = null;

    console.log(`🔍 [DELETE ${accountId}] Account in memory: ${accountExists}, status: ${account?.status || 'N/A'}`);

    // If not in memory, check Firestore
    if (!account && firestoreAvailable && db) {
      try {
        const accountDoc = await db.collection('accounts').doc(accountId).get();
        accountInFirestore = accountDoc.exists;
        if (accountInFirestore) {
          const data = accountDoc.data();
          accountStatus = data.status;
          console.log(`🔍 [DELETE ${accountId}] Account in Firestore: true, status: ${accountStatus}`);
          
          // Don't delete if already deleted
          if (data.status === 'deleted') {
            console.log(`⚠️  [DELETE ${accountId}] Account already deleted, skipping`);
            return res.status(404).json({ 
              success: false, 
              error: 'Account already deleted',
              accountId: accountId,
            });
          }
        } else {
          console.log(`🔍 [DELETE ${accountId}] Account not found in Firestore`);
        }
      } catch (error) {
        console.error(`❌ [DELETE ${accountId}] Error checking Firestore:`, error.message);
        console.error(`❌ [DELETE ${accountId}] Stack:`, error.stack?.substring(0, 200));
      }
    } else if (account) {
      accountStatus = account.status;
      console.log(`🔍 [DELETE ${accountId}] Account status from memory: ${accountStatus}`);
    }

    if (!accountExists && !accountInFirestore) {
      console.log(`❌ [DELETE ${accountId}] Account not found in memory or Firestore`);
      return res.status(404).json({ 
        success: false, 
        error: 'Account not found',
        accountId: accountId,
      });
    }

    // CRITICAL: Allow deletion in PASSIVE mode ONLY if:
    // 1. Account exists only in Firestore (not in memory)
    // 2. Account status is 'disconnected' or 'needs_qr' (doesn't require Baileys)
    // 3. Account is not 'connected' or 'qr_ready' (would require Baileys)
    const isFirestoreOnly = !accountExists && accountInFirestore;
    const isSafeToDeleteInPassive = isFirestoreOnly && 
      (accountStatus === 'disconnected' || accountStatus === 'needs_qr' || accountStatus === 'deleted');

    // If account exists in memory OR is connected/qr_ready, require ACTIVE mode
    if (accountExists || (!isSafeToDeleteInPassive && accountStatus !== 'disconnected' && accountStatus !== 'needs_qr')) {
      const passiveGuard = await checkPassiveModeGuard(req, res);
      if (passiveGuard) return; // Response already sent
    } else if (!isSafeToDeleteInPassive && !accountExists) {
      // Account only in Firestore but status requires Baileys - still need ACTIVE mode
      const passiveGuard = await checkPassiveModeGuard(req, res);
      if (passiveGuard) return; // Response already sent
    }
    // Otherwise, safe to delete in PASSIVE mode (Firestore-only, disconnected/needs_qr)

    // Close connection if exists in memory
    if (account) {
      console.log(`🔌 [DELETE ${accountId}] Closing socket connection...`);
      if (account.sock) {
        try {
          account.sock.end();
          console.log(`✅ [DELETE ${accountId}] Socket closed`);
        } catch (e) {
          console.error(`⚠️  [DELETE ${accountId}] Error closing socket:`, e.message);
        }
      }

      connections.delete(accountId);
      reconnectAttempts.delete(accountId);
      connectionRegistry.release(accountId);
      console.log(`✅ [DELETE ${accountId}] Removed from memory`);
    }

    // Delete from Firestore (mark as deleted)
    if (firestoreAvailable && db) {
      try {
        console.log(`💾 [DELETE ${accountId}] Updating Firestore status to 'deleted'...`);
        
        // Use set with merge instead of update to handle case where document doesn't exist
        // This prevents "Document not found" errors
        await db.collection('accounts').doc(accountId).set({
          status: 'deleted',
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          accountId: accountId, // Ensure accountId is set
        }, { merge: true });
        
        console.log(`✅ [DELETE ${accountId}] Account marked as deleted in Firestore (status was: ${accountStatus || 'unknown'})`);
      } catch (error) {
        console.error(`❌ [DELETE ${accountId}] Error deleting from Firestore:`, error.message);
        console.error(`❌ [DELETE ${accountId}] Error code:`, error.code);
        console.error(`❌ [DELETE ${accountId}] Stack:`, error.stack?.substring(0, 300));
        // Continue even if Firestore update fails - account might not exist in Firestore
      }
    }

    // Invalidate cache
    if (featureFlags.isEnabled('API_CACHING')) {
      try {
        await cache.delete('whatsapp:accounts');
        console.log(`🗑️  [DELETE ${accountId}] Cache invalidated`);
      } catch (cacheError) {
        console.error(`⚠️  [DELETE ${accountId}] Cache invalidation failed:`, cacheError.message);
      }
    }

    console.log(`✅ [DELETE ${accountId}] Account deletion completed successfully`);
    res.json({ 
      success: true, 
      message: 'Account deleted',
      accountId: accountId,
      deletedFromMemory: accountExists,
      deletedFromFirestore: accountInFirestore,
      status: accountStatus,
    });
  } catch (error) {
    console.error(`❌ [DELETE ${accountId || 'unknown'}] Delete account error:`, error.message);
    console.error(`❌ [DELETE ${accountId || 'unknown'}] Error code:`, error.code);
    console.error(`❌ [DELETE ${accountId || 'unknown'}] Stack:`, error.stack?.substring(0, 500));
    res.status(500).json({ 
      success: false, 
      error: error.message,
      accountId: accountId || 'unknown',
    });
  }
});

// Reset account session (wipe auth and set to needs_qr)
app.post('/api/whatsapp/accounts/:id/reset', accountLimiter, async (req, res) => {
  // HARD GATE: PASSIVE mode - do NOT mutate account state
  const passiveGuard = await checkPassiveModeGuard(req, res);
  if (passiveGuard) return; // Response already sent
  
  try {
    const { id } = req.params;
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
    
    console.log(`🔄 [${id}/${requestId}] Reset request received`);

    // Get account (from memory or Firestore)
    let account = connections.get(id);
    const accountExists = !!account;
    const accountInMemory = accountExists;
    
    // If not in memory, check Firestore
    if (!account && firestoreAvailable && db) {
      try {
        const accountDoc = await db.collection('accounts').doc(id).get();
        if (accountDoc.exists) {
          const data = accountDoc.data();
          account = { id, ...data };
        }
      } catch (error) {
        console.error(`⚠️  [${id}/${requestId}] Failed to load from Firestore:`, error.message);
      }
    }

    if (!account) {
      console.log(`❌ [${id}/${requestId}] Account not found`);
      return res.status(404).json({ 
        success: false, 
        error: 'account_not_found',
        message: 'Account not found',
        accountId: id,
        requestId: requestId,
      });
    }

    // Clear connectingTimeout if exists
    if (account.connectingTimeout) {
      clearTimeout(account.connectingTimeout);
      account.connectingTimeout = null;
      console.log(`⏱️  [${id}/${requestId}] Cleared connectingTimeout`);
    }

    // Close socket if exists
    if (account.sock) {
      try {
        account.sock.end();
        console.log(`🔌 [${id}/${requestId}] Socket closed`);
      } catch (e) {
        // Ignore
      }
    }

    // Clear session directory on disk
    try {
      await clearAccountSession(id);
      console.log(`🗑️  [${id}/${requestId}] Session directory deleted`);
    } catch (error) {
      console.error(`⚠️  [${id}/${requestId}] Failed to clear session:`, error.message);
      // Continue anyway
    }

    // Clean up in-memory state
    if (connections.has(id)) {
      connections.delete(id);
    }
    reconnectAttempts.delete(id);
    connectionRegistry.release(id);

    // Update Firestore: set status to needs_qr
    await saveAccountToFirestore(id, {
      status: 'needs_qr',
      lastError: 'Session reset by user - requires QR re-pair',
      requiresQR: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      nextRetryAt: null,
      retryCount: 0,
    });

    console.log(`✅ [${id}/${requestId}] Reset complete: status=needs_qr, session cleared`);

    res.json({
      success: true,
      message: 'Session reset successfully. Use regenerate QR to pair again.',
      accountId: id,
      status: 'needs_qr',
      requestId: requestId,
    });
  } catch (error) {
    console.error(`❌ [${req.params.id}] Reset error:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      requestId: req.headers['x-request-id'] || `req_${Date.now()}`,
    });
  }
});

// ============================================
// ADMIN ENDPOINTS (Protected with ADMIN_TOKEN)
// ============================================

// POST /api/admin/account/:id/disconnect
// Public disconnect endpoint for UI
app.post('/api/whatsapp/disconnect/:id', accountLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const account = connections.get(id);

    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    const tsDisconnect = Date.now();

    // Close socket
    if (account.sock) {
      account.sock.end();
      console.log(`🔌 [${id}] Socket closed by user request`);
    }

    // Update status in memory
    account.status = 'disconnected';

    // Update status in Firestore
    if (firestoreAvailable) {
      await db.collection('accounts').doc(id).update({
        status: 'disconnected',
        disconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`💾 [${id}] Status updated to disconnected in Firestore`);
    }

    // Remove from connections (will not auto-restore until manually reconnected)
    connections.delete(id);

    console.log(`🔌 [${id}] Account disconnected by user`);

    res.json({
      success: true,
      accountId: id,
      tsDisconnect,
      reason: 'user_disconnect',
    });
  } catch (error) {
    console.error(`❌ Disconnect error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/account/:id/disconnect', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const account = connections.get(id);

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const tsDisconnect = Date.now();

    // Close socket (recoverable disconnect)
    if (account.sock) {
      account.sock.end();
    }

    console.log(`🔌 [ADMIN] Disconnected account ${id}`);

    res.json({
      success: true,
      accountId: id,
      tsDisconnect,
      reason: 'admin_disconnect',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/account/:id/reconnect
app.post('/api/admin/account/:id/reconnect', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const account = connections.get(id);

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const tsStart = Date.now();

    // Trigger reconnect
    console.log(`🔄 [ADMIN] Reconnecting account ${id}`);

    // Wait for connection (max 60s)
    const maxWait = 60000;
    const checkInterval = 1000;
    let elapsed = 0;

    while (elapsed < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;

      const currentAccount = connections.get(id);
      if (currentAccount && currentAccount.status === 'connected') {
        const tsConnected = Date.now();
        const mttrMs = tsConnected - tsStart;

        console.log(`✅ [ADMIN] Account ${id} reconnected in ${mttrMs}ms`);

        return res.json({
          success: true,
          accountId: id,
          tsConnected,
          mttrMs,
        });
      }
    }

    res.status(408).json({ error: 'Reconnect timeout after 60s' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/tests/mttr
app.post('/api/admin/tests/mttr', requireAdmin, async (req, res) => {
  try {
    const { accountId, n = 10 } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId required' });
    }

    const account = connections.get(accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const runId = `mttr_${Date.now()}`;
    const dataset = [];

    console.log(`📊 [ADMIN] Starting MTTR benchmark: runId=${runId}, n=${n}`);

    // Run N disconnect/reconnect cycles
    for (let i = 0; i < n; i++) {
      console.log(`[${i + 1}/${n}] Disconnect...`);

      // Disconnect
      if (account.sock) {
        account.sock.end();
      }

      // Wait for disconnect
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Measure reconnect time
      const tsStart = Date.now();

      // Wait for reconnect (max 60s)
      let reconnected = false;
      for (let wait = 0; wait < 60000; wait += 1000) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const currentAccount = connections.get(accountId);
        if (currentAccount && currentAccount.status === 'connected') {
          const mttrMs = Date.now() - tsStart;
          dataset.push(mttrMs / 1000); // Convert to seconds
          console.log(`✅ [${i + 1}/${n}] Reconnected in ${mttrMs}ms`);
          reconnected = true;
          break;
        }
      }

      if (!reconnected) {
        console.error(`❌ [${i + 1}/${n}] Reconnect timeout`);
        dataset.push(60); // Timeout value
      }
    }

    // Calculate percentiles
    const sorted = dataset.slice().sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    const result = {
      runId,
      accountId,
      n,
      dataset,
      p50,
      p90,
      p95,
      verdict: p95 <= 60 ? 'PASS' : 'FAIL',
      timestamp: new Date().toISOString(),
    };

    // Save to Firestore
    await db
      .collection('prod_tests')
      .doc(runId)
      .set({
        type: 'mttr',
        ...result,
      });

    console.log(`✅ [ADMIN] MTTR benchmark complete: ${result.verdict}`);

    res.json(result);
  } catch (error) {
    console.error('❌ [ADMIN] MTTR test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/tests/queue
app.post('/api/admin/tests/queue', requireAdmin, async (req, res) => {
  try {
    const { accountId, to } = req.query;

    if (!accountId || !to) {
      return res.status(400).json({ error: 'accountId and to required' });
    }

    const runId = `queue_${Date.now()}`;
    console.log(`📤 [ADMIN] Starting queue test: runId=${runId}`);

    // Force offline
    const account = connections.get(accountId);
    if (account && account.sock) {
      account.sock.end();
    }

    // Wait for offline
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Send 3 messages while offline
    const messageIds = [];
    for (let i = 1; i <= 3; i++) {
      const msgId = `msg_${Date.now()}_${i}`;
      const message = `Queue test ${i} - ${runId}`;

      // Save to Firestore as queued
      await db.collection('messages').doc(msgId).set({
        accountId,
        to,
        body: message,
        status: 'queued',
        type: 'outbound',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        runId,
      });

      messageIds.push(msgId);
      console.log(`📝 [${i}/3] Message queued: ${msgId}`);
    }

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Reconnect
    console.log(`🔄 Reconnecting...`);

    // Wait for reconnect (max 60s)
    let reconnected = false;
    for (let wait = 0; wait < 60000; wait += 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const currentAccount = connections.get(accountId);
      if (currentAccount && currentAccount.status === 'connected') {
        reconnected = true;
        console.log(`✅ Reconnected`);
        break;
      }
    }

    if (!reconnected) {
      return res.status(408).json({ error: 'Reconnect timeout' });
    }

    // Check message statuses after reconnect
    await new Promise(resolve => setTimeout(resolve, 5000));

    const statusTransitions = [];
    for (const msgId of messageIds) {
      const doc = await db.collection('messages').doc(msgId).get();
      if (doc.exists) {
        const data = doc.data();
        statusTransitions.push({
          msgId,
          status: data.status,
          updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
        });
      }
    }

    const result = {
      runId,
      accountId,
      to,
      messageIds,
      statusTransitions,
      verdict: statusTransitions.every(t => t.status === 'sent' || t.status === 'delivered')
        ? 'PASS'
        : 'PARTIAL',
      timestamp: new Date().toISOString(),
    };

    // Save to Firestore
    await db
      .collection('prod_tests')
      .doc(runId)
      .set({
        type: 'queue',
        ...result,
      });

    console.log(`✅ [ADMIN] Queue test complete: ${result.verdict}`);

    res.json(result);
  } catch (error) {
    console.error('❌ [ADMIN] Queue test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/tests/soak/start
app.post('/api/admin/tests/soak/start', requireAdmin, async (req, res) => {
  try {
    const { hours = 2, accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId required' });
    }

    const runId = `soak_${Date.now()}`;
    const durationMs = hours * 60 * 60 * 1000;
    const startTime = Date.now();

    console.log(`⏱️  [ADMIN] Starting soak test: runId=${runId}, duration=${hours}h`);

    // Initialize test run
    testRuns.set(runId, {
      type: 'soak',
      accountId,
      startTime,
      durationMs,
      heartbeats: 0,
      failures: 0,
      status: 'running',
    });

    // Save initial state to Firestore
    await db
      .collection('prod_tests')
      .doc(runId)
      .set({
        type: 'soak',
        accountId,
        hours,
        startTime: new Date(startTime).toISOString(),
        status: 'running',
      });

    // Start background heartbeat (every 60s)
    const interval = setInterval(async () => {
      const run = testRuns.get(runId);
      if (!run) {
        clearInterval(interval);
        return;
      }

      const elapsed = Date.now() - run.startTime;

      if (elapsed >= run.durationMs) {
        // Test complete
        clearInterval(interval);

        const uptime = (((run.heartbeats - run.failures) / run.heartbeats) * 100).toFixed(2);
        const verdict = uptime >= 99 && run.failures === 0 ? 'PASS' : 'FAIL';

        run.status = 'complete';
        run.uptime = uptime;
        run.verdict = verdict;

        // Save summary to Firestore
        await db
          .collection('prod_tests')
          .doc(runId)
          .update({
            status: 'complete',
            endTime: new Date().toISOString(),
            heartbeats: run.heartbeats,
            failures: run.failures,
            uptime: parseFloat(uptime),
            verdict,
          });

        console.log(`✅ [ADMIN] Soak test complete: ${verdict}, uptime=${uptime}%`);
        return;
      }

      // Heartbeat
      try {
        const account = connections.get(accountId);
        const isHealthy = account && account.status === 'connected';

        run.heartbeats++;
        if (!isHealthy) {
          run.failures++;
        }

        // Save heartbeat to Firestore
        await db
          .collection('prod_tests')
          .doc(runId)
          .collection('heartbeats')
          .add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            heartbeat: run.heartbeats,
            accountStatus: account ? account.status : 'not_found',
            healthy: isHealthy,
          });

        const elapsedMin = Math.floor(elapsed / 1000 / 60);
        console.log(
          `💓 [${runId}] Heartbeat ${run.heartbeats} at ${elapsedMin}min: ${isHealthy ? '✅' : '❌'}`
        );
      } catch (error) {
        run.failures++;
        console.error(`❌ [${runId}] Heartbeat failed:`, error.message);
      }
    }, 60000); // Every 60 seconds

    res.json({
      success: true,
      runId,
      accountId,
      hours,
      startTime: new Date(startTime).toISOString(),
      message: `Soak test started. Check status at /api/admin/tests/soak/status?runId=${runId}`,
    });
  } catch (error) {
    console.error('❌ [ADMIN] Soak test start error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/tests/soak/status
app.get('/api/admin/tests/soak/status', requireAdmin, async (req, res) => {
  try {
    const { runId } = req.query;

    if (!runId) {
      return res.status(400).json({ error: 'runId required' });
    }

    const run = testRuns.get(runId);
    if (!run) {
      return res.status(404).json({ error: 'Test run not found' });
    }

    const elapsed = Date.now() - run.startTime;
    const progress = ((elapsed / run.durationMs) * 100).toFixed(2);
    const uptime =
      run.heartbeats > 0
        ? (((run.heartbeats - run.failures) / run.heartbeats) * 100).toFixed(2)
        : 0;

    res.json({
      runId,
      status: run.status,
      progress: parseFloat(progress),
      elapsed: Math.floor(elapsed / 1000),
      heartbeats: run.heartbeats,
      failures: run.failures,
      uptime: parseFloat(uptime),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/tests/report
app.get('/api/admin/tests/report', requireAdmin, async (req, res) => {
  try {
    const { runId } = req.query;

    if (!runId) {
      return res.status(400).json({ error: 'runId required' });
    }

    const doc = await db.collection('prod_tests').doc(runId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Test run not found' });
    }

    const data = doc.data();

    res.json({
      runId,
      type: data.type,
      verdict: data.verdict,
      data,
      firestoreDoc: `prod_tests/${runId}`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restore accounts from Firestore on cold start
// Restore single account (used for auto-recovery)
async function restoreSingleAccount(accountId) {
  if (!firestoreAvailable) {
    console.log(`⚠️  [${accountId}] Firestore not available`);
    return;
  }

  try {
    const doc = await db.collection('accounts').doc(accountId).get();

    if (!doc.exists) {
      console.log(`⚠️  [${accountId}] Account not found in Firestore`);
      return;
    }

    const data = doc.data();

    // CRITICAL FIX: Restore accounts in pairing phase (qr_ready, connecting, awaiting_scan) + connected
    // Previously only restored 'connected' accounts, causing accounts to disappear after restart
    const restorableStatuses = ['qr_ready', 'connecting', 'awaiting_scan', 'connected'];
    if (!restorableStatuses.includes(data.status)) {
      console.log(`⚠️  [${accountId}] Account status is ${data.status}, skipping restore (not in restorable statuses: ${restorableStatuses.join(', ')})`);
      return;
    }

    await restoreAccount(accountId, data);
  } catch (error) {
    console.error(`❌ [${accountId}] Single restore failed:`, error.message);
  }
}

// Extract account restore logic
async function restoreAccount(accountId, data) {
  // HARD GATE: PASSIVE mode - do NOT restore Baileys connections
  if (!waBootstrap.canStartBaileys()) {
    console.log(`⏸️  [${accountId}] PASSIVE mode - cannot restore Baileys connection (lock not held)`);
    return;
  }

  const CONNECTING_TIMEOUT = parseInt(process.env.WHATSAPP_CONNECT_TIMEOUT_MS || '60000', 10);

  try {
    console.log(
      `BOOT [${accountId}] Starting restore... (status: ${data.status}, USE_FIRESTORE_BACKUP: ${USE_FIRESTORE_BACKUP})`
    );

    const sessionPath = path.join(authDir, accountId);

    // Try restore from Firestore if disk session missing
    if (!fs.existsSync(sessionPath) && USE_FIRESTORE_BACKUP && firestoreAvailable) {
      console.log(`BOOT [${accountId}] No disk session, attempting Firestore restore...`);

      const sessionDoc = await db.collection('wa_sessions').doc(accountId).get();
      if (sessionDoc.exists) {
        const sessionData = sessionDoc.data();

        if (sessionData.files) {
          fs.mkdirSync(sessionPath, { recursive: true });

          let restoredCount = 0;
          for (const [filename, content] of Object.entries(sessionData.files)) {
            fs.writeFileSync(path.join(sessionPath, filename), content, 'utf8');
            restoredCount++;
          }

          console.log(
            `FIRESTORE_SESSION_LOADED [${accountId}] Restored ${restoredCount} files from Firestore`
          );
        } else {
          console.log(`⚠️  [${accountId}] Session doc exists but no files, skipping`);
          return;
        }
      } else {
        console.log(`⚠️  [${accountId}] No session in Firestore, skipping`);
        return;
      }
    } else if (!fs.existsSync(sessionPath)) {
      console.log(
        `⚠️  [${accountId}] No disk session and Firestore restore not available (USE_FIRESTORE_BACKUP: ${USE_FIRESTORE_BACKUP}, firestoreAvailable: ${firestoreAvailable}), skipping`
      );
      return;
    }

    // Check disk session exists now
    if (!fs.existsSync(sessionPath)) {
      console.log(`⚠️  [${accountId}] No session available, skipping`);
      return;
    }

    // Load from disk
    let { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    // Wrap saveCreds for Firestore backup
    if (USE_FIRESTORE_BACKUP && firestoreAvailable) {
      const originalSaveCreds = saveCreds;
      saveCreds = async () => {
        await originalSaveCreds();

        try {
          const sessionFiles = fs.readdirSync(sessionPath);
          const sessionData = {};

          for (const file of sessionFiles) {
            const filePath = path.join(sessionPath, file);
            if (fs.statSync(filePath).isFile()) {
              sessionData[file] = fs.readFileSync(filePath, 'utf8');
            }
          }

          await db.collection('wa_sessions').doc(accountId).set({
            files: sessionData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            schemaVersion: 2,
          });
        } catch (error) {
          console.error(`❌ [${accountId}] Firestore backup failed:`, error.message);
        }
      };
    }

    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      browser: ['SuperParty', 'Chrome', '2.0.0'], // Browser metadata (not real browser)
      logger: pino({ level: 'warn' }),
      syncFullHistory: SYNC_FULL_HISTORY, // Sync full history on restore (configurable via WHATSAPP_SYNC_FULL_HISTORY)
      markOnlineOnConnect: true,
      getMessage: async key => {
        return undefined;
      },
    });

    const account = {
      id: accountId,
      name: data.name || accountId,
      phone: data.phoneE164 || data.phone,
      phoneNumber: data.phoneE164 || data.phone,
      sock,
      status: 'connecting',
      qrCode: null,
      pairingCode: null,
      createdAt: data.createdAt || new Date().toISOString(),
      lastUpdate: data.updatedAt || new Date().toISOString(),
    };

    // Set timeout to prevent "connecting forever" - CRITICAL FIX (configurable via env)
    // CRITICAL: Only apply timeout for normal connecting, NOT for pairing phase (qr_ready/awaiting_scan)
    const CONNECTING_TIMEOUT = parseInt(process.env.WHATSAPP_CONNECT_TIMEOUT_MS || '60000', 10);
    account.connectingTimeout = setTimeout(() => {
      const timeoutSeconds = Math.floor(CONNECTING_TIMEOUT / 1000);
      const acc = connections.get(accountId);
      
      // CRITICAL FIX: Don't timeout if status is pairing phase (qr_ready, awaiting_scan, pairing)
      // These states use QR_SCAN_TIMEOUT instead (10 minutes)
      const isPairingPhase = acc && ['qr_ready', 'awaiting_scan', 'pairing'].includes(acc.status);
      if (isPairingPhase) {
        console.log(`⏰ [${accountId}] Connecting timeout skipped (status: ${acc.status} - pairing phase uses QR_SCAN_TIMEOUT)`);
        return; // Don't timeout pairing phase
      }
      
      console.log(`⏰ [${accountId}] Connecting timeout (${timeoutSeconds}s), transitioning to disconnected`);
      if (acc && acc.status === 'connecting') {
        acc.status = 'disconnected';
        acc.lastError = `Connection timeout - no progress after ${timeoutSeconds}s`;
        saveAccountToFirestore(accountId, {
          status: 'disconnected',
          lastError: 'Connection timeout',
          lastErrorAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(err => console.error(`❌ [${accountId}] Timeout save failed:`, err));
      }
    }, CONNECTING_TIMEOUT);

    // Setup event handlers (FULL - same as createConnection)
    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect, qr } = update;

      updateConnectionHealth(accountId, 'connection');

      console.log(`🔔 [${accountId}] Connection update: ${connection || 'qr'}`);

      if (qr && typeof qr === 'string' && qr.length > 0) {
        console.log(`📱 [${accountId}] QR Code generated (length: ${qr.length})`);

        // CRITICAL: Clear connecting timeout when QR is generated (same as createConnection)
        // IMPORTANT: Get account from connections map (not closure variable) to ensure latest state
        const currentAccountRestore = connections.get(accountId);
        if (currentAccountRestore && currentAccountRestore.connectingTimeout) {
          clearTimeout(currentAccountRestore.connectingTimeout);
          currentAccountRestore.connectingTimeout = null;
          console.log(`⏰ [${accountId}] Connecting timeout cleared (QR generated, pairing phase)`);
        }

        // Set QR scan timeout (10 minutes) - same as createConnection
        const QR_SCAN_TIMEOUT_MS = 10 * 60 * 1000;
        if (currentAccountRestore) {
          currentAccountRestore.qrScanTimeout = setTimeout(() => {
          console.log(`⏰ [${accountId}] QR scan timeout (${QR_SCAN_TIMEOUT_MS / 1000}s) - QR expired`);
          const acc = connections.get(accountId);
          if (acc && acc.status === 'qr_ready') {
            acc.status = 'needs_qr';
            saveAccountToFirestore(accountId, {
              status: 'needs_qr',
              lastError: 'QR scan timeout - QR expired after 10 minutes',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }).catch(err => console.error(`❌ [${accountId}] QR timeout save failed:`, err));
          }
        }, QR_SCAN_TIMEOUT_MS);
        }

        try {
          const qrDataURL = await QRCode.toDataURL(qr);
          // IMPORTANT: Get account from connections map to ensure latest state
          const currentAccountRestoreSave = connections.get(accountId);
          if (currentAccountRestoreSave) {
            currentAccountRestoreSave.qrCode = qrDataURL;
            currentAccountRestoreSave.status = 'qr_ready';
            currentAccountRestoreSave.lastUpdate = new Date().toISOString();
          }

          await saveAccountToFirestore(accountId, {
            qrCode: qrDataURL,
            qrUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'qr_ready',
          });

          console.log(`✅ [${accountId}] QR saved to Firestore`);

          if (featureFlags.isEnabled('API_CACHING')) {
            await cache.delete('whatsapp:accounts');
            console.log(`🗑️  [${accountId}] Cache invalidated for QR update`);
          }
        } catch (error) {
          console.error(`❌ [${accountId}] QR generation failed:`, error.message);
        }
      }

      if (connection === 'open') {
        console.log(`✅ [${accountId}] Restored and connected`);

        // Clear connecting timeout - CRITICAL FIX
        if (account.connectingTimeout) {
          clearTimeout(account.connectingTimeout);
          account.connectingTimeout = null;
        }

        // Clear QR scan timeout (connection established, QR no longer needed)
        if (account.qrScanTimeout) {
          clearTimeout(account.qrScanTimeout);
          account.qrScanTimeout = null;
          console.log(`⏰ [${accountId}] QR scan timeout cleared (connected)`);
        }

        account.status = 'connected';
        account.qrCode = null;
        account.phone = sock.user?.id?.split(':')[0] || account.phone;
        account.waJid = sock.user?.id;
        account.lastUpdate = new Date().toISOString();

        // Reset reconnect attempts
        reconnectAttempts.delete(accountId);

        if (featureFlags.isEnabled('API_CACHING')) {
          await cache.delete('whatsapp:accounts');
          console.log(`🗑️  [${accountId}] Cache invalidated for connection update`);
        }

        await saveAccountToFirestore(accountId, {
          status: 'connected',
          waJid: account.waJid,
          phoneE164: account.phone,
          lastConnectedAt: admin.firestore.FieldValue.serverTimestamp(),
          qrCode: null,
        });

        // Schedule backfill after connection is established (best-effort gap filling)
        // Use jitter to avoid hitting all 30 accounts at once
        const backfillDelay = Math.floor(Math.random() * 30000) + 10000; // 10-40 seconds
        setTimeout(async () => {
          if (connections.has(accountId) && connections.get(accountId).status === 'connected') {
            console.log(`📚 [${accountId}] Scheduling backfill after restore (delay: ${backfillDelay}ms)`);
            try {
              await backfillAccountMessages(accountId);
            } catch (error) {
              console.error(`❌ [${accountId}] Backfill after restore failed:`, error.message);
            }
          }
        }, backfillDelay);
      }

      if (connection === 'close') {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        const reason = lastDisconnect?.error?.output?.statusCode || 'unknown';

        console.log(`🔌 [${accountId}] Connection closed`);
        console.log(`🔌 [${accountId}] Reason code: ${reason}, Reconnect: ${shouldReconnect}`);

        const health = connectionHealth.get(accountId);
        if (health) {
          health.isStale = true;
        }

        const EXPLICIT_CLEANUP_REASONS = [
          DisconnectReason.loggedOut,
          DisconnectReason.badSession,
          DisconnectReason.unauthorized,
        ];

        const isExplicitCleanup = EXPLICIT_CLEANUP_REASONS.includes(reason);
        const isPairingPhase = ['qr_ready', 'awaiting_scan', 'pairing', 'connecting'].includes(
          account.status
        );

        if (isPairingPhase && !isExplicitCleanup) {
          console.log(
            `⏸️  [${accountId}] Pairing phase (${account.status}), preserving account (reason: ${reason})`
          );
          account.status = 'awaiting_scan';
          account.lastUpdate = new Date().toISOString();

          await saveAccountToFirestore(accountId, {
            status: 'awaiting_scan',
            lastDisconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastDisconnectReason: 'qr_waiting_scan',
            lastDisconnectCode: reason,
          });

          return;
        }

        account.status = shouldReconnect ? 'reconnecting' : 'logged_out';
        account.lastUpdate = new Date().toISOString();

        await saveAccountToFirestore(accountId, {
          status: account.status,
          lastDisconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastDisconnectReason: reason.toString(),
          lastDisconnectCode: reason,
        });

        if (shouldReconnect) {
          const attempts = reconnectAttempts.get(accountId) || 0;

          if (attempts < MAX_RECONNECT_ATTEMPTS) {
            const backoff = Math.min(1000 * Math.pow(2, attempts), 30000);
            console.log(
              `🔄 [${accountId}] Reconnecting in ${backoff}ms (attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`
            );

            reconnectAttempts.set(accountId, attempts + 1);

            setTimeout(() => {
              if (connections.has(accountId)) {
                createConnection(accountId, account.name, account.phone);
              }
            }, backoff);
          } else {
            console.log(`❌ [${accountId}] Max reconnect attempts reached, generating new QR...`);
            account.status = 'needs_qr';

            await saveAccountToFirestore(accountId, {
              status: 'needs_qr',
            });

            connections.delete(accountId);
            reconnectAttempts.delete(accountId);

            setTimeout(() => {
              createConnection(accountId, account.name, account.phone);
            }, 5000);
          }
        } else {
          // Terminal logout (401/loggedOut/badSession) - requires re-pairing
          console.log(`❌ [${accountId}] Explicit cleanup (${reason}), terminal logout - clearing session`);
          account.status = 'needs_qr';

          // Clear session (disk + Firestore) to ensure fresh pairing
          try {
            await clearAccountSession(accountId);
          } catch (error) {
            console.error(`⚠️  [${accountId}] Failed to clear session:`, error.message);
            // Continue anyway - account will be marked needs_qr
          }

          await saveAccountToFirestore(accountId, {
            status: 'needs_qr',
            lastError: `logged_out (${reason}) - requires QR re-pair`,
            requiresQR: true,
            lastDisconnectReason: reason,
            lastDisconnectCode: reason,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await logIncident(accountId, 'logged_out', {
            reason: reason,
            requiresQR: true,
            traceId: `${accountId}_${Date.now()}`,
          });

          // Clean up in-memory connection and release lock
          connections.delete(accountId);
          connectionRegistry.release(accountId);

          // CRITICAL: DO NOT schedule createConnection() for terminal logout
          // User must explicitly request "Regenerate QR" to re-pair
          // This prevents infinite reconnect loop with invalid credentials
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // REMOVED: Flush outbox on connect handler
    // Single sending path: only outbox worker loop handles queued messages
    // This prevents duplicate sends on reconnect

    // History sync handler (ingest full conversation history on pairing/re-pair)
    sock.ev.on('messaging-history.set', async (history) => {
      try {
        console.log(`📚 [${accountId}] messaging-history.set event received (restoreAccount)`);
        
        if (!firestoreAvailable || !db) {
          console.log(`⚠️  [${accountId}] Firestore not available, skipping history sync`);
          return;
        }

        const { chats, contacts, messages } = history || {};
        
        let historyMessages = [];
        let historyChats = [];

        // Extract messages from history
        if (messages && Array.isArray(messages)) {
          historyMessages = messages;
          console.log(`📚 [${accountId}] History sync: ${historyMessages.length} messages found`);
        } else if (messages && typeof messages === 'object') {
          // Handle different message formats (Baileys may structure differently)
          historyMessages = Object.values(messages).flat();
          console.log(`📚 [${accountId}] History sync: ${historyMessages.length} messages extracted from history object`);
        }

        // Extract chats/contacts metadata
        if (chats && Array.isArray(chats)) {
          historyChats = chats;
        } else if (chats && typeof chats === 'object') {
          historyChats = Object.values(chats);
        }

        // Process messages in batches
        if (historyMessages.length > 0) {
          console.log(`📚 [${accountId}] Starting history sync: ${historyMessages.length} messages`);
          const result = await saveMessagesBatch(accountId, historyMessages, 'history_sync');
          
          console.log(`✅ [${accountId}] History sync complete: ${result.saved} saved, ${result.skipped} skipped, ${result.errors} errors`);
          
          // Update account metadata
          await saveAccountToFirestore(accountId, {
            lastHistorySyncAt: admin.firestore.FieldValue.serverTimestamp(),
            historySyncCount: (result.saved || 0),
            lastHistorySyncResult: {
              saved: result.saved || 0,
              skipped: result.skipped || 0,
              errors: result.errors || 0,
              total: historyMessages.length,
              dryRun: result.dryRun || false,
            },
          }).catch(err => console.error(`❌ [${accountId}] Failed to update history sync marker:`, err.message));
        } else {
          console.log(`⚠️  [${accountId}] History sync: No messages found in history`);
        }

        // Optionally save chats metadata (for future reference)
        if (historyChats.length > 0 && !HISTORY_SYNC_DRY_RUN) {
          console.log(`📚 [${accountId}] History sync: ${historyChats.length} chats found (metadata only, not persisted separately)`);
        }

      } catch (error) {
        console.error(`❌ [${accountId}] History sync error:`, error.message);
        console.error(`❌ [${accountId}] Stack:`, error.stack);
        await logIncident(accountId, 'history_sync_failed', { error: error.message });
      }
    });

    // Messages handler - CRITICAL for receiving messages
    sock.ev.on('messages.upsert', async ({ messages: newMessages, type }) => {
      try {
        updateConnectionHealth(accountId, 'message');
        console.log(
          `🔔🔔🔔 [${accountId}] messages.upsert EVENT TRIGGERED: type=${type}, count=${newMessages.length}, timestamp=${new Date().toISOString()}`
        );
        console.log(
          `🔔 [${accountId}] Account status: ${account?.status}, Socket exists: ${!!sock}`
        );
        console.log(
          `🔔 [${accountId}] Firestore available: ${firestoreAvailable}, DB exists: ${!!db}`
        );

        for (const msg of newMessages) {
          try {
            console.log(
              `📩 [${accountId}] RAW MESSAGE:`,
              JSON.stringify({
                id: msg.key.id,
                remoteJid: msg.key.remoteJid,
                fromMe: msg.key.fromMe,
                participant: msg.key.participant,
                hasMessage: !!msg.message,
                messageKeys: msg.message ? Object.keys(msg.message) : [],
              })
            );

            if (!msg.message) {
              console.log(`⚠️  [${accountId}] Skipping message ${msg.key.id} - no message content`);
              continue;
            }

            const messageId = msg.key.id;
            const from = msg.key.remoteJid;
            const isFromMe = msg.key.fromMe;

            console.log(
              `📨 [${accountId}] PROCESSING: ${isFromMe ? 'OUTBOUND' : 'INBOUND'} message ${messageId} from ${from}`
            );

            if (firestoreAvailable && db) {
              try {
                // CRITICAL FIX: Use consistent threadId format: accountId__clientJid
                // This ensures threads are properly namespaced per account
                const threadId = `${accountId}__${from}`;
                const messageData = {
                  accountId,
                  clientJid: from,
                  direction: isFromMe ? 'outbound' : 'inbound',
                  body: msg.message.conversation || msg.message.extendedTextMessage?.text || '',
                  waMessageId: messageId,
                  status: 'delivered',
                  tsClient: new Date(msg.messageTimestamp * 1000).toISOString(),
                  tsServer: admin.firestore.FieldValue.serverTimestamp(),
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                };

                console.log(
                  `💾 [${accountId}] Saving to Firestore: threads/${threadId}/messages/${messageId}`,
                  {
                    direction: messageData.direction,
                    body: messageData.body.substring(0, 50),
                  }
                );

                await db
                  .collection('threads')
                  .doc(threadId)
                  .collection('messages')
                  .doc(messageId)
                  .set(messageData);

                console.log(`✅ [${accountId}] Message saved successfully`);

                await db.collection('threads').doc(threadId).set(
                  {
                    accountId,
                    clientJid: from,
                    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
                  },
                  { merge: true }
                );

                console.log(`💾 [${accountId}] Message saved to Firestore: ${messageId}`);
              } catch (error) {
                console.error(`❌ [${accountId}] Message save failed:`, error.message);
                console.error(`❌ [${accountId}] Error stack:`, error.stack);
              }
            } else {
              console.log(`⚠️  [${accountId}] Firestore not available, message not persisted`);
            }
          } catch (msgError) {
            console.error(`❌ [${accountId}] Error processing message:`, msgError.message);
            console.error(`❌ [${accountId}] Stack:`, msgError.stack);
          }
        }
      } catch (eventError) {
        console.error(`❌ [${accountId}] Error in messages.upsert handler:`, eventError.message);
        console.error(`❌ [${accountId}] Stack:`, eventError.stack);
      }
    });

    // Messages update handler (for status updates: delivered/read receipts)
    sock.ev.on('messages.update', async (updates) => {
      try {
        console.log(`🔄 [${accountId}] messages.update EVENT: ${updates.length} updates`);
        
        if (!firestoreAvailable || !db) {
          return;
        }

        for (const update of updates) {
          try {
            const messageKey = update.key;
            const messageId = messageKey.id;
            const remoteJid = messageKey.remoteJid;
            const updateData = update.update || {};

            // Extract status from update (status: 2 = delivered, 3 = read)
            let status = null;
            let deliveredAt = null;
            let readAt = null;

            if (updateData.status !== undefined) {
              if (updateData.status === 2) {
                status = 'delivered';
                deliveredAt = admin.firestore.FieldValue.serverTimestamp();
              } else if (updateData.status === 3) {
                status = 'read';
                readAt = admin.firestore.FieldValue.serverTimestamp();
              }
            }

            // Update message in Firestore if status changed
            if (status && remoteJid) {
              const threadId = `${accountId}__${remoteJid}`;
              const messageRef = db.collection('threads').doc(threadId).collection('messages').doc(messageId);
              
              const updateFields = {
                status,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              };
              
              if (deliveredAt) {
                updateFields.deliveredAt = deliveredAt;
              }
              if (readAt) {
                updateFields.readAt = readAt;
              }

              await messageRef.set(updateFields, { merge: true });
              console.log(`✅ [${accountId}] Updated message ${messageId} status to ${status}`);
            }
          } catch (updateError) {
            console.error(`❌ [${accountId}] Error updating message receipt:`, updateError.message);
          }
        }
      } catch (error) {
        console.error(`❌ [${accountId}] Error in messages.update handler:`, error.message);
      }
    });

    // Message receipt handler (complementary to messages.update)
    sock.ev.on('message-receipt.update', async (receipts) => {
      try {
        console.log(`📬 [${accountId}] message-receipt.update EVENT: ${receipts.length} receipts`);
        
        if (!firestoreAvailable || !db) {
          return;
        }

        for (const receipt of receipts) {
          try {
            const receiptKey = receipt.key;
            const messageId = receiptKey.id;
            const remoteJid = receiptKey.remoteJid;
            const receiptData = receipt.receipt || {};

            // Extract read receipts
            if (receiptData.readTimestamp && remoteJid) {
              const threadId = `${accountId}__${remoteJid}`;
              const messageRef = db.collection('threads').doc(threadId).collection('messages').doc(messageId);
              
              await messageRef.set({
                status: 'read',
                readAt: admin.firestore.Timestamp.fromMillis(receiptData.readTimestamp * 1000),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              }, { merge: true });
              
              console.log(`✅ [${accountId}] Updated message ${messageId} receipt: read`);
            }
          } catch (receiptError) {
            console.error(`❌ [${accountId}] Error updating receipt:`, receiptError.message);
          }
        }
      } catch (error) {
        console.error(`❌ [${accountId}] Error in message-receipt.update handler:`, error.message);
      }
    });

    connections.set(accountId, account);
    console.log(`✅ [${accountId}] Restored to memory with full event handlers`);
  } catch (error) {
    console.error(`❌ [${accountId}] Restore failed:`, error.message);
  }
}

async function restoreAccountsFromFirestore() {
  // HARD GATE: PASSIVE mode - do NOT restore accounts
  // DEBUG: Log canStartBaileys() result to understand why gate may not work
  const canStart = waBootstrap.canStartBaileys();
  console.log(`🔍 [DEBUG] restoreAccountsFromFirestore: canStartBaileys()=${canStart}`);
  if (!canStart) {
    console.log('⏸️  PASSIVE mode - skipping account restore (lock not held)');
    return;
  }

  if (!firestoreAvailable) {
    console.log('⚠️  Firestore not available, skipping account restore');
    return;
  }

  try {
    console.log('🔄 Restoring accounts from Firestore...');

    // CRITICAL FIX: Restore ALL accounts in pairing phase (qr_ready, connecting, awaiting_scan) + connected
    // Previously only restored 'connected' accounts, causing accounts to disappear after restart
    // This ensures accounts in pairing phase remain visible and can continue pairing after restart
    // NOTE: Firestore 'in' operator supports up to 10 values, we have 4, so it's safe
    const pairingStatuses = ['qr_ready', 'connecting', 'awaiting_scan', 'connected'];
    const snapshot = await db.collection('accounts')
      .where('status', 'in', pairingStatuses)
      .get();

    console.log(`📦 Found ${snapshot.size} accounts in Firestore (statuses: ${pairingStatuses.join(', ')})`);

    // Clean up disk sessions that are NOT in Firestore (SAFE: move to orphaned folder, don't delete)
    const allAccountIds = new Set(snapshot.docs.map(doc => doc.id));
    const sessionsDir = path.join(__dirname, 'sessions');
    const orphanedDir = path.join(sessionsDir, '_orphaned');

    if (fs.existsSync(sessionsDir)) {
      const diskSessions = fs.readdirSync(sessionsDir).filter(
        name => name !== '_orphaned' && !name.startsWith('.')
      );
      console.log(`🧹 Checking ${diskSessions.length} disk sessions...`);

      // Only delete orphaned sessions if explicitly enabled via env var
      const ORPHAN_SESSION_DELETE = process.env.ORPHAN_SESSION_DELETE === 'true';

      for (const sessionId of diskSessions) {
        if (!allAccountIds.has(sessionId)) {
          const sessionPath = path.join(sessionsDir, sessionId);
          
          if (ORPHAN_SESSION_DELETE) {
            // Hard delete (only if explicitly enabled)
            console.log(`🗑️  [ORPHAN_DELETE] Deleting orphaned session: ${sessionId}`);
            fs.rmSync(sessionPath, { recursive: true, force: true });
          } else {
            // Safe move to orphaned folder (default behavior)
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const orphanedPath = path.join(orphanedDir, `${timestamp}_${sessionId}`);
            
            try {
              if (!fs.existsSync(orphanedDir)) {
                fs.mkdirSync(orphanedDir, { recursive: true });
              }
              fs.renameSync(sessionPath, orphanedPath);
              console.log(`📦 [ORPHAN] Moved orphaned session to _orphaned folder: ${sessionId} -> ${path.basename(orphanedPath)}`);
            } catch (error) {
              console.error(`⚠️  Failed to move orphaned session ${sessionId}:`, error.message);
            }
          }
        }
      }
    }

    // Sort accounts deterministically for predictable boot order
    const sortedDocs = snapshot.docs.sort((a, b) => a.id.localeCompare(b.id));

    for (let i = 0; i < sortedDocs.length; i++) {
      const doc = sortedDocs[i];
      const data = doc.data();
      const accountId = doc.id;

      // Guard: Skip terminal logout accounts (require explicit QR regeneration)
      const terminalStatuses = ['needs_qr', 'logged_out'];
      if (terminalStatuses.includes(data.status) || data.requiresQR === true) {
        console.log(`⏸️  [${accountId}] Skipping restore (status: ${data.status}, requiresQR: ${data.requiresQR}) - use Regenerate QR`);
        continue;
      }

      // Add 2-5s jitter between account restores (staggered boot to avoid rate limiting)
      if (i > 0) {
        const jitter = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds
        console.log(`⏳ Waiting ${jitter / 1000}s before restoring next account (staggered boot)...`);
        await new Promise(resolve => setTimeout(resolve, jitter));
      }

      console.log(`🔄 [${accountId}] Restoring account (status: ${data.status}, name: ${data.name || 'N/A'})`);
      await restoreAccount(accountId, data);
    }

    console.log(`✅ Account restore complete: ${connections.size} accounts loaded`);

    // Start connections for restored accounts with staggered boot (2-5s jitter)
    // CRITICAL: Check PASSIVE mode again before starting connections
    // This is necessary because waBootstrap may not be fully initialized when restoreAccountsFromFirestore() is called
    const canStartConnections = waBootstrap.canStartBaileys();
    console.log(`🔍 [DEBUG] Starting connections for restored accounts: canStartBaileys()=${canStartConnections}`);
    
    if (!canStartConnections) {
      console.log('⏸️  PASSIVE mode - skipping connection start for restored accounts (lock not held)');
      return; // Exit early - don't start connections in PASSIVE mode
    }
    
    console.log('🔌 Starting connections for restored accounts (staggered boot)...');
    
    // Sort accounts deterministically for predictable boot order
    // CRITICAL FIX: Include accounts in pairing phase (qr_ready, connecting, awaiting_scan) + connected
    const sortedConnections = Array.from(connections.entries())
      .filter(([accountId, account]) => !account.sock && ['qr_ready', 'connecting', 'awaiting_scan', 'connected'].includes(account.status))
      .sort(([a], [b]) => a.localeCompare(b));

    for (let i = 0; i < sortedConnections.length; i++) {
      const [accountId, account] = sortedConnections[i];

      // Add 2-5s jitter between connections (staggered boot to avoid rate limiting)
      if (i > 0) {
        const jitter = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds
        console.log(`⏳ Waiting ${jitter / 1000}s before connecting next account (staggered boot)...`);
        await new Promise(resolve => setTimeout(resolve, jitter));
      }

      console.log(`🔌 [${accountId}] Starting connection (no socket)...`);
      try {
        await createConnection(accountId, account.name, account.phone);
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to start connection:`, error.message);
      }
    }

    // Log any accounts that already have sockets
    for (const [accountId, account] of connections.entries()) {
      if (account.sock && (account.status === 'connected' || account.status === 'connecting')) {
        console.log(`✅ [${accountId}] Socket already exists, skipping createConnection`);
      }
    }
  } catch (error) {
    // Log error details without exposing secrets
    console.error('❌ Account restore failed:', {
      code: error.code,
      message: error.message,
      name: error.name,
    });
    console.log('⚠️  Starting with 0 accounts. Service will continue running.');
    // Don't throw - allow service to start with empty state
  }
}

// Restore accounts from disk (complements Firestore restore)
// Scans authDir for session directories and restores any found accounts
async function restoreAccountsFromDisk() {
  console.log('🔄 Scanning disk for session directories...');

  if (!fs.existsSync(authDir)) {
    console.log('⚠️  Auth directory does not exist, skipping disk scan');
    return;
  }

  try {
    const sessionDirs = fs.readdirSync(authDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.log(`📁 Found ${sessionDirs.length} session directories on disk`);

    let restoredCount = 0;
    let skippedCount = 0;

    // Sort accounts deterministically for predictable boot order
    const sortedSessionDirs = sessionDirs.sort((a, b) => a.localeCompare(b));

    for (let i = 0; i < sortedSessionDirs.length; i++) {
      const accountId = sortedSessionDirs[i];
      const sessionPath = path.join(authDir, accountId);
      const credsPath = path.join(sessionPath, 'creds.json');

      if (fs.existsSync(credsPath)) {
        // Check if already in connections (from Firestore restore)
        if (!connections.has(accountId)) {
          // Add 2-5s jitter between account restores (staggered boot to avoid rate limiting)
          if (i > 0) {
            const jitter = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds
            console.log(`⏳ Waiting ${jitter / 1000}s before restoring next account from disk (staggered boot)...`);
            await new Promise(resolve => setTimeout(resolve, jitter));
          }

          console.log(`🔄 [${accountId}] Restoring from disk (not in Firestore)...`);
          try {
            await restoreAccount(accountId, {
              status: 'connected',
              name: accountId,
              phone: null, // Will be loaded from session
            });
            restoredCount++;
          } catch (error) {
            console.error(`❌ [${accountId}] Disk restore failed:`, error.message);
          }
        } else {
          skippedCount++;
        }
      }
    }

    console.log(
      `✅ Disk scan complete: ${restoredCount} restored from disk, ${skippedCount} already in memory, ${connections.size} total accounts`
    );
  } catch (error) {
    console.error('❌ Disk scan failed:', {
      code: error.code,
      message: error.message,
      name: error.name,
    });
    console.log('⚠️  Continuing without disk restore...');
  }
}

// Queue/Outbox endpoints
app.post('/admin/queue/test', requireAdmin, async (req, res) => {
  try {
    const { accountId, messages } = req.body;

    if (!accountId || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing accountId or messages array' });
    }

    // Enqueue messages to Firestore outbox
    const queuedMessages = [];

    for (const msg of messages) {
      const messageId = `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const queueData = {
        accountId,
        to: msg.to,
        body: msg.body,
        status: 'queued',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        attempts: 0,
      };

      await db.collection('wa_outbox').doc(messageId).set(queueData);
      queuedMessages.push({ messageId, ...queueData });
    }

    res.json({
      success: true,
      queued: queuedMessages.length,
      messages: queuedMessages,
    });
  } catch (error) {
    console.error('Queue test error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/queue/flush', requireAdmin, async (req, res) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Missing accountId' });
    }

    // Get queued messages
    const snapshot = await db
      .collection('wa_outbox')
      .where('accountId', '==', accountId)
      .where('status', '==', 'queued')
      .orderBy('createdAt', 'asc')
      .get();

    const results = [];
    const account = connections.get(accountId);

    if (!account || account.status !== 'connected') {
      return res.status(400).json({ error: 'Account not connected' });
    }

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const messageId = doc.id;

      try {
        // Send message
        const result = await account.sock.sendMessage(`${data.to}@s.whatsapp.net`, {
          text: data.body,
        });

        // Update status
        await db.collection('wa_outbox').doc(messageId).update({
          status: 'sent',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          waMessageId: result.key.id,
        });

        results.push({
          messageId,
          status: 'sent',
          waMessageId: result.key.id,
        });
      } catch (error) {
        await db
          .collection('wa_outbox')
          .doc(messageId)
          .update({
            status: 'failed',
            error: error.message,
            attempts: admin.firestore.Increment(1),
          });

        results.push({
          messageId,
          status: 'failed',
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      flushed: results.length,
      results,
    });
  } catch (error) {
    console.error('Queue flush error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/admin/queue/status', requireAdmin, async (req, res) => {
  try {
    const { accountId } = req.query;

    let query = db.collection('wa_outbox');
    if (accountId) {
      query = query.where('accountId', '==', accountId);
    }

    const snapshot = await query.get();
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    const stats = {
      total: messages.length,
      queued: messages.filter(m => m.status === 'queued').length,
      sent: messages.filter(m => m.status === 'sent').length,
      failed: messages.filter(m => m.status === 'failed').length,
    };

    res.json({
      success: true,
      stats,
      messages,
    });
  } catch (error) {
    console.error('Queue status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Query longrun heartbeats
app.get('/api/admin/longrun/heartbeats', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const snapshot = await db
      .collection('wa_metrics')
      .doc('longrun')
      .collection('heartbeats')
      .orderBy('tsIso', 'desc')
      .limit(limit)
      .get();

    const heartbeats = [];
    snapshot.forEach(doc => {
      heartbeats.push({
        id: doc.id,
        path: `wa_metrics/longrun/heartbeats/${doc.id}`,
        ...doc.data(),
      });
    });

    res.json({ success: true, count: heartbeats.length, heartbeats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Query longrun locks
app.get('/api/admin/longrun/locks', async (req, res) => {
  try {
    const snapshot = await db.collection('wa_metrics').doc('longrun').collection('locks').get();

    const locks = [];
    snapshot.forEach(doc => {
      locks.push({
        id: doc.id,
        path: `wa_metrics/longrun/locks/${doc.id}`,
        ...doc.data(),
      });
    });

    res.json({ success: true, count: locks.length, locks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Query longrun config
app.get('/api/admin/longrun/config', async (req, res) => {
  try {
    const configDoc = await db
      .collection('wa_metrics')
      .doc('longrun')
      .collection('config')
      .doc('current')
      .get();

    if (!configDoc.exists) {
      return res.json({ success: false, error: 'Config not found' });
    }

    res.json({
      success: true,
      config: {
        id: configDoc.id,
        path: `wa_metrics/longrun/config/${configDoc.id}`,
        ...configDoc.data(),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Query longrun probes
app.get('/api/admin/longrun/probes', async (req, res) => {
  try {
    const snapshot = await db
      .collection('wa_metrics')
      .doc('longrun')
      .collection('probes')
      .orderBy('tsIso', 'desc')
      .limit(10)
      .get();

    const probes = [];
    snapshot.forEach(doc => {
      probes.push({
        id: doc.id,
        path: `wa_metrics/longrun/probes/${doc.id}`,
        ...doc.data(),
      });
    });

    res.json({ success: true, count: probes.length, probes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Diagnostic Firestore sessions (PUBLIC for debugging - remove in production)
app.get('/api/admin/firestore/sessions', async (req, res) => {
  try {
    const sessionsSnapshot = await db.collection('wa_sessions').get();
    const sessions = [];

    for (const doc of sessionsSnapshot.docs) {
      const data = doc.data();
      sessions.push({
        id: doc.id,
        fields: Object.keys(data),
        hasCreds: !!data.creds,
        hasKeys: !!data.keys,
        credsKeys: data.creds ? Object.keys(data.creds) : [],
        keysTypes: data.keys ? Object.keys(data.keys) : [],
        updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
        schemaVersion: data.schemaVersion,
      });
    }

    res.json({
      success: true,
      total: sessions.length,
      sessions,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Self-exit for process restart
app.post('/api/admin/self-exit', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.substring(7) : null;

    if (token !== ONE_TIME_TEST_TOKEN || Date.now() > TEST_TOKEN_EXPIRY) {
      return res.status(403).json({ error: 'Invalid or expired test token' });
    }

    console.log('🔄 Self-exit requested for process restart');

    res.json({ success: true, message: 'Process exit initiated' });

    setTimeout(() => {
      console.log('👋 Exiting process for restart...');
      process.exit(0);
    }, 1000);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Restart socket (for coldstart test)
app.post('/api/admin/sockets/restart', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.substring(7) : null;

    if (token !== ONE_TIME_TEST_TOKEN || Date.now() > TEST_TOKEN_EXPIRY) {
      return res.status(403).json({ error: 'Invalid or expired test token' });
    }

    const { accountId } = req.body;
    if (!accountId) {
      return res.status(400).json({ error: 'accountId required' });
    }

    const account = connections.get(accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    console.log(`🔄 [${accountId}] Socket restart requested`);

    // Close current socket
    if (account.sock) {
      account.sock.end();
    }

    // Remove from connections
    connections.delete(accountId);

    // Trigger restore from Firestore (via boot loader logic)
    setTimeout(async () => {
      try {
        const sessionPath = path.join(authDir, accountId);

        // Restore from Firestore if needed
        if (!fs.existsSync(sessionPath) && USE_FIRESTORE_BACKUP && firestoreAvailable) {
          const sessionDoc = await db.collection('wa_sessions').doc(accountId).get();
          if (sessionDoc.exists) {
            const sessionData = sessionDoc.data();

            if (sessionData.files) {
              fs.mkdirSync(sessionPath, { recursive: true });

              for (const [filename, content] of Object.entries(sessionData.files)) {
                fs.writeFileSync(path.join(sessionPath, filename), content, 'utf8');
              }

              console.log(`FIRESTORE_SESSION_LOADED [${accountId}] Restored from Firestore`);
            }
          }
        }

        // Recreate socket
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
          auth: state,
          version,
          printQRInTerminal: false,
          browser: ['SuperParty', 'Chrome', '2.0.0'],
          logger: pino({ level: 'warn' }),
        });

        const newAccount = {
          id: accountId,
          sock,
          status: 'connecting',
          createdAt: account.createdAt,
          lastUpdate: new Date().toISOString(),
        };

        connections.set(accountId, newAccount);

        // Setup event handlers (simplified)
        sock.ev.on('connection.update', async update => {
          const { connection } = update;

          if (connection === 'open') {
            newAccount.status = 'connected';
            newAccount.phone = sock.user?.id.split(':')[0];
            console.log(`SOCKET_CREATED [${accountId}] Reconnected`);
          }
        });

        console.log(`✅ [${accountId}] Socket recreated`);
      } catch (error) {
        console.error(`❌ [${accountId}] Socket restart failed:`, error.message);
      }
    }, 1000);

    res.json({ success: true, message: 'Socket restart initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Reset account session
app.post('/api/admin/accounts/:id/reset-session', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Delete wa_sessions
    await db.collection('wa_sessions').doc(id).delete();
    console.log(`🗑️  [${id}] Session deleted from Firestore`);

    // Update wa_accounts to needs_qr
    await db.collection('wa_accounts').doc(id).set(
      {
        status: 'needs_qr',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Disconnect socket if exists
    const account = connections.get(id);
    if (account && account.sock) {
      account.sock.end();
      connections.delete(id);
      console.log(`🔌 [${id}] Socket disconnected`);
    }

    res.json({
      success: true,
      message: 'Session reset, regenerate QR via /api/whatsapp/regenerate-qr/:id',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Status dashboard endpoint - returns per-account status for all 30 accounts
app.get('/api/status/dashboard', async (req, res) => {
  try {
    const accounts = [];
    let connectedCount = 0;
    let disconnectedCount = 0;
    let needsQRCount = 0;
    let connectingCount = 0;

    for (const [accountId, account] of connections.entries()) {
      const status = account.status || 'unknown';

      if (status === 'connected') connectedCount++;
      else if (status === 'disconnected') disconnectedCount++;
      else if (status === 'connecting') connectingCount++;
      else if (status === 'needs_qr' || account.qr) needsQRCount++;

      // Get reconnectAttempts from Map (current active reconnection attempts)
      const reconnectAttemptsCount = reconnectAttempts.get(accountId) || 0;
      
      // Get lastSeen from lastEventAt or lastMessageAt (most recent activity)
      const lastSeen = account.lastEventAt || account.lastMessageAt || null;

      // Get backfill info from Firestore (if available)
      let lastBackfillAt = null;
      let lastHistorySyncAt = null;
      if (firestoreAvailable && db) {
        try {
          const accountDoc = await db.collection('accounts').doc(accountId).get();
          if (accountDoc.exists) {
            const accountData = accountDoc.data();
            lastBackfillAt = accountData.lastBackfillAt?.toDate?.()?.toISOString() || null;
            lastHistorySyncAt = accountData.lastHistorySyncAt?.toDate?.()?.toISOString() || null;
          }
        } catch (error) {
          // Ignore errors when fetching backfill info
        }
      }

      const accountData = {
        accountId,
        phone: account.phone ? maskPhone(account.phone) : null,
        status,
        lastEventAt: account.lastEventAt ? new Date(account.lastEventAt).toISOString() : null,
        lastMessageAt: account.lastMessageAt ? new Date(account.lastMessageAt).toISOString() : null,
        lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
        reconnectCount: account.reconnectCount || 0,
        reconnectAttempts: reconnectAttemptsCount,
        needsQR: !!account.qr,
        lastBackfillAt,
        lastHistorySyncAt,
      };

      // Include QR code only if needsQR is true (and qr is not null/empty)
      if (account.qr && typeof account.qr === 'string' && account.qr.length > 0) {
        try {
          accountData.qrCode = await QRCode.toDataURL(account.qr);
        } catch (err) {
          console.error(`❌ [${accountId}] QR code generation failed:`, err.message);
        }
      }

      accounts.push(accountData);
    }

    res.json({
      timestamp: new Date().toISOString(),
      service: {
        status: 'healthy',
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
        version: VERSION,
      },
      storage: {
        path: authDir,
        writable: isWritable,
        totalAccounts: connections.size,
      },
      accounts: accounts.sort((a, b) => a.accountId.localeCompare(b.accountId)),
      summary: {
        connected: connectedCount,
        connecting: connectingCount,
        disconnected: disconnectedCount,
        needs_qr: needsQRCount,
        total: connections.size,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health`);
  console.log(`📱 Accounts: http://localhost:${PORT}/api/whatsapp/accounts`);
  console.log(`📊 Status Dashboard: http://localhost:${PORT}/api/status/dashboard`);
  console.log(`🚀 Railway deployment ready!\n`);

  // CRITICAL: Invalidate cache on server start to prevent stale data after deployments
  // This ensures that any code changes (like filtering deleted accounts) take effect immediately
  if (featureFlags.isEnabled('API_CACHING')) {
    try {
      await cache.delete('whatsapp:accounts');
      console.log('🗑️  Cache invalidated on server start (prevents stale data after deployment)');
    } catch (error) {
      console.error('⚠️  Failed to invalidate cache on startup:', error.message);
    }
  }

  // Initialize long-run schema and evidence endpoints FIRST (before restore)
  if (firestoreAvailable) {
    const baseUrl = process.env.BAILEYS_BASE_URL || 'https://whats-upp-production.up.railway.app';

    // Initialize schema
    const longrunSchema = new LongRunSchemaComplete(db);

    // Initialize config
    const commitHash = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) || 'ed61e9f4';
    const serviceVersion = '2.0.0';
    const instanceId = process.env.RAILWAY_DEPLOYMENT_ID || `local-${Date.now()}`;

    await longrunSchema.initConfig(baseUrl, commitHash, serviceVersion, instanceId);
    console.log('✅ Long-run config initialized');

    // Create baileys-like interface for LongRunJobs
    const baileysInterface = {
      getAccounts: () => {
        const accounts = [];
        connections.forEach((conn, accountId) => {
          accounts.push({
            accountId,
            status: conn.status || 'unknown',
            phoneNumber: conn.phoneNumber || null,
            role: conn.role || 'operator',
          });
        });
        return accounts;
      },
      sendMessage: async (accountId, to, message) => {
        const conn = connections.get(accountId);
        if (!conn || !conn.sock) {
          throw new Error(`Account ${accountId} not connected`);
        }

        const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
        return await conn.sock.sendMessage(jid, { text: message });
      },
      getQueueStats: async () => {
        // TODO: Implement queue stats if available
        return { pending: 0 };
      },
      on: (event, handler) => {
        // TODO: Implement event emitter if needed
      },
      removeListener: (event, handler) => {
        // TODO: Implement event emitter if needed
      },
      bootTimestamp: START_TIME,
    };

    // CRITICAL: Initialize WA system with lock acquisition BEFORE restoring accounts
    // This ensures PASSIVE mode gates work correctly during restore
    console.log('🔒 Initializing WA system with lock acquisition...');
    const waInitResult = await waBootstrap.initializeWASystem(db);
    
    // Get lock status for startup log
    let lockInfo = 'unknown';
    try {
      const status = await waBootstrap.getWAStatus();
      const lock = status.lock || {};
      if (lock.exists && lock.holder) {
        const expiresIn = lock.remainingMs ? Math.ceil(lock.remainingMs / 1000) : 'unknown';
        lockInfo = `holder=${lock.holder}, expiresIn=${expiresIn}s`;
      } else if (!lock.exists) {
        lockInfo = 'no_lock';
      } else {
        lockInfo = 'lock_status_unknown';
      }
    } catch (error) {
      lockInfo = `error: ${error.message}`;
    }
    
    console.log(`🔒 WA system initialized: mode=${waInitResult.mode}, instanceId=${waInitResult.instanceId || process.env.RAILWAY_DEPLOYMENT_ID || 'unknown'}, lock=${lockInfo}`);
    console.log(`📋 Startup info: commit=${COMMIT_HASH || 'unknown'}, instanceId=${process.env.RAILWAY_DEPLOYMENT_ID || 'unknown'}, mode=${waInitResult.mode}, lockInfo=${lockInfo}`);

    // Initialize evidence endpoints (after baileys interface + wa-bootstrap)
    new EvidenceEndpoints(
      app,
      db,
      longrunSchema,
      LONGRUN_ADMIN_TOKEN,
      baileysInterface,
      waBootstrap
    );
    console.log('✅ Evidence endpoints initialized');

    // Initialize long-run jobs v2 (uses initJobs function, not class)
    await longrunJobsModule.initJobs(db, baseUrl);
    console.log('✅ Long-run jobs v2 started');

    // Start deploy guard
    const deployGuard = new DeployGuard(db, longrunSchema, baseUrl, commitHash);
    deployGuard.start();
    console.log('✅ Deploy guard started');
  }

  // Restore accounts AFTER WA system is initialized (so PASSIVE mode gates work)
  // First restore from Firestore (if available), then scan disk for any missed sessions
  await restoreAccountsFromFirestore();
  await restoreAccountsFromDisk();

  // CRITICAL: Listen for PASSIVE → ACTIVE transition and restore accounts automatically
  // This ensures accounts are restored when backend acquires lock after starting in PASSIVE mode
  // Without this, accounts remain in Firestore but not in memory until manual redeploy
  process.on('wa-bootstrap:active', async ({ instanceId }) => {
    console.log(`🔔 [Auto-Restore] PASSIVE → ACTIVE transition detected (instance: ${instanceId})`);
    console.log(`🔄 [Auto-Restore] Triggering account restoration from Firestore...`);
    
    try {
      // Restore accounts from Firestore now that we have the lock
      await restoreAccountsFromFirestore();
      await restoreAccountsFromDisk();
      
      console.log(`✅ [Auto-Restore] Account restoration complete after ACTIVE transition`);
    } catch (error) {
      console.error(`❌ [Auto-Restore] Failed to restore accounts after ACTIVE transition:`, error.message);
    }
  });

  // Start health monitoring watchdog AFTER accounts are restored
  setInterval(() => {
    const staleAccounts = checkStaleConnections();

    if (staleAccounts.length > 0) {
      console.log(
        `🚨 Found ${staleAccounts.length} stale connections, triggering auto-recovery...`
      );

      for (const accountId of staleAccounts) {
        recoverStaleConnection(accountId).catch(err => {
          console.error(`❌ Recovery failed for ${accountId}:`, err.message);
        });
      }
    }
  }, HEALTH_CHECK_INTERVAL);

  console.log(
    `🏥 Health monitoring watchdog started (check every ${HEALTH_CHECK_INTERVAL / 1000}s)`
  );

  // Start lease refresh
  startLeaseRefresh();

  // Start outbox worker (process queued messages every 500ms for near-instant delivery)
  const OUTBOX_WORKER_INTERVAL = 500;
  const MAX_RETRY_ATTEMPTS = 5;

  // Worker instance ID for distributed leasing
  const WORKER_ID = process.env.RAILWAY_DEPLOYMENT_ID || process.env.HOSTNAME || `local-${Date.now()}`;
  const LEASE_DURATION_MS = 60000; // 60 seconds lease

  setInterval(async () => {
    // HARD GATE: PASSIVE mode - do NOT process outbox
    if (!waBootstrap.canProcessOutbox()) {
      return; // Skip processing in PASSIVE mode
    }

    if (!firestoreAvailable || !db) return;

    try {
      // Query queued messages that are ready to be processed
      const now = admin.firestore.Timestamp.now();
      const outboxSnapshot = await db
        .collection('outbox')
        .where('status', '==', 'queued')
        .where('nextAttemptAt', '<=', now)
        .limit(10)
        .get();

      if (outboxSnapshot.empty) return;

      const workerStartTime = Date.now();
      console.log(`📤 Outbox worker [${WORKER_ID}]: processing ${outboxSnapshot.size} queued messages`);

      for (const doc of outboxSnapshot.docs) {
        const requestId = doc.id;
        const messageStartTime = Date.now();

        // DISTRIBUTED LEASING: Use transaction to atomically claim message
        let claimed = false;
        let data = null;
        try {
          await db.runTransaction(async (transaction) => {
            const outboxRef = db.collection('outbox').doc(requestId);
            const outboxDoc = await transaction.get(outboxRef);

            if (!outboxDoc.exists) {
              return; // Already deleted or doesn't exist
            }

            const currentData = outboxDoc.data();
            const currentStatus = currentData.status;
            const leaseUntil = currentData.leaseUntil;

            // Skip if not queued or already claimed by another worker
            if (currentStatus !== 'queued') {
              return; // Already processed
            }

            // Check if lease is still valid (another worker claimed it)
            if (leaseUntil && leaseUntil.toMillis() > Date.now()) {
              return; // Already claimed by another worker
            }

            // Claim the message atomically
            const leaseUntilTimestamp = admin.firestore.Timestamp.fromMillis(Date.now() + LEASE_DURATION_MS);
            transaction.update(outboxRef, {
              status: 'processing',
              claimedBy: WORKER_ID,
              leaseUntil: leaseUntilTimestamp,
              attemptCount: (currentData.attemptCount || 0) + 1,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            claimed = true;
            data = currentData;
          });
        } catch (txError) {
          console.error(`❌ [${WORKER_ID}] Transaction failed for ${requestId}:`, txError.message);
          continue; // Skip this message, will retry in next cycle
        }

        if (!claimed || !data) {
          continue; // Not claimed (already processed or claimed by another worker)
        }

        const {
          accountId,
          toJid,
          threadId,
          payload,
          body,
          attemptCount = 0,
          providerMessageId,
        } = data;

        // IDEMPOTENCY CHECK: Skip if already sent
        if (providerMessageId) {
          console.log(
            `✅ [${accountId}] Message ${requestId} already sent (providerMessageId: ${providerMessageId}), skipping`
          );
          await db.collection('outbox').doc(requestId).update({
            status: 'sent',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            leaseUntil: null, // Release lease
          });
          continue;
        }

        // Check if account is connected
        const account = connections.get(accountId);
        if (!account || !account.sock || account.status !== 'connected') {
          console.log(`⏸️  [${accountId}] Account not connected, skipping message ${requestId}`);

          const newAttemptCount = attemptCount + 1;

          // Mark as failed after MAX_RETRY_ATTEMPTS
          if (newAttemptCount >= MAX_RETRY_ATTEMPTS) {
            console.log(
              `❌ [${accountId}] Message ${requestId} failed after ${MAX_RETRY_ATTEMPTS} attempts (account not connected)`
            );
            await db.collection('outbox').doc(requestId).update({
              status: 'failed',
              attemptCount: newAttemptCount,
              lastError: 'Account not connected after max retries',
              failedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              leaseUntil: null, // Release lease
            });

            // Update message doc in thread
            if (threadId) {
              try {
                const messageRef = db
                  .collection('threads')
                  .doc(threadId)
                  .collection('messages')
                  .doc(requestId);
                const messageDoc = await messageRef.get();
                if (messageDoc.exists) {
                  await messageRef.update({
                    status: 'failed',
                    lastError: 'Account not connected after max retries',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  });
                }
              } catch (msgError) {
                console.error(
                  `⚠️  [${accountId}] Failed to update message doc ${requestId}:`,
                  msgError.message
                );
              }
            }
            continue;
          }

          // Retry later with exponential backoff
          const backoffMs = Math.min(1000 * Math.pow(2, attemptCount), 60000);
          const nextAttemptAt = new Date(Date.now() + backoffMs);

          await db
            .collection('outbox')
            .doc(requestId)
            .update({
              status: 'queued', // Reset to queued for retry
              attemptCount: newAttemptCount,
              nextAttemptAt: admin.firestore.Timestamp.fromDate(nextAttemptAt),
              lastError: 'Account not connected',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              leaseUntil: null, // Release lease
            });

          console.log(
            `🔄 [${accountId}] Message ${requestId} will retry in ${backoffMs}ms (attempt ${newAttemptCount}/${MAX_RETRY_ATTEMPTS})`
          );
          continue;
        }

        try {
          // Refresh lease while sending (extend lease)
          const leaseRefreshInterval = setInterval(async () => {
            try {
              await db.collection('outbox').doc(requestId).update({
                leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + LEASE_DURATION_MS),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            } catch (e) {
              // Ignore refresh errors (message may have been completed)
            }
          }, 30000); // Refresh every 30s

          // Send message via Baileys
          const messagePayload = payload || { text: body };
          const sendStartTime = Date.now();
          const result = await account.sock.sendMessage(toJid, messagePayload);
          const sendDuration = Date.now() - sendStartTime;
          const totalDuration = Date.now() - messageStartTime;

          console.log(
            `✅ [${accountId}] Sent outbox message ${requestId}, waMessageId: ${result.key.id} (WhatsApp: ${sendDuration}ms, total: ${totalDuration}ms)`
          );

          // Clear lease refresh interval
          clearInterval(leaseRefreshInterval);

          // Update outbox: status = sent
          await db.collection('outbox').doc(requestId).update({
            status: 'sent',
            providerMessageId: result.key.id,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastError: null,
            leaseUntil: null, // Release lease
          });

          // Also persist message to thread (if threadId exists in outbox doc)
          if (threadId && firestoreAvailable && db) {
            const waMessageId = result.key.id;
            const messageRef = db.collection('threads').doc(threadId).collection('messages').doc(waMessageId);
            
            await messageRef.set({
              accountId,
              clientJid: toJid,
              direction: 'outbound',
              body: body || '',
              waMessageId,
              status: 'sent',
              tsClient: new Date().toISOString(),
              tsServer: admin.firestore.FieldValue.serverTimestamp(),
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              messageType: 'text',
            }, { merge: true });

            // Update thread
            await db.collection('threads').doc(threadId).set({
              accountId,
              clientJid: toJid,
              lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
              lastMessagePreview: (body || '').substring(0, 100),
            }, { merge: true });
          }

          // Update message doc in thread (if threadId provided)
          if (threadId) {
            try {
              const messageRef = db
                .collection('threads')
                .doc(threadId)
                .collection('messages')
                .doc(requestId);
              const messageDoc = await messageRef.get();

              if (messageDoc.exists) {
                await messageRef.update({
                  status: 'sent',
                  waMessageId: result.key.id,
                  lastError: null,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                console.log(
                  `💾 [${accountId}] Updated message doc ${requestId} in thread ${threadId}`
                );
              }
            } catch (msgError) {
              console.error(
                `⚠️  [${accountId}] Failed to update message doc ${requestId}:`,
                msgError.message
              );
            }
          }

          // Update thread lastMessageAt
          if (threadId) {
            try {
              await db
                .collection('threads')
                .doc(threadId)
                .update({
                  lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
                  lastMessageText: body || '',
                  lastMessageDirection: 'out',
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            } catch (threadError) {
              console.error(
                `⚠️  [${accountId}] Failed to update thread ${threadId}:`,
                threadError.message
              );
            }
          }
        } catch (error) {
          console.error(
            `❌ [${accountId}] Failed to send outbox message ${requestId}:`,
            error.message
          );

          const newAttemptCount = attemptCount + 1;

          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 60s
          const backoffMs = Math.min(1000 * Math.pow(2, newAttemptCount), 60000);
          const nextAttemptAt = new Date(Date.now() + backoffMs);

          // Mark as failed after MAX_RETRY_ATTEMPTS
          const newStatus = newAttemptCount >= MAX_RETRY_ATTEMPTS ? 'failed' : 'queued';

          // Clear lease refresh interval
          clearInterval(leaseRefreshInterval);

          await db
            .collection('outbox')
            .doc(requestId)
            .update({
              status: newStatus === 'failed' ? 'failed' : 'queued', // Reset to queued for retry
              attemptCount: newAttemptCount,
              nextAttemptAt: admin.firestore.Timestamp.fromDate(nextAttemptAt),
              lastError: error.message,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              leaseUntil: null, // Release lease
              ...(newStatus === 'failed' && {
                failedAt: admin.firestore.FieldValue.serverTimestamp(),
              }),
            });

          // Update message doc in thread
          if (threadId) {
            try {
              const messageRef = db
                .collection('threads')
                .doc(threadId)
                .collection('messages')
                .doc(requestId);
              const messageDoc = await messageRef.get();

              if (messageDoc.exists) {
                await messageRef.update({
                  status: newStatus,
                  lastError: error.message,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
              }
            } catch (msgError) {
              console.error(
                `⚠️  [${accountId}] Failed to update message doc ${requestId}:`,
                msgError.message
              );
            }
          }

          console.log(
            `🔄 [${accountId}] Message ${requestId} will retry in ${backoffMs}ms (attempt ${newAttemptCount}/${MAX_RETRY_ATTEMPTS})`
          );
        }
      }
    } catch (error) {
      console.error('❌ Outbox worker error:', error.message);
    }
  }, OUTBOX_WORKER_INTERVAL);

  console.log(
    `📤 Outbox worker started (interval: ${OUTBOX_WORKER_INTERVAL / 1000}s, max retries: ${MAX_RETRY_ATTEMPTS})`
  );

  // Deploy guard was already started above (with WA system initialization)
});

// Graceful shutdown
// Graceful shutdown handlers (SIGTERM and SIGINT)
// Both use the same logic: flush sessions, close sockets, release leases
async function gracefulShutdown(signal) {
  console.log(`🛑 ${signal} received, starting graceful shutdown...`);

  // Stop lease refresh
  if (leaseRefreshTimer) {
    clearInterval(leaseRefreshTimer);
  }

  // Stop long-run jobs
  if (longrunJobsModule && longrunJobsModule.stopJobs) {
    await longrunJobsModule.stopJobs();
  }

  // Flush all sessions to disk (CRITICAL: ensures sessions persist across redeploys)
  console.log('💾 Flushing all sessions to disk...');
  const flushPromises = [];
  for (const [accountId, account] of connections.entries()) {
    if (account.saveCreds) {
      flushPromises.push(
        account.saveCreds().catch(err => {
          console.error(`❌ [${accountId}] Save failed:`, err.message);
        })
      );
    }
  }
  
  // Wait for session flush with timeout (30 seconds)
  const flushTimeout = setTimeout(() => {
    console.error('⚠️  Session flush timeout after 30s, proceeding with shutdown');
  }, 30000);
  
  try {
    await Promise.allSettled(flushPromises);
    clearTimeout(flushTimeout);
  } catch (error) {
    console.error('⚠️  Session flush error:', error.message);
    clearTimeout(flushTimeout);
  }
  console.log('✅ All sessions flushed to disk');

  // Release Firestore leases
  await releaseLeases();

  // Close all sockets
  console.log('🔌 Closing all WhatsApp connections...');
  const closePromises = [];
  for (const [accountId, account] of connections.entries()) {
    if (account.sock) {
      closePromises.push(
        new Promise(resolve => {
          try {
            account.sock.end();
            resolve();
          } catch (err) {
            console.error(`❌ [${accountId}] Socket close error:`, err.message);
            resolve(); // Continue even if close fails
          }
        })
      );
    }
  }
  await Promise.allSettled(closePromises);
  console.log('✅ All sockets closed');

  console.log('✅ Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', async () => {
  await gracefulShutdown('SIGTERM');
});

process.on('SIGINT', async () => {
  await gracefulShutdown('SIGINT');
});

// Global error handler middleware (must be last)
// Prevents 502 from unhandled async errors
app.use((error, req, res, next) => {
  const traceId = `trace_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  console.error(`❌ [${traceId}] Unhandled error in ${req.method} ${req.path}:`, error.message);
  console.error(`❌ [${traceId}] Stack:`, error.stack?.substring(0, 300));
  
  // Don't expose stack in production
  const isDev = process.env.NODE_ENV !== 'production';
  
  res.status(error.status || 500).json({
    success: false,
    error: error.message || 'Internal server error',
    traceId,
    ...(isDev ? { stack: error.stack?.substring(0, 500) } : {}),
  });
});
