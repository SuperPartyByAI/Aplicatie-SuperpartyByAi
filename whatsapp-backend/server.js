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
 * @returns {string} - Deterministic accountId
 */
function generateAccountId(phone) {
  const canonical = canonicalPhone(phone);
  const hash = crypto.createHash('sha256').update(canonical).digest('hex').substring(0, 32);
  const env = process.env.NODE_ENV || 'dev';
  return `account_${env}_${hash}`;
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
    this.locks = new Map(); // accountId -> { connecting: boolean, connectedAt: timestamp }
  }

  /**
   * Try to acquire lock for connecting
   * @returns {boolean} - true if acquired, false if already connecting/connected
   */
  tryAcquire(accountId) {
    const existing = this.locks.get(accountId);

    if (existing && existing.connecting) {
      console.log(`⚠️  [${accountId}] Already connecting, skipping duplicate`);
      return false;
    }

    if (existing && existing.connectedAt && Date.now() - existing.connectedAt < 5000) {
      console.log(
        `⚠️  [${accountId}] Recently connected (${Date.now() - existing.connectedAt}ms ago), skipping duplicate`
      );
      return false;
    }

    this.locks.set(accountId, { connecting: true, connectedAt: null });
    console.log(`🔒 [${accountId}] Connection lock acquired`);
    return true;
  }

  /**
   * Mark connection as established
   */
  markConnected(accountId) {
    this.locks.set(accountId, { connecting: false, connectedAt: Date.now() });
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

// Admin token for protected endpoints
const ADMIN_TOKEN =
  process.env.ADMIN_TOKEN || 'dev-token-' + Math.random().toString(36).substring(7);
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
        'http://localhost:3000'
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

// In-memory store for active connections
const connections = new Map();
const reconnectAttempts = new Map();

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
console.log(`🔥 Firestore: ${admin.apps.length > 0 ? 'Connected' : 'Not connected'}`);
console.log(`📊 Max accounts: ${MAX_ACCOUNTS}`);

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

// Helper: Create WhatsApp connection
async function createConnection(accountId, name, phone) {
  // Try to acquire connection lock (prevent duplicate sockets)
  if (!connectionRegistry.tryAcquire(accountId)) {
    console.log(`⚠️  [${accountId}] Connection already in progress, skipping`);
    return;
  }

  // Set timeout to prevent "connecting forever"
  const CONNECTING_TIMEOUT = 60000; // 60 seconds

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

    // Fetch latest Baileys version (CRITICAL FIX)
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`✅ [${accountId}] Baileys version: ${version.join('.')}, isLatest: ${isLatest}`);

    // Use disk auth + Firestore backup
    let { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    // Wrap saveCreds to backup to Firestore
    if (USE_FIRESTORE_BACKUP && firestoreAvailable && db) {
      const originalSaveCreds = saveCreds;
      saveCreds = async () => {
        await originalSaveCreds();

        // Backup to Firestore
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
          console.error(`❌ [${accountId}] Firestore backup failed:`, error.message);
        }
      };
    }

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'warn' }), // Changed from 'silent' to see errors
      browser: ['SuperParty', 'Chrome', '2.0.0'],
      version, // CRITICAL: Use fetched version
      syncFullHistory: false, // Don't sync full history on connect
      markOnlineOnConnect: true,
      getMessage: async key => {
        // Return undefined to indicate message not found in cache
        return undefined;
      },
    });

    const account = {
      id: accountId,
      name,
      phone,
      status: 'connecting',
      qrCode: null,
      pairingCode: null,
      sock,
      createdAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
    };

    connections.set(accountId, account);

    // Set timeout to prevent "connecting forever"
    account.connectingTimeout = setTimeout(() => {
      console.log(`⏰ [${accountId}] Connecting timeout (60s), transitioning to disconnected`);
      const acc = connections.get(accountId);
      if (acc && acc.status === 'connecting') {
        acc.status = 'disconnected';
        acc.lastError = 'Connection timeout - no progress after 60s';
        saveAccountToFirestore(accountId, {
          status: 'disconnected',
          lastError: 'Connection timeout',
        }).catch(err => console.error(`❌ [${accountId}] Timeout save failed:`, err));
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

      console.log(`🔔 [${accountId}] Connection update: ${connection || 'qr'}`);

      if (qr) {
        console.log(`📱 [${accountId}] QR Code generated (length: ${qr.length})`);

        try {
          const qrDataURL = await Sentry.startSpan(
            { op: 'whatsapp.qr.generate', name: 'Generate QR Code' },
            () => QRCode.toDataURL(qr)
          );
          account.qrCode = qrDataURL;
          account.status = 'qr_ready';
          account.lastUpdate = new Date().toISOString();

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
        console.log(`✅ [${accountId}] connection.update: open`);
        console.log(`✅ [${accountId}] Connected! Session persisted at: ${sessionPath}`);

        // Clear connecting timeout
        if (account.connectingTimeout) {
          clearTimeout(account.connectingTimeout);
          account.connectingTimeout = null;
        }

        // Mark connection as established in registry
        connectionRegistry.markConnected(accountId);
        account.status = 'connected';
        account.qrCode = null;
        account.phone = sock.user?.id?.split(':')[0] || phone;
        account.waJid = sock.user?.id;
        account.lastUpdate = new Date().toISOString();

        // Reset reconnect attempts
        reconnectAttempts.delete(accountId);

        // Invalidate accounts cache so frontend sees connected status
        if (featureFlags.isEnabled('API_CACHING')) {
          await cache.delete('whatsapp:accounts');
          console.log(`🗑️  [${accountId}] Cache invalidated for connection update`);
        }

        // Save to Firestore
        await saveAccountToFirestore(accountId, {
          status: 'connected',
          waJid: account.waJid,
          phoneE164: account.phone,
          lastConnectedAt: admin.firestore.FieldValue.serverTimestamp(),
          qrCode: null,
        });
      }

      if (connection === 'close') {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        const reason = lastDisconnect?.error?.output?.statusCode || 'unknown';
        const errorMsg = lastDisconnect?.error?.message || 'No error message';

        console.log(`🔌 [${accountId}] connection.update: close`);
        console.log(`🔌 [${accountId}] Reason code: ${reason}, Reconnect: ${shouldReconnect}`);
        console.log(`🔌 [${accountId}] Current status: ${account.status}`);

        // Define explicit cleanup reasons (only these trigger account deletion)
        const EXPLICIT_CLEANUP_REASONS = [
          DisconnectReason.loggedOut,
          DisconnectReason.badSession,
          DisconnectReason.unauthorized,
        ];

        const isExplicitCleanup = EXPLICIT_CLEANUP_REASONS.includes(reason);

        // CRITICAL: Preserve account during pairing phase
        // Don't delete if: status is pairing-related AND reason is transient (not explicit cleanup)
        const isPairingPhase = ['qr_ready', 'awaiting_scan', 'pairing', 'connecting'].includes(
          account.status
        );

        if (isPairingPhase && !isExplicitCleanup) {
          console.log(
            `⏸️  [${accountId}] Pairing phase (${account.status}), preserving account (reason: ${reason})`
          );
          account.status = 'awaiting_scan'; // Mark as waiting for scan
          account.lastUpdate = new Date().toISOString();

          await saveAccountToFirestore(accountId, {
            status: 'awaiting_scan',
            lastDisconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastDisconnectReason: 'qr_waiting_scan',
            lastDisconnectCode: reason,
          });

          // Release lock to allow reconnect if needed, but keep account in Map
          connectionRegistry.release(accountId);

          // Don't delete, don't reconnect - just wait for user to scan QR
          return;
        }

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

            // Release lock before reconnect
            connectionRegistry.release(accountId);

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
          console.log(`❌ [${accountId}] Explicit cleanup (${reason}), deleting account`);
          account.status = 'needs_qr';

          await saveAccountToFirestore(accountId, {
            status: 'needs_qr',
          });

          await logIncident(accountId, 'logged_out', {
            reason: reason,
            requiresQR: true,
          });

          // Clean up and regenerate
          connections.delete(accountId);
          connectionRegistry.release(accountId);

          setTimeout(() => {
            createConnection(accountId, account.name, account.phone);
          }, 5000);
        }
      }
    });

    // Creds update handler
    sock.ev.on('creds.update', saveCreds);

    // Flush outbox on connect
    sock.ev.on('connection.update', async update => {
      if (update.connection === 'open') {
        console.log(`🔄 [${accountId}] Connection open, flushing outbox...`);

        if (!firestoreAvailable || !db) {
          console.log(`⚠️  [${accountId}] Firestore not available, skipping outbox flush`);
          return;
        }

        try {
          const outboxSnapshot = await db
            .collection('outbox')
            .where('accountId', '==', accountId)
            .where('status', '==', 'queued')
            .get();

          console.log(`📤 [${accountId}] Found ${outboxSnapshot.size} queued messages`);

          for (const doc of outboxSnapshot.docs) {
            const data = doc.data();

            try {
              const jid = data.toJid;
              const result = await sock.sendMessage(jid, data.payload);

              await db.collection('outbox').doc(doc.id).update({
                status: 'sent',
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                providerMessageId: result.key.id,
              });

              console.log(`✅ [${accountId}] Flushed message ${doc.id}`);
            } catch (error) {
              console.error(`❌ [${accountId}] Failed to flush ${doc.id}:`, error.message);

              await db
                .collection('outbox')
                .doc(doc.id)
                .update({
                  status: 'failed',
                  error: error.message,
                  attempts: (data.attempts || 0) + 1,
                });
            }
          }
        } catch (error) {
          console.error(`❌ [${accountId}] Outbox flush error:`, error.message);
        }
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

            // Save to Firestore
            if (firestoreAvailable && db) {
              try {
                const threadId = from;
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

                // Update thread
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
                console.error(`❌ [${accountId}] Error details:`, JSON.stringify(error, null, 2));
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

    // Messages update handler (for status updates)
    sock.ev.on('messages.update', updates => {
      console.log(`🔄 [${accountId}] messages.update EVENT: ${updates.length} updates`);
      for (const update of updates) {
        console.log(`  - Message ${update.key.id}: ${JSON.stringify(update.update)}`);
      }
    });

    // Message receipt handler
    sock.ev.on('message-receipt.update', receipts => {
      console.log(`📬 [${accountId}] message-receipt.update EVENT: ${receipts.length} receipts`);
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

// Health endpoint
// Root endpoint for basic connectivity test
app.get('/', (req, res) => {
  res.json({
    service: 'SuperParty WhatsApp Backend',
    version: VERSION,
    commit: COMMIT_HASH,
    status: 'online',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /',
      'GET /health',
      'GET /api/whatsapp/accounts',
      'POST /api/whatsapp/add-account',
      'GET /api/whatsapp/qr/:accountId',
    ],
  });
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

function checkStaleConnections() {
  const now = Date.now();
  const staleAccounts = [];

  for (const [accountId, account] of connections.entries()) {
    if (account.status !== 'connected') continue;

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

app.get('/health', async (req, res) => {
  const connected = Array.from(connections.values()).filter(c => c.status === 'connected').length;
  const connecting = Array.from(connections.values()).filter(
    c => c.status === 'connecting' || c.status === 'reconnecting'
  ).length;
  const needsQr = Array.from(connections.values()).filter(
    c => c.status === 'needs_qr' || c.status === 'qr_ready'
  ).length;
  const disconnected = Array.from(connections.values()).filter(
    c => c.status === 'disconnected'
  ).length;

  // Get commit from config if env var not set
  if (!COMMIT_HASH && firestoreAvailable) {
    try {
      const configDoc = await db.doc('wa_metrics/longrun/config/current').get();
      if (configDoc.exists) {
        COMMIT_HASH = configDoc.data().commitHash || 'unknown';
      } else {
        COMMIT_HASH = 'unknown';
      }
    } catch (e) {
      COMMIT_HASH = 'unknown';
    }
  } else if (!COMMIT_HASH) {
    COMMIT_HASH = 'unknown';
  }

  const fingerprint = {
    version: VERSION,
    commit: COMMIT_HASH,
    bootTimestamp: BOOT_TIMESTAMP,
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || 'unknown',
  };

  // Test Firestore connection
  let firestoreStatus = 'disconnected';
  if (firestoreAvailable) {
    try {
      await db
        .collection('_health_check')
        .doc('test')
        .set({ timestamp: admin.firestore.FieldValue.serverTimestamp() });
      firestoreStatus = 'connected';
    } catch (error) {
      console.error('❌ Firestore health check failed:', error.message);
      firestoreStatus = 'error';
    }
  } else {
    firestoreStatus = 'not_configured';
  }

  // Aggregate lastError/lastDisconnectReason by status
  const errorsByStatus = {};
  for (const account of connections.values()) {
    const status = account.status;
    if (!errorsByStatus[status]) {
      errorsByStatus[status] = [];
    }
    if (account.lastError) {
      errorsByStatus[status].push(account.lastError);
    }
  }

  res.json({
    status: 'healthy',
    ...fingerprint,
    mode: 'single', // Single worker mode (no multi-worker coordination yet)
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
    accounts: {
      total: connections.size,
      connected,
      connecting,
      disconnected,
      needs_qr: needsQr,
      max: MAX_ACCOUNTS,
    },
    firestore: {
      status: firestoreStatus,
      policy: {
        collections: [
          'accounts - account metadata and status',
          'wa_sessions - encrypted session files',
          'threads - conversation threads',
          'threads/{threadId}/messages - messages per thread',
          'outbox - queued outbound messages',
          'wa_outbox - WhatsApp-specific outbox',
        ],
        ownership: 'Single worker owns all accounts (no lease coordination yet)',
        lease: 'Not implemented - future: claimedBy, claimedAt, leaseUntil fields',
      },
    },
    lock: {
      owner: process.env.RAILWAY_DEPLOYMENT_ID || process.env.HOSTNAME || 'unknown',
      expiresAt: null, // Not implemented yet
      note: 'Lease/lock system not yet implemented - single worker mode',
    },
    errorsByStatus,
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

// Helper function to call OpenAI API
function callOpenAI(messages, maxTokens = 500) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return reject(new Error('OPENAI_API_KEY not configured'));
    }

    const postData = JSON.stringify({
      model: 'gpt-3.5-turbo',
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
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required',
      });
    }

    const response = await callOpenAI(messages, 500);
    const duration = Date.now() - startTime;
    const message = response.choices[0]?.message?.content || '';

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

    const response = await callOpenAI(messages, 300);
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

    const response = await callOpenAI(messages, 400);
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
  try {
    // Try cache first (if enabled)
    if (featureFlags.isEnabled('API_CACHING')) {
      const cacheKey = 'whatsapp:accounts';
      const cached = await cache.get(cacheKey);

      if (cached) {
        return res.json({ success: true, accounts: cached, cached: true });
      }
    }

    const accounts = [];
    connections.forEach((conn, id) => {
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

    // Cache if enabled
    if (featureFlags.isEnabled('API_CACHING')) {
      const ttl = featureFlags.get('CACHE_TTL_SECONDS', 30) * 1000;
      await cache.set('whatsapp:accounts', accounts, ttl);
    }

    res.json({ success: true, accounts, cached: false });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
  try {
    const { name, phone } = req.body;

    if (connections.size >= MAX_ACCOUNTS) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${MAX_ACCOUNTS} accounts reached`,
      });
    }

    // Generate deterministic accountId based on canonicalized phone number
    const canonicalPhoneNum = canonicalPhone(phone);
    const accountId = generateAccountId(canonicalPhoneNum);

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

    // Create connection (async, will emit QR later)
    createConnection(accountId, name, phone).catch(err => {
      console.error(`❌ [${accountId}] Failed to create:`, err.message);
      Sentry.captureException(err, {
        tags: { accountId, operation: 'create_connection' },
        extra: { name, phone: maskPhone(canonicalPhoneNum) },
      });
    });

    // Return immediately with connecting status
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
  try {
    const { accountId } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const account = connections.get(accountId);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
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
      }
    });
  } catch (error) {
    console.error('❌ Update account name error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Regenerate QR
app.post('/api/whatsapp/regenerate-qr/:accountId', accountLimiter, async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = connections.get(accountId);

    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    // Clean up old connection
    if (account.sock) {
      try {
        account.sock.end();
      } catch (e) {
        // Ignore
      }
    }

    connections.delete(accountId);
    reconnectAttempts.delete(accountId);

    // Create new connection
    await createConnection(accountId, account.name, account.phone);

    res.json({ success: true, message: 'QR regeneration started' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send message
app.post('/api/whatsapp/send-message', messageLimiter, async (req, res) => {
  try {
    const { accountId, to, message } = req.body;
    const account = connections.get(accountId);

    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    if (account.status !== 'connected') {
      // Queue message in Firestore
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.collection('outbox').doc(messageId).set({
        accountId,
        toJid: to,
        payload: { message },
        body: message,
        status: 'queued',
        attemptCount: 0,
        nextAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.json({ success: true, queued: true, messageId });
    }

    const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    const result = await account.sock.sendMessage(jid, { text: message });

    res.json({ success: true, messageId: result.key.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get messages
app.get('/api/whatsapp/messages', async (req, res) => {
  try {
    const { accountId, threadId, limit = 50 } = req.query;

    let query = db.collection('threads');

    if (accountId) {
      query = query.where('accountId', '==', accountId);
    }

    const threadsSnapshot = await query.limit(parseInt(limit)).get();
    const threads = [];

    for (const threadDoc of threadsSnapshot.docs) {
      const threadData = threadDoc.data();
      const messagesSnapshot = await threadDoc.ref
        .collection('messages')
        .orderBy('createdAt', 'desc')
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
  try {
    const { id } = req.params;
    const account = connections.get(id);

    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    // Close connection
    if (account.sock) {
      try {
        account.sock.end();
      } catch (e) {
        // Ignore
      }
    }

    connections.delete(id);
    reconnectAttempts.delete(id);

    // Update Firestore
    await saveAccountToFirestore(id, {
      status: 'deleted',
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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

    if (data.status !== 'connected') {
      console.log(`⚠️  [${accountId}] Account status is ${data.status}, skipping restore`);
      return;
    }

    await restoreAccount(accountId, data);
  } catch (error) {
    console.error(`❌ [${accountId}] Single restore failed:`, error.message);
  }
}

// Extract account restore logic
async function restoreAccount(accountId, data) {
  const CONNECTING_TIMEOUT = 60000; // 60 seconds - same as createConnection

  try {
    console.log(`BOOT [${accountId}] Starting restore... (status: ${data.status}, USE_FIRESTORE_BACKUP: ${USE_FIRESTORE_BACKUP})`);

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
      console.log(`⚠️  [${accountId}] No disk session and Firestore restore not available (USE_FIRESTORE_BACKUP: ${USE_FIRESTORE_BACKUP}, firestoreAvailable: ${firestoreAvailable}), skipping`);
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
      browser: ['SuperParty', 'Chrome', '2.0.0'],
      logger: pino({ level: 'warn' }),
      syncFullHistory: false,
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

    // Set timeout to prevent "connecting forever" - CRITICAL FIX
    account.connectingTimeout = setTimeout(() => {
      console.log(`⏰ [${accountId}] Connecting timeout (60s), transitioning to disconnected`);
      const acc = connections.get(accountId);
      if (acc && acc.status === 'connecting') {
        acc.status = 'disconnected';
        acc.lastError = 'Connection timeout - no progress after 60s';
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

      if (qr) {
        console.log(`📱 [${accountId}] QR Code generated (length: ${qr.length})`);

        try {
          const qrDataURL = await QRCode.toDataURL(qr);
          account.qrCode = qrDataURL;
          account.status = 'qr_ready';
          account.lastUpdate = new Date().toISOString();

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
          console.log(`❌ [${accountId}] Explicit cleanup (${reason}), deleting account`);
          account.status = 'needs_qr';

          await saveAccountToFirestore(accountId, {
            status: 'needs_qr',
          });

          connections.delete(accountId);

          setTimeout(() => {
            createConnection(accountId, account.name, account.phone);
          }, 5000);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Flush outbox on connect
    sock.ev.on('connection.update', async update => {
      if (update.connection === 'open') {
        console.log(`🔄 [${accountId}] Connection open, flushing outbox...`);

        if (!firestoreAvailable || !db) {
          console.log(`⚠️  [${accountId}] Firestore not available, skipping outbox flush`);
          return;
        }

        try {
          const outboxSnapshot = await db
            .collection('outbox')
            .where('accountId', '==', accountId)
            .where('status', '==', 'queued')
            .get();

          console.log(`📤 [${accountId}] Found ${outboxSnapshot.size} queued messages`);

          for (const doc of outboxSnapshot.docs) {
            const data = doc.data();

            try {
              const jid = data.toJid;
              const result = await sock.sendMessage(jid, data.payload);

              await db.collection('outbox').doc(doc.id).update({
                status: 'sent',
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                providerMessageId: result.key.id,
              });

              console.log(`✅ [${accountId}] Flushed message ${doc.id}`);
            } catch (error) {
              console.error(`❌ [${accountId}] Failed to flush ${doc.id}:`, error.message);

              await db
                .collection('outbox')
                .doc(doc.id)
                .update({
                  status: 'failed',
                  error: error.message,
                  attempts: (data.attempts || 0) + 1,
                });
            }
          }
        } catch (error) {
          console.error(`❌ [${accountId}] Outbox flush error:`, error.message);
        }
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
                const threadId = from;
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

    // Messages update handler (for status updates)
    sock.ev.on('messages.update', updates => {
      console.log(`🔄 [${accountId}] messages.update EVENT: ${updates.length} updates`);
      for (const update of updates) {
        console.log(`  - Message ${update.key.id}: ${JSON.stringify(update.update)}`);
      }
    });

    // Message receipt handler
    sock.ev.on('message-receipt.update', receipts => {
      console.log(`📬 [${accountId}] message-receipt.update EVENT: ${receipts.length} receipts`);
    });

    connections.set(accountId, account);
    console.log(`✅ [${accountId}] Restored to memory with full event handlers`);
  } catch (error) {
    console.error(`❌ [${accountId}] Restore failed:`, error.message);
  }
}

async function restoreAccountsFromFirestore() {
  if (!firestoreAvailable) {
    console.log('⚠️  Firestore not available, skipping account restore');
    return;
  }

  try {
    console.log('🔄 Restoring accounts from Firestore...');

    // Get ONLY connected accounts (skip dead sessions)
    const snapshot = await db.collection('accounts')
      .where('status', '==', 'connected')
      .get();

    console.log(`📦 Found ${snapshot.size} connected accounts in Firestore`);

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const accountId = doc.id;

      console.log(`🔄 [${accountId}] Restoring connected account (${data.name || 'N/A'})`);
      await restoreAccount(accountId, data);
    }

    console.log(`✅ Account restore complete: ${connections.size} accounts loaded`);

    // Start connections for restored accounts (P1B fix)
    console.log('🔌 Starting connections for restored accounts...');
    for (const [accountId, account] of connections.entries()) {
      // Only create connection if NOT already connected (no socket)
      if (!account.sock && (account.status === 'connected' || account.status === 'connecting')) {
        console.log(`🔌 [${accountId}] Starting connection (no socket)...`);
        try {
          await createConnection(accountId, account.name, account.phone);
        } catch (error) {
          console.error(`❌ [${accountId}] Failed to start connection:`, error.message);
        }
      } else if (account.sock) {
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

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health`);
  console.log(`📱 Accounts: http://localhost:${PORT}/api/whatsapp/accounts`);
  console.log(`🚀 Railway deployment ready!\n`);

  // Restore accounts after server starts
  await restoreAccountsFromFirestore();

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
  
  setInterval(async () => {
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
      console.log(`📤 Outbox worker: processing ${outboxSnapshot.size} queued messages`);

      for (const doc of outboxSnapshot.docs) {
        const data = doc.data();
        const requestId = doc.id;
        const messageStartTime = Date.now();
        const { accountId, toJid, threadId, payload, body, attemptCount = 0, providerMessageId } = data;

        // IDEMPOTENCY CHECK: Skip if already sent
        if (providerMessageId) {
          console.log(`✅ [${accountId}] Message ${requestId} already sent (providerMessageId: ${providerMessageId}), skipping`);
          await db.collection('outbox').doc(requestId).update({
            status: 'sent',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
            console.log(`❌ [${accountId}] Message ${requestId} failed after ${MAX_RETRY_ATTEMPTS} attempts (account not connected)`);
            await db.collection('outbox').doc(requestId).update({
              status: 'failed',
              attemptCount: newAttemptCount,
              lastError: 'Account not connected after max retries',
              failedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            // Update message doc in thread
            if (threadId) {
              try {
                const messageRef = db.collection('threads').doc(threadId).collection('messages').doc(requestId);
                const messageDoc = await messageRef.get();
                if (messageDoc.exists) {
                  await messageRef.update({
                    status: 'failed',
                    lastError: 'Account not connected after max retries',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  });
                }
              } catch (msgError) {
                console.error(`⚠️  [${accountId}] Failed to update message doc ${requestId}:`, msgError.message);
              }
            }
            continue;
          }
          
          // Retry later with exponential backoff
          const backoffMs = Math.min(1000 * Math.pow(2, attemptCount), 60000);
          const nextAttemptAt = new Date(Date.now() + backoffMs);
          
          await db.collection('outbox').doc(requestId).update({
            attemptCount: newAttemptCount,
            nextAttemptAt: admin.firestore.Timestamp.fromDate(nextAttemptAt),
            lastError: 'Account not connected',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          
          console.log(`🔄 [${accountId}] Message ${requestId} will retry in ${backoffMs}ms (attempt ${newAttemptCount}/${MAX_RETRY_ATTEMPTS})`);
          continue;
        }

        try {
          // Update status to sending
          await db.collection('outbox').doc(requestId).update({
            status: 'sending',
            attemptCount: attemptCount + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Send message via Baileys
          const messagePayload = payload || { text: body };
          const sendStartTime = Date.now();
          const result = await account.sock.sendMessage(toJid, messagePayload);
          const sendDuration = Date.now() - sendStartTime;
          const totalDuration = Date.now() - messageStartTime;

          console.log(`✅ [${accountId}] Sent outbox message ${requestId}, waMessageId: ${result.key.id} (WhatsApp: ${sendDuration}ms, total: ${totalDuration}ms)`);

          // Update outbox: status = sent
          await db.collection('outbox').doc(requestId).update({
            status: 'sent',
            providerMessageId: result.key.id,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastError: null,
          });

          // Update message doc in thread (if threadId provided)
          if (threadId) {
            try {
              const messageRef = db.collection('threads').doc(threadId).collection('messages').doc(requestId);
              const messageDoc = await messageRef.get();
              
              if (messageDoc.exists) {
                await messageRef.update({
                  status: 'sent',
                  waMessageId: result.key.id,
                  lastError: null,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                console.log(`💾 [${accountId}] Updated message doc ${requestId} in thread ${threadId}`);
              }
            } catch (msgError) {
              console.error(`⚠️  [${accountId}] Failed to update message doc ${requestId}:`, msgError.message);
            }
          }

          // Update thread lastMessageAt
          if (threadId) {
            try {
              await db.collection('threads').doc(threadId).update({
                lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
                lastMessageText: body || '',
                lastMessageDirection: 'out',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            } catch (threadError) {
              console.error(`⚠️  [${accountId}] Failed to update thread ${threadId}:`, threadError.message);
            }
          }

        } catch (error) {
          console.error(`❌ [${accountId}] Failed to send outbox message ${requestId}:`, error.message);

          const newAttemptCount = attemptCount + 1;
          
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 60s
          const backoffMs = Math.min(1000 * Math.pow(2, newAttemptCount), 60000);
          const nextAttemptAt = new Date(Date.now() + backoffMs);
          
          // Mark as failed after MAX_RETRY_ATTEMPTS
          const newStatus = newAttemptCount >= MAX_RETRY_ATTEMPTS ? 'failed' : 'queued';
          
          await db.collection('outbox').doc(requestId).update({
            status: newStatus,
            attemptCount: newAttemptCount,
            nextAttemptAt: admin.firestore.Timestamp.fromDate(nextAttemptAt),
            lastError: error.message,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(newStatus === 'failed' && { failedAt: admin.firestore.FieldValue.serverTimestamp() }),
          });

          // Update message doc in thread
          if (threadId) {
            try {
              const messageRef = db.collection('threads').doc(threadId).collection('messages').doc(requestId);
              const messageDoc = await messageRef.get();
              
              if (messageDoc.exists) {
                await messageRef.update({
                  status: newStatus,
                  lastError: error.message,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
              }
            } catch (msgError) {
              console.error(`⚠️  [${accountId}] Failed to update message doc ${requestId}:`, msgError.message);
            }
          }

          console.log(`🔄 [${accountId}] Message ${requestId} will retry in ${backoffMs}ms (attempt ${newAttemptCount}/${MAX_RETRY_ATTEMPTS})`);
        }
      }
    } catch (error) {
      console.error('❌ Outbox worker error:', error.message);
    }
  }, OUTBOX_WORKER_INTERVAL);

  console.log(`📤 Outbox worker started (interval: ${OUTBOX_WORKER_INTERVAL / 1000}s, max retries: ${MAX_RETRY_ATTEMPTS})`);

  // Initialize long-run schema and evidence endpoints
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

    // Initialize WA system with lock acquisition (BEFORE any Baileys init)
    console.log('🔒 Initializing WA system with lock acquisition...');
    const waInitResult = await waBootstrap.initializeWASystem(db);
    console.log(`🔒 WA system initialized: mode=${waInitResult.mode}`);

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
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');

  // Stop long-run jobs first
  if (longrunJobsModule && longrunJobsModule.stopJobs) {
    await longrunJobsModule.stopJobs();
  }

  connections.forEach((account, id) => {
    if (account.sock) {
      try {
        account.sock.end();
      } catch (e) {
        // Ignore
      }
    }
  });
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing connections...');

  // Stop lease refresh
  if (leaseRefreshTimer) {
    clearInterval(leaseRefreshTimer);
  }

  // Release leases
  await releaseLeases();

  // Stop long-run jobs first
  if (longrunJobsModule && longrunJobsModule.stopJobs) {
    await longrunJobsModule.stopJobs();
  }

  connections.forEach((account, id) => {
    if (account.sock) {
      try {
        account.sock.end();
      } catch (e) {
        // Ignore
      }
    }
  });
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');

  // Stop lease refresh
  if (leaseRefreshTimer) {
    clearInterval(leaseRefreshTimer);
  }

  // Release leases
  await releaseLeases();

  // Stop long-run jobs
  if (longrunJobsModule && longrunJobsModule.stopJobs) {
    await longrunJobsModule.stopJobs();
  }

  connections.forEach((account, id) => {
    if (account.sock) {
      try {
        account.sock.end();
      } catch (e) {
        // Ignore
      }
    }
  });
  process.exit(0);
});
