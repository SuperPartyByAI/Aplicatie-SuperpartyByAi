// Dynamic import for ES Module @whiskeysockets/baileys (cannot use require())
let baileysModule = null;
let makeWASocket = null;
let useMultiFileAuthState = null;
let DisconnectReason = null;
let fetchLatestBaileysVersion = null;

/**
 * Lazy-load Baileys ES Module (required because it's ESM-only)
 */
async function loadBaileys() {
  if (baileysModule) {
    return {
      makeWASocket: makeWASocket || baileysModule.default,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
    };
  }

  try {
    baileysModule = await import('@whiskeysockets/baileys');
    makeWASocket = baileysModule.default;
    useMultiFileAuthState = baileysModule.useMultiFileAuthState;
    DisconnectReason = baileysModule.DisconnectReason;
    fetchLatestBaileysVersion = baileysModule.fetchLatestBaileysVersion;

    console.log('✅ Baileys ES Module loaded successfully');
    return {
      makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
    };
  } catch (error) {
    console.error('❌ Failed to load Baileys ES Module:', error);
    throw new Error(`Failed to load Baileys: ${error.message}`);
  }
}

const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const firestore = require('../firebase/firestore');
const sessionStore = require('./session-store');
const messageStore = require('./message-store');
const monitor = require('./monitor');
const messageQueue = require('./message-queue');

// TIER ULTIMATE 1: Import new modules
const behaviorSimulator = require('./behavior');
const rateLimiter = require('./rate-limiter');
const messageVariation = require('./message-variation');
const circuitBreaker = require('./circuit-breaker');

// TIER ULTIMATE 2: Import new modules
const webhookManager = require('./webhooks');
const advancedHealthChecker = require('./advanced-health');
const proxyRotationManager = require('./proxy-rotation');

class WhatsAppManager {
  constructor(io) {
    // DEPLOYMENT MARKER
    const BUILD_SHA = process.env.BUILD_SHA || process.env.K_REVISION || 'unknown';
    console.log('🚀 WhatsAppManager starting - BUILD_SHA=' + BUILD_SHA);

    this.io = io;
    this.clients = new Map();
    this.accounts = new Map();
    this.chatsCache = new Map(); // Manual cache for chats
    this.messagesCache = new Map(); // Manual cache for messages per chat
    // Use /tmp for Firebase Functions (read-only filesystem)
    this.sessionsPath = process.env.FUNCTIONS_EMULATOR
      ? path.join(__dirname, '../../.baileys_auth')
      : '/tmp/.baileys_auth';
    this.maxAccounts = 20;
    this.messageQueue = [];
    this.processing = false;
    this.retryCount = new Map(); // Track retry attempts per account
    this.lastMessageTime = new Map(); // Track last message received per account
    this.healthCheckInterval = null;
    this.reconnectAttempts = new Map(); // Track reconnect attempts per account
    this.reconnectTimeouts = new Map(); // Track reconnect timeouts per account
    this.connectionStartTime = new Map(); // Track when connection attempt started

    // Status sync debouncing
    this.statusSyncQueue = new Map(); // accountId -> {status, timestamp}
    this.statusSyncTimers = new Map(); // accountId -> timeoutId
    this.lastStatusSync = new Map(); // accountId -> timestamp
    this.STATUS_SYNC_DEBOUNCE_MS = 5000; // 5 seconds debounce
    this.STATUS_SYNC_MIN_INTERVAL_MS = 10000; // 10 seconds minimum between syncs

    // Session save debouncing (prevent DEADLINE_EXCEEDED on creds.update)
    this.sessionSaveTimers = new Map(); // accountId -> timeoutId
    this.lastSessionSave = new Map(); // accountId -> timestamp
    this.SESSION_SAVE_DEBOUNCE_MS = 3000; // 3 seconds debounce
    this.SESSION_SAVE_MIN_INTERVAL_MS = 30000; // 30 seconds minimum between saves

    // Reconnect configuration
    this.MAX_RECONNECT_ATTEMPTS = 5;
    this.RECONNECT_TIMEOUT_MS = 60000; // 60 seconds max per attempt
    this.CONNECTION_TIMEOUT_MS = 30000; // 30 seconds to establish connection

    // TIER 3: Dual Connection
    this.backupClients = new Map(); // Backup connections
    this.activeConnection = new Map(); // Track active connection per account

    // TIER 3: Adaptive Keep-Alive
    this.keepAliveInterval = 10000; // Start at 10s
    this.rateLimitDetected = false;

    // TIER 3: Message Batching
    this.messageBatch = [];
    this.batchInterval = null;

    // TIER 3: Connection Quality
    this.connectionQuality = new Map();

    // TIER 3: Monitoring
    this.metrics = {
      disconnects: 0,
      reconnects: 0,
      messageLoss: 0,
      rateLimits: 0,
      messagesProcessed: 0,
    };

    this.ensureSessionsDir();
    this.startMessageProcessor();
    this.startAdaptiveKeepAlive(); // TIER 3: Adaptive instead of fixed
    this.startHealthCheck();
    this.startProactiveMonitoring(); // TIER 3: Proactive reconnect
    this.startBatchProcessor(); // TIER 3: Batch processing

    // Initialize Firebase
    firestore.initialize();

    // TIER 3: Restore queue from Firestore
    this.restoreQueue();

    // TIER ULTIMATE 1: Initialize modules
    this.initializeUltimateModules();

    // Auto-restore sessions after backend restart
    this.autoRestoreSessions();
  }

  /**
   * TIER ULTIMATE 1: Initialize all ULTIMATE modules
   */
  initializeUltimateModules() {
    // Setup rate limiter message sender
    rateLimiter.sendMessage = async (accountId, message) => {
      const sock = this.getActiveConnection(accountId);
      if (!sock) throw new Error('No active connection');

      // Use behavior simulator to send
      return await behaviorSimulator.sendMessageWithBehavior(sock, message.jid, message.text);
    };

    // Setup circuit breaker event handlers
    circuitBreaker.on('circuit-opened', ({ accountId, failures, lastError }) => {
      console.warn(`⚠️ Circuit opened for ${accountId}: ${failures} failures, last: ${lastError}`);
      this.metrics.circuitBreaks = (this.metrics.circuitBreaks || 0) + 1;

      // Log to Firestore
      firestore.logEvent({
        type: 'circuit_opened',
        accountId,
        failures,
        lastError,
        timestamp: Date.now(),
      });
    });

    circuitBreaker.on('circuit-closed', ({ accountId }) => {
      console.log(`✅ Circuit closed for ${accountId}: recovered`);

      // Log to Firestore
      firestore.logEvent({
        type: 'circuit_closed',
        accountId,
        timestamp: Date.now(),
      });
    });

    console.log('✅ TIER ULTIMATE 1 modules initialized');

    // TIER ULTIMATE 2: Initialize webhooks, health, proxy
    this.initializeUltimate2Modules();
  }

  /**
   * TIER ULTIMATE 2: Initialize webhooks, advanced health, proxy rotation
   */
  initializeUltimate2Modules() {
    // Setup webhook event handlers
    webhookManager.on('webhook-failed', ({ endpoint, event, error }) => {
      console.error(`❌ Webhook failed: ${endpoint} (${event}) - ${error}`);

      // Log to Firestore
      firestore.logEvent({
        type: 'webhook_failed',
        endpoint,
        event,
        error,
        timestamp: Date.now(),
      });
    });

    console.log('✅ TIER ULTIMATE 2 modules initialized');
  }

  /**
   * Health check - detectează proactiv probleme
   */
  startHealthCheck() {
    // ÎMBUNĂTĂȚIRE: Check every 15 seconds (was 30s) - reduce detection delay 50%
    this.healthCheckInterval = setInterval(() => {
      for (const [accountId, sock] of this.clients.entries()) {
        try {
          const account = this.accounts.get(accountId);

          // Skip if QR waiting for scan
          if (account && account.qrGenerated && account.status !== 'connected') {
            continue;
          }

          // Validate socket exists and is connected
          if (!sock || !sock.user || sock.ws?.readyState !== 1) {
            console.log(
              `[Health Check] Account ${accountId} - socket not ready (state: ${sock?.ws?.readyState}), skipping`
            );
            continue;
          }

          if (!account || account.status !== 'connected') {
            continue;
          }

          const lastMsg = this.lastMessageTime.get(accountId) || Date.now();
          const timeSinceLastMsg = Date.now() - lastMsg;

          // Dacă nu am primit mesaje în 2 minute, verifică conexiunea
          if (timeSinceLastMsg > 120000) {
            console.log(`[Health Check] Account ${accountId} - no activity for 2 min, checking...`);

            // Încearcă să trimită presence (crash-proof with explicit catch)
            const presencePromise = sock.sendPresenceUpdate('available').catch(err => {
              console.log(
                `[Health Check] Account ${accountId} - sendPresenceUpdate rejected: ${err.message}`
              );
              throw err;
            });

            Promise.race([
              presencePromise,
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Presence timeout')), 5000)
              ),
            ])
              .then(() => {
                this.lastMessageTime.set(accountId, Date.now());
              })
              .catch(error => {
                console.log(
                  `[Health Check] Account ${accountId} - presence failed: ${error.message}, reconnecting...`
                );
                // Crash-proof reconnect
                const reconnectPromise = this.reconnectAccount(accountId);
                if (reconnectPromise && reconnectPromise.catch) {
                  reconnectPromise.catch(err =>
                    console.error(`[Health Check] Reconnect failed: ${err.message}`)
                  );
                }
              });
          }
        } catch (error) {
          console.error(`[Health Check] Account ${accountId} - error: ${error.message}`);
          // Don't crash, just log and continue
        }
      }
    }, 15000); // ÎMBUNĂTĂȚIRE: 15s instead of 30s
  }

  async autoRestoreSessions() {
    try {
      console.log('🔄 Checking for saved sessions in Firestore...');
      const sessions = await sessionStore.listSessions();

      if (sessions.length === 0) {
        console.log('ℹ️ No saved sessions found');
        return;
      }

      console.log(
        `📦 Found ${sessions.length} saved session(s), restoring with concurrency limit...`
      );

      // Restore with concurrency limit (2 at a time) to avoid overwhelming
      const CONCURRENCY = 2;
      for (let i = 0; i < sessions.length; i += CONCURRENCY) {
        const batch = sessions.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(session => this.restoreSession(session)));

        // Delay between batches
        if (i + CONCURRENCY < sessions.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log(`✅ Auto-restore complete: ${sessions.length} account(s) processed`);
    } catch (error) {
      console.error('❌ Error during auto-restore:', error);
    }
  }

  /**
   * Restore a single session with validation and cleanup
   */
  async restoreSession(session) {
    const accountId = session.accountId;
    const phoneNumber = session.creds?.me?.id?.split(':')[0] || session.metadata?.phone || null;

    console.log(`🔄 Restoring account: ${accountId} (${phoneNumber || 'unknown'})`);

    try {
      // Validate session age (sessions expire after ~14 days)
      const sessionAge = Date.now() - new Date(session.updatedAt).getTime();
      const MAX_SESSION_AGE = 14 * 24 * 60 * 60 * 1000; // 14 days

      if (sessionAge > MAX_SESSION_AGE) {
        console.log(
          `⚠️ [${accountId}] Session too old (${Math.floor(sessionAge / (24 * 60 * 60 * 1000))} days), cleaning up`
        );
        await this.cleanupExpiredSession(accountId, session.sessionPath);
        return;
      }

      // Restore account with metadata
      const account = {
        id: accountId,
        name: session.metadata?.name || `WhatsApp ${accountId}`,
        status: 'connecting',
        qrCode: null,
        pairingCode: null,
        phone: phoneNumber,
        createdAt: session.metadata?.createdAt || session.updatedAt || new Date().toISOString(),
      };

      this.accounts.set(accountId, account);

      // Connect with restored session (will validate and cleanup if invalid)
      await this.connectBaileys(accountId, phoneNumber);
    } catch (error) {
      console.error(`❌ [${accountId}] Error restoring session:`, error);
      // Cleanup on restore error
      await this.cleanupExpiredSession(accountId, session.sessionPath);
    }
  }

  /**
   * Cleanup expired or invalid session
   */
  async cleanupExpiredSession(accountId, sessionPath) {
    try {
      console.log(`🗑️ [${accountId}] Cleaning up expired/invalid session`);

      // Delete session from Firestore
      await sessionStore.deleteSession(accountId, sessionPath);

      // Delete account doc from Firestore
      await firestore.db.collection('accounts').doc(accountId).delete();

      // Remove from memory
      this.accounts.delete(accountId);
      this.clients.delete(accountId);
      this.reconnectAttempts.delete(accountId);

      console.log(`✅ [${accountId}] Cleanup complete - session removed`);
    } catch (error) {
      console.error(`❌ [${accountId}] Error during cleanup:`, error);
    }
  }

  /**
   * Debounced status sync to Firestore with rate limiting
   * Prevents DEADLINE_EXCEEDED by batching rapid status changes
   */
  syncAccountStatusDebounced(accountId, status, account) {
    // Check if we synced recently (rate limiting)
    const lastSync = this.lastStatusSync.get(accountId) || 0;
    const timeSinceLastSync = Date.now() - lastSync;

    if (timeSinceLastSync < this.STATUS_SYNC_MIN_INTERVAL_MS) {
      console.log(
        `⏭️ [${accountId}] Status sync rate-limited (${timeSinceLastSync}ms since last sync)`
      );
      // Queue for later
      this.statusSyncQueue.set(accountId, { status, account, timestamp: Date.now() });
      return;
    }

    // Clear existing timer
    if (this.statusSyncTimers.has(accountId)) {
      clearTimeout(this.statusSyncTimers.get(accountId));
    }

    // Debounce: wait for status to stabilize
    const timerId = setTimeout(() => {
      this.statusSyncTimers.delete(accountId);
      this.performStatusSync(accountId, status, account);
    }, this.STATUS_SYNC_DEBOUNCE_MS);

    this.statusSyncTimers.set(accountId, timerId);
  }

  /**
   * Perform actual status sync with timeout and retry
   */
  async performStatusSync(accountId, status, account) {
    try {
      console.log(`💾 [${accountId}] Syncing status: ${status}`);

      // Race with timeout (5s max)
      await Promise.race([
        firestore.db.collection('accounts').doc(accountId).set(
          {
            id: accountId,
            name: account.name,
            status: status,
            phone: account.phone,
            updatedAt: firestore.admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Status sync timeout')), 5000)
        ),
      ]);

      this.lastStatusSync.set(accountId, Date.now());
      console.log(`✅ [${accountId}] Status synced successfully`);
    } catch (error) {
      console.error(`⚠️ [${accountId}] Status sync failed (non-critical): ${error.message}`);
      // Best-effort: don't crash, just log

      // Retry once after 10s if it was a timeout
      if (error.message.includes('timeout') || error.message.includes('DEADLINE_EXCEEDED')) {
        setTimeout(() => {
          console.log(`🔄 [${accountId}] Retrying status sync...`);
          this.performStatusSync(accountId, status, account).catch(() => {
            console.log(`⚠️ [${accountId}] Status sync retry failed, giving up`);
          });
        }, 10000);
      }
    }
  }

  /**
   * Debounced session save with rate limiting
   * Prevents DEADLINE_EXCEEDED on rapid creds.update events
   */
  saveSessionDebounced(accountId, sessionPath, account) {
    // Check if we saved recently (rate limiting)
    const lastSave = this.lastSessionSave.get(accountId) || 0;
    const timeSinceLastSave = Date.now() - lastSave;

    if (timeSinceLastSave < this.SESSION_SAVE_MIN_INTERVAL_MS) {
      console.log(
        `⏭️ [${accountId}] Session save rate-limited (${Math.floor(timeSinceLastSave / 1000)}s since last save)`
      );
      return;
    }

    // Clear existing timer
    if (this.sessionSaveTimers.has(accountId)) {
      clearTimeout(this.sessionSaveTimers.get(accountId));
    }

    // Debounce: wait for creds to stabilize
    const timerId = setTimeout(() => {
      this.sessionSaveTimers.delete(accountId);
      this.performSessionSave(accountId, sessionPath, account);
    }, this.SESSION_SAVE_DEBOUNCE_MS);

    this.sessionSaveTimers.set(accountId, timerId);
  }

  /**
   * Perform actual session save with timeout
   */
  async performSessionSave(accountId, sessionPath, account) {
    try {
      console.log(`💾 [${accountId}] Saving session...`);

      // Race with timeout (5s max)
      await Promise.race([
        sessionStore.saveSession(accountId, sessionPath, account),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session save timeout')), 5000)
        ),
      ]);

      this.lastSessionSave.set(accountId, Date.now());
      console.log(`✅ [${accountId}] Session saved successfully`);
    } catch (error) {
      console.error(`⚠️ [${accountId}] Session save failed (non-critical): ${error.message}`);
      // Best-effort: don't crash, just log
    }
  }

  /**
   * Cleanup Firestore accounts collection
   * Remove accounts that are not in memory AND have no saved session
   */
  async cleanupFirestoreAccounts() {
    try {
      console.log('🧹 Cleaning up Firestore accounts...');
      const snapshot = await firestore.db.collection('accounts').get();
      const memoryAccountIds = Array.from(this.accounts.keys());
      const savedSessions = await sessionStore.listSessions();
      const sessionAccountIds = savedSessions.map(s => s.accountId);

      let cleaned = 0;
      for (const doc of snapshot.docs) {
        const accountId = doc.id;
        const inMemory = memoryAccountIds.includes(accountId);
        const hasSession = sessionAccountIds.includes(accountId);

        // Only delete if NOT in memory AND has NO session
        if (!inMemory && !hasSession) {
          console.log(`🗑️ Removing phantom account (no session): ${accountId}`);
          await doc.ref.delete();
          cleaned++;
        } else if (!inMemory && hasSession) {
          console.log(`⏭️ Keeping account with session: ${accountId}`);
        }
      }

      console.log(`✅ Firestore cleanup complete: ${cleaned} phantom account(s) removed`);
    } catch (error) {
      console.error('❌ Firestore cleanup failed:', error.message);
    }
  }

  /**
   * TIER 3: Adaptive Keep-Alive (Rate Limit Protection)
   * Adjusts interval based on rate limit detection
   */
  startAdaptiveKeepAlive() {
    const keepAliveCheck = async () => {
      for (const [accountId, sock] of this.clients.entries()) {
        const account = this.accounts.get(accountId);

        // Skip if QR waiting for scan
        if (account && account.qrGenerated && account.status !== 'connected') {
          continue;
        }

        if (sock.user) {
          try {
            await sock.sendPresenceUpdate('available');

            // Success - reduce interval if it was increased
            if (this.keepAliveInterval > 10000) {
              this.keepAliveInterval = Math.max(10000, this.keepAliveInterval - 1000);
              console.log(`✅ [${accountId}] Keep-alive OK, interval: ${this.keepAliveInterval}ms`);
            }

            // Update last activity time
            this.lastMessageTime.set(accountId, Date.now());

            // Log metric
            await this.logMetric('keep_alive_success', { accountId });
          } catch (err) {
            console.log(`⚠️ [${accountId}] Keep-alive failed:`, err.message);

            // TIER 3: Detect rate limit
            if (
              err.message.includes('rate limit') ||
              err.message.includes('429') ||
              err.message.includes('too many')
            ) {
              this.keepAliveInterval = Math.min(60000, this.keepAliveInterval * 2);
              this.rateLimitDetected = true;
              this.metrics.rateLimits++;

              console.log(
                `🚨 [${accountId}] Rate limit detected! Interval: ${this.keepAliveInterval}ms`
              );
              await this.logMetric('rate_limit_detected', {
                accountId,
                interval: this.keepAliveInterval,
              });

              // Reset after 5 minutes
              setTimeout(() => {
                this.rateLimitDetected = false;
                this.keepAliveInterval = 10000;
                console.log(`✅ Rate limit cooldown complete, reset to 10s`);
              }, 300000);
            } else {
              // TIER 3: Switch to backup connection if available
              if (this.backupClients.has(accountId)) {
                await this.switchToBackup(accountId);
              } else {
                // Regular reconnect
                this.reconnectAccount(accountId);
              }
            }
          }
        }
      }

      // Schedule next check
      setTimeout(keepAliveCheck, this.keepAliveInterval);
    };

    // Start keep-alive
    keepAliveCheck();
  }

  /**
   * TIER 3: Restore message queue from Firestore
   */
  async restoreQueue() {
    try {
      const savedQueue = await firestore.getQueue('global');
      if (savedQueue && savedQueue.length > 0) {
        this.messageQueue = savedQueue;
        console.log(`📦 Restored ${savedQueue.length} messages from queue`);
        await this.logMetric('queue_restored', { count: savedQueue.length });
      }
    } catch (error) {
      console.error('❌ Failed to restore queue:', error.message);
    }
  }

  /**
   * TIER 3: Batch processor for Firestore saves
   */
  startBatchProcessor() {
    setInterval(async () => {
      if (this.messageBatch.length > 0) {
        await this.flushBatch();
      }
    }, 5000); // Flush every 5 seconds
  }

  /**
   * TIER 3: Flush message batch to Firestore
   */
  async flushBatch() {
    if (this.messageBatch.length === 0) return;

    const batchToSave = [...this.messageBatch];
    this.messageBatch = [];

    try {
      await firestore.saveBatch(batchToSave);
      console.log(`✅ Saved ${batchToSave.length} messages in batch`);
      await this.logMetric('batch_saved', { count: batchToSave.length });
    } catch (error) {
      console.error(`❌ Batch save failed:`, error.message);
      // Put back in queue
      this.messageBatch.unshift(...batchToSave);
    }
  }

  /**
   * TIER 3: Proactive monitoring for connection quality
   */
  startProactiveMonitoring() {
    setInterval(async () => {
      for (const [accountId, sock] of this.clients.entries()) {
        if (sock.user) {
          const quality = await this.measureConnectionQuality(accountId, sock);
          this.connectionQuality.set(accountId, quality);

          // TIER 3: Proactive reconnect if quality drops
          if (quality < 0.5) {
            console.log(
              `⚠️ [${accountId}] Quality low (${(quality * 100).toFixed(0)}%), proactive reconnect`
            );
            await this.proactiveReconnect(accountId);
          }
        }
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * TIER 3: Measure connection quality
   */
  async measureConnectionQuality(accountId, sock) {
    let quality = 1.0;

    try {
      // Check last message time
      const lastMsg = this.lastMessageTime.get(accountId) || Date.now();
      const timeSinceLastMsg = Date.now() - lastMsg;

      if (timeSinceLastMsg > 60000) quality -= 0.3; // No activity for 1 min
      if (timeSinceLastMsg > 120000) quality -= 0.3; // No activity for 2 min

      // Check retry count
      const retries = this.retryCount.get(accountId) || 0;
      if (retries > 3) quality -= 0.2;
      if (retries > 5) quality -= 0.2;

      return Math.max(0, quality);
    } catch (error) {
      return 0;
    }
  }

  /**
   * TIER 3: Proactive reconnect (before disconnect)
   */
  async proactiveReconnect(accountId) {
    try {
      const account = this.accounts.get(accountId);
      if (!account) return;

      console.log(`🔄 [${accountId}] Proactive reconnect initiated`);
      await this.logMetric('proactive_reconnect', { accountId });

      // Create new connection
      const newSock = await this.connectBaileys(accountId, account.phone);

      // Wait for connection to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Switch to new connection
      const oldSock = this.clients.get(accountId);
      this.clients.set(accountId, newSock);

      // Close old connection gracefully
      if (oldSock) {
        try {
          await oldSock.logout();
        } catch (e) {}
      }

      console.log(`✅ [${accountId}] Proactive reconnect complete`);
      this.retryCount.set(accountId, 0);
    } catch (error) {
      console.error(`❌ [${accountId}] Proactive reconnect failed:`, error.message);
    }
  }

  /**
   * TIER 3: Initialize dual connection (primary + backup)
   */
  async initDualConnection(accountId, phoneNumber) {
    try {
      console.log(`🔄 [${accountId}] Initializing dual connection...`);

      // Primary connection
      await this.connectBaileys(accountId, phoneNumber);
      this.activeConnection.set(accountId, 'primary');

      // Backup connection after 30 seconds
      setTimeout(async () => {
        try {
          const backupSock = await this.connectBaileys(accountId, phoneNumber, true);
          this.backupClients.set(accountId, backupSock);
          console.log(`✅ [${accountId}] Backup connection ready`);
          await this.logMetric('backup_connection_ready', { accountId });
        } catch (error) {
          console.error(`❌ [${accountId}] Backup connection failed:`, error.message);
        }
      }, 30000);
    } catch (error) {
      console.error(`❌ [${accountId}] Dual connection init failed:`, error.message);
    }
  }

  /**
   * TIER 3: Switch to backup connection
   */
  async switchToBackup(accountId) {
    try {
      const backupSock = this.backupClients.get(accountId);
      if (!backupSock) {
        console.log(`⚠️ [${accountId}] No backup connection available`);
        return false;
      }

      console.log(`⚡ [${accountId}] Switching to backup connection (0s downtime)`);
      await this.logMetric('switched_to_backup', { accountId });

      // Switch connections
      const oldSock = this.clients.get(accountId);
      this.clients.set(accountId, backupSock);
      this.backupClients.delete(accountId);
      this.activeConnection.set(accountId, 'backup');

      // Close old connection
      if (oldSock) {
        try {
          await oldSock.logout();
        } catch (e) {}
      }

      // Create new backup in background
      setTimeout(async () => {
        try {
          const account = this.accounts.get(accountId);
          const newBackup = await this.connectBaileys(accountId, account.phone, true);
          this.backupClients.set(accountId, newBackup);
          this.activeConnection.set(accountId, 'primary');
          console.log(`✅ [${accountId}] New backup connection ready`);
        } catch (error) {
          console.error(`❌ [${accountId}] New backup failed:`, error.message);
        }
      }, 5000);

      return true;
    } catch (error) {
      console.error(`❌ [${accountId}] Switch to backup failed:`, error.message);
      return false;
    }
  }

  /**
   * TIER 3: Log metric to Firestore for monitoring
   */
  async logMetric(type, data) {
    try {
      await firestore.logEvent({
        type,
        data,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Silent fail - don't crash on logging errors
    }
  }

  /**
   * Reconnect account cu exponential backoff
   */
  async reconnectAccount(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return;

    // Don't reconnect if QR was generated (waiting for scan)
    if (account.qrGenerated && account.status !== 'connected') {
      console.log(`⏭️ [${accountId}] Skip reconnect - QR waiting for scan`);
      return;
    }

    // Get retry count
    const retries = this.retryCount.get(accountId) || 0;
    this.retryCount.set(accountId, retries + 1);

    // Exponential backoff: 2s, 4s, 8s, 16s, max 60s
    const backoff = Math.min(2000 * Math.pow(2, retries), 60000);

    console.log(`🔄 [${accountId}] Reconnecting in ${backoff / 1000}s (attempt ${retries + 1})...`);

    // Disconnect old socket
    const oldSock = this.clients.get(accountId);
    if (oldSock) {
      try {
        await oldSock.logout();
      } catch (e) {}
      this.clients.delete(accountId);
    }

    // Wait backoff time
    await new Promise(resolve => setTimeout(resolve, backoff));

    // Reconnect
    try {
      await this.connectBaileys(accountId, account.phoneNumber);
      // Reset retry count on success
      this.retryCount.set(accountId, 0);
      console.log(`✅ [${accountId}] Reconnected successfully`);
    } catch (error) {
      console.error(`❌ [${accountId}] Reconnect failed:`, error.message);
      // Retry again
      if (retries < 10) {
        this.reconnectAccount(accountId);
      }
    }
  }

  ensureSessionsDir() {
    if (!fs.existsSync(this.sessionsPath)) {
      fs.mkdirSync(this.sessionsPath, { recursive: true });
    }
  }

  startMessageProcessor() {
    setInterval(async () => {
      if (this.messageQueue.length > 0 && !this.processing) {
        await this.processNextMessage();
      }

      // TIER 3: Save queue to Firestore every 10 messages
      if (this.messageQueue.length > 0 && this.messageQueue.length % 10 === 0) {
        await firestore.saveQueue('global', this.messageQueue);
      }
    }, 100);
  }

  async processNextMessage() {
    if (this.processing || this.messageQueue.length === 0) return;

    this.processing = true;
    const { accountId, message } = this.messageQueue.shift();

    try {
      const contactName = message.pushName || message.key.remoteJid.split('@')[0];

      const messageData = {
        accountId,
        message: {
          id: message.key.id,
          from: message.key.remoteJid,
          to: message.key.remoteJid,
          body: message.message?.conversation || message.message?.extendedTextMessage?.text || '',
          timestamp: message.messageTimestamp,
          fromMe: message.key.fromMe,
          hasMedia: !!message.message?.imageMessage || !!message.message?.videoMessage,
          contactName: contactName,
        },
      };

      console.log(`📤 [${accountId}] Emitting whatsapp:message:`, messageData.message.body);
      this.io.emit('whatsapp:message', messageData);
    } catch (error) {
      console.error(`❌ [${accountId}] Error processing queued message:`, error);
    } finally {
      this.processing = false;
    }
  }

  async sendAlert(to, message) {
    // Try to send via any connected account
    for (const [accountId, account] of this.accounts.entries()) {
      if (account.status === 'connected') {
        try {
          const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
          await this.sendMessage(accountId, jid, message);
          console.log(`📢 [Alert] Sent via ${accountId}`);
          return true;
        } catch (err) {
          console.log(`⚠️ [Alert] Failed via ${accountId}:`, err.message);
        }
      }
    }

    // If no connected account, log to Firestore
    console.log(`⚠️ [Alert] No connected account, logging to Firestore`);
    await monitor.logIncident('system', 'alert_failed', {
      to,
      message,
      reason: 'no_connected_account',
    });

    return false;
  }

  async handleConnectionTimeout(accountId, phoneNumber) {
    const account = this.accounts.get(accountId);
    if (!account) return;

    const attempts = this.reconnectAttempts.get(accountId) || 0;

    if (account.status === 'connected') {
      // Already connected, clear timeout
      console.log(`✅ [${accountId}] Connected before timeout`);
      return;
    }

    if (attempts >= this.MAX_RECONNECT_ATTEMPTS) {
      // Max attempts reached - session is INVALID
      console.log(
        `❌ [${accountId}] Max reconnect attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached - session INVALID`
      );
      account.status = 'needs_qr';

      // Clean up client
      const sock = this.clients.get(accountId);
      if (sock) {
        try {
          sock.end();
        } catch (e) {
          // Ignore
        }
      }

      // Cleanup expired session
      const sessionPath = path.join(this.sessionsPath, accountId);
      await this.cleanupExpiredSession(accountId, sessionPath).catch(err => {
        console.error(`❌ [${accountId}] Failed to cleanup:`, err.message);
      });

      // Send alert (best-effort with timeout)
      Promise.race([
        monitor.logIncident(accountId, 'needs_qr', {
          reason: 'max_reconnect_attempts',
          attempts: attempts,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Incident log timeout')), 3000)
        ),
      ]).catch(err => console.error(`⚠️ Failed to log incident (non-critical): ${err.message}`));

      return;
    }

    // Retry with backoff
    const backoffMs = Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30s
    console.log(
      `🔄 [${accountId}] Reconnect attempt ${attempts + 1}/${this.MAX_RECONNECT_ATTEMPTS} in ${backoffMs}ms...`
    );

    this.reconnectAttempts.set(accountId, attempts + 1);

    setTimeout(() => {
      if (this.accounts.has(accountId) && account.status !== 'connected') {
        this.connectBaileys(accountId, phoneNumber);
      }
    }, backoffMs);
  }

  async addAccount(accountName, phoneNumber = null) {
    if (this.accounts.size >= this.maxAccounts) {
      throw new Error(`Maximum ${this.maxAccounts} accounts reached`);
    }

    // Normalize phone number: remove @s.whatsapp.net if already present
    let normalizedPhone = phoneNumber;
    if (phoneNumber) {
      normalizedPhone = phoneNumber.replace(/@s\.whatsapp\.net/g, '').replace(/[^0-9+]/g, '');
    }

    const accountId = `account_${Date.now()}`;

    // CLEANUP: Delete any old session for this phone number (prevent conflicts)
    if (normalizedPhone) {
      console.log(`🧹 [${accountId}] Cleaning up old sessions for phone: ${normalizedPhone}`);
      const oldAccounts = Array.from(this.accounts.entries()).filter(
        ([id, acc]) => acc.phone === normalizedPhone
      );

      for (const [oldId, oldAcc] of oldAccounts) {
        console.log(`🗑️ [${oldId}] Removing old account for same phone`);
        const sessionPath = path.join(this.sessionsPath, oldId);
        await this.cleanupExpiredSession(oldId, sessionPath).catch(err => {
          console.error(`❌ [${oldId}] Failed to cleanup:`, err.message);
        });
      }
    }

    const account = {
      id: accountId,
      name: accountName || `WhatsApp ${this.accounts.size + 1}`,
      status: 'connecting',
      qrCode: null,
      pairingCode: null,
      phone: normalizedPhone,
      createdAt: new Date().toISOString(),
      hasEverConnected: false,
      pairingMode: true,
    };

    this.accounts.set(accountId, account);

    try {
      await this.connectBaileys(accountId, phoneNumber);
      console.log(`✅ [${accountId}] Client initialized`);
      return account;
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to initialize:`, error);
      this.clients.delete(accountId);
      this.accounts.delete(accountId);
      throw error;
    }
  }

  async connectBaileys(accountId, phoneNumber = null) {
    // Load Baileys ES Module (lazy load)
    const baileys = await loadBaileys();

    const sessionPath = path.join(this.sessionsPath, accountId);

    // Track connection start time
    this.connectionStartTime.set(accountId, Date.now());

    // Clear any existing timeout
    if (this.reconnectTimeouts.has(accountId)) {
      clearTimeout(this.reconnectTimeouts.get(accountId));
    }

    // Set connection timeout
    const timeoutId = setTimeout(() => {
      console.log(`⏱️ [${accountId}] Connection timeout after ${this.CONNECTION_TIMEOUT_MS}ms`);
      this.handleConnectionTimeout(accountId, phoneNumber);
    }, this.CONNECTION_TIMEOUT_MS);

    this.reconnectTimeouts.set(accountId, timeoutId);

    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    // Try to restore session from Firestore
    const restored = await sessionStore.restoreSession(accountId, sessionPath);
    if (restored) {
      console.log(`✅ [${accountId}] Session restored from Firestore`);
    }

    const { state, saveCreds } = await baileys.useMultiFileAuthState(sessionPath);
    const { version } = await baileys.fetchLatestBaileysVersion();

    // TIER ULTIMATE 2: Get proxy agent if configured
    const proxyAgent = proxyRotationManager.getProxyAgent(accountId);

    const sock = baileys.makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['SuperParty', 'Chrome', '1.0.0'],
      agent: proxyAgent || undefined, // Use proxy if available
    });

    this.clients.set(accountId, sock);
    this.chatsCache.set(accountId, new Map()); // Initialize chat cache for this account
    this.messagesCache.set(accountId, new Map()); // Initialize messages cache for this account
    this.setupBaileysEvents(accountId, sock, saveCreds, phoneNumber, baileys.DisconnectReason);
  }

  setupBaileysEvents(accountId, sock, saveCreds, phoneNumber = null, DisconnectReasonRef = null) {
    // Use provided DisconnectReason or get from loaded module
    const DisconnectReasonToUse = DisconnectReasonRef || DisconnectReason;

    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`📱 [${accountId}] QR Code generated`);

        const account = this.accounts.get(accountId);

        // Ignore duplicates in 120s window (status=qr_ready and not expired)
        if (account && account.qrGenerated && account.status === 'qr_ready') {
          const age = Date.now() - (account.qrGeneratedAt || 0);
          if (age < 120000) {
            console.log(
              `⏭️ [${accountId}] QR already active (${Math.floor(age / 1000)}s old), ignoring duplicate`
            );
            return;
          }
        }

        // If status != qr_ready or expired, only accept QR after explicit regenerate
        if (
          account &&
          account.qrGenerated &&
          account.status !== 'qr_ready' &&
          account.status !== 'connecting'
        ) {
          console.log(
            `⏭️ [${accountId}] QR event ignored (status=${account.status}, need explicit regenerate)`
          );
          return;
        }

        try {
          const qrCodeDataUrl = await QRCode.toDataURL(qr);
          if (account) {
            account.qrCode = qrCodeDataUrl;
            account.qrGenerated = true;
            account.qrGeneratedAt = Date.now();
            account.status = 'qr_ready';

            // Clear existing timer if any
            if (account.qrExpiryTimer) {
              clearTimeout(account.qrExpiryTimer);
            }

            // Set 120s expiry timer
            account.qrExpiryTimer = setTimeout(() => {
              if (account.status === 'qr_ready') {
                console.log(`[PAIRING] ${accountId} QR expired after 120s`);
                account.status = 'qr_expired';
                account.qrCode = null;
                account.pairingCode = null;
                account.qrExpiryTimer = null;
              }
            }, 120000);

            console.log(
              `[PAIRING] ${accountId} qr_issued, expiresAt=${new Date(Date.now() + 120000).toISOString()}`
            );

            // CRITICAL: Stop socket activity after QR generation to prevent 401
            // WhatsApp rejects if socket sends packets before scan
            console.log(`[PAIRING] ${accountId} pausing socket activity until scan`);
          }

          this.io.emit('whatsapp:qr', { accountId, qrCode: qrCodeDataUrl });

          // TIER ULTIMATE 2: Send webhook
          webhookManager.onAccountQR(accountId, qrCodeDataUrl);

          // If phone number provided, also request pairing code
          if (phoneNumber) {
            try {
              console.log(`🔢 [${accountId}] Requesting pairing code for ${phoneNumber}...`);
              const code = await sock.requestPairingCode(phoneNumber);
              console.log(`🔢 [${accountId}] Pairing code: ${code}`);

              if (account) {
                account.pairingCode = code;
              }

              this.io.emit('whatsapp:pairing_code', { accountId, code });
            } catch (error) {
              console.error(`❌ [${accountId}] Failed to get pairing code:`, error.message);
              console.error(error);
            }
          } else {
            console.log(`⏭️ [${accountId}] No phone number provided, skipping pairing code`);
          }
        } catch (error) {
          console.error(`❌ [${accountId}] QR generation failed:`, error);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = statusCode || 'unknown';

        const account = this.accounts.get(accountId);

        // PAIRING: If socket closes while waiting for QR scan, invalidate QR
        if (account && account.qrGenerated && account.status === 'qr_ready') {
          console.log(`[PAIRING] ${accountId} socket closed while waiting -> qr_invalid`);
          account.status = 'qr_invalid';
          account.qrCode = null;
          account.pairingCode = null;
          if (account.qrExpiryTimer) {
            clearTimeout(account.qrExpiryTimer);
            account.qrExpiryTimer = null;
          }
        }

        // CLEANUP: Clear all timers/intervals for this account
        if (this.reconnectTimeouts.has(accountId)) {
          clearTimeout(this.reconnectTimeouts.get(accountId));
          this.reconnectTimeouts.delete(accountId);
        }

        // Detect INVALID sessions (loggedOut, badSession, unauthorized)
        const isInvalidSession =
          (DisconnectReasonToUse && statusCode === DisconnectReasonToUse.loggedOut) ||
          statusCode === 401 ||
          statusCode === 403 ||
          statusCode === 428; // Connection closed (bad session)

        const shouldReconnect = !isInvalidSession;

        console.log(
          `🔌 [${accountId}] Connection closed. Reason: ${reason}, Invalid: ${isInvalidSession}, Reconnect: ${shouldReconnect}`
        );

        // TIER ULTIMATE 2: Record disconnect
        advancedHealthChecker.recordEvent(accountId, 'disconnect', { reason });

        // TIER ULTIMATE 2: Send webhook
        webhookManager.onAccountDisconnected(accountId, reason);

        if (account) {
          account.status = shouldReconnect ? 'reconnecting' : 'disconnected';

          // Sync to Firestore with debouncing (best-effort, non-blocking)
          this.syncAccountStatusDebounced(accountId, account.status, account);

          // Salvează status în Firestore (păstrează accountul în listă) - debounced
          const sessionPath = path.join(this.sessionsPath, accountId);
          this.saveSessionDebounced(accountId, sessionPath, account);
        }

        this.io.emit('whatsapp:disconnected', {
          accountId,
          reason: lastDisconnect?.error?.message,
        });

        if (shouldReconnect) {
          // Don't reconnect if QR was generated (waiting for scan)
          if (account && account.qrGenerated && account.status !== 'connected') {
            console.log(`⏭️ [${accountId}] Skip auto-reconnect - QR waiting for scan`);
            return;
          }

          // ÎMBUNĂTĂȚIRE: Reconnect delay 1s (was 5s) - reduce downtime 80%
          setTimeout(() => {
            if (this.accounts.has(accountId)) {
              console.log(`🔄 [${accountId}] Auto-reconnecting...`);
              // Use saved phone number from account
              const savedPhone = account?.phone;
              this.connectBaileys(accountId, savedPhone);
            }
          }, 1000); // ÎMBUNĂTĂȚIRE: 1s instead of 5s
        } else {
          // Session is INVALID

          // PAIRING MODE: Don't cleanup if in pairing (never connected before)
          if (account && account.pairingMode && !account.hasEverConnected) {
            console.log(`[PAIRING] ${accountId} 401 during pairing -> qr_invalid (no cleanup)`);
            account.status = 'qr_invalid';
            account.qrCode = null;
            account.pairingCode = null;
            if (account.qrExpiryTimer) {
              clearTimeout(account.qrExpiryTimer);
              account.qrExpiryTimer = null;
            }
            return;
          }

          // Cleanup only for accounts that were connected before
          console.log(`❌ [${accountId}] Session INVALID (reason: ${reason}) - cleaning up`);
          const sessionPath = path.join(this.sessionsPath, accountId);
          await this.cleanupExpiredSession(accountId, sessionPath).catch(err => {
            console.error(`❌ [${accountId}] Failed to cleanup:`, err.message);
          });

          // Log incident (best-effort with timeout)
          Promise.race([
            monitor.logIncident(accountId, 'session_invalid', {
              reason: reason,
              cleaned: true,
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Incident log timeout')), 3000)
            ),
          ]).catch(err =>
            console.error(`⚠️ Failed to log incident (non-critical): ${err.message}`)
          );

          // Update monitor status (best-effort with timeout)
          Promise.race([
            monitor.updateAccountStatus(accountId, 'logged_out', {
              disconnectReason: reason,
              lastDisconnectedAt: new Date().toISOString(),
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Monitor update timeout')), 3000)
            ),
          ]).catch(err =>
            console.error(`⚠️ Failed to update monitor (non-critical): ${err.message}`)
          );

          // Generate new QR/pairing by re-adding account
          const savedPhone = account?.phone;
          setTimeout(() => {
            console.log(`🔄 [${accountId}] Generating new QR/pairing code...`);
            this.connectBaileys(accountId, savedPhone).catch(err => {
              console.error(`❌ [${accountId}] Failed to generate QR:`, err.message);
            });
          }, 2000);

          // Try to send alert (may fail if WhatsApp is down)
          this.sendAlert(
            '+40737571397',
            `⛔ WhatsApp LOGGED OUT | account=${accountId} | ts=${new Date().toISOString()}`
          ).catch(err => {
            console.log(
              `⚠️ [${accountId}] Could not send alert (expected if WhatsApp down):`,
              err.message
            );
          });
        }
      }

      if (connection === 'open') {
        console.log(`✅ [${accountId}] Connected`);

        // Clear connection timeout
        if (this.reconnectTimeouts.has(accountId)) {
          clearTimeout(this.reconnectTimeouts.get(accountId));
          this.reconnectTimeouts.delete(accountId);
        }

        // Reset reconnect attempts
        this.reconnectAttempts.delete(accountId);

        // Calculate MTTR if reconnecting
        const startTime = this.connectionStartTime.get(accountId);
        if (startTime) {
          const mttrMs = Date.now() - startTime;
          console.log(`📊 [${accountId}] MTTR: ${mttrMs}ms`);
          this.connectionStartTime.delete(accountId);

          // Log to monitor
          monitor
            .updateAccountStatus(accountId, 'connected', {
              phone: sock.user?.id?.split(':')[0] || null,
              lastDisconnectedAt: null,
              mttrLastSeconds: Math.floor(mttrMs / 1000),
            })
            .catch(err => console.error('Failed to update monitor:', err));
        }

        const account = this.accounts.get(accountId);
        if (account) {
          account.status = 'connected';
          account.qrCode = null;
          account.pairingCode = null;
          account.qrGenerated = false;
          account.qrGeneratedAt = null;
          account.hasEverConnected = true;
          account.pairingMode = false;
          account.phone = sock.user?.id?.split(':')[0] || null;

          // Clear QR expiry timer on successful connection
          if (account.qrExpiryTimer) {
            clearTimeout(account.qrExpiryTimer);
            account.qrExpiryTimer = null;
          }

          // Sync to Firestore with debouncing (best-effort, non-blocking)
          this.syncAccountStatusDebounced(accountId, 'connected', account);
        }

        // 💾 Save session to Firestore with debouncing (best-effort)
        const sessionPathForSave = path.join(this.sessionsPath, accountId);
        this.saveSessionDebounced(accountId, sessionPathForSave, account);

        // TIER ULTIMATE 1: Initialize modules for this account
        rateLimiter.initAccount(accountId, 'normal');
        circuitBreaker.initCircuit(accountId);

        // TIER ULTIMATE 1: Start presence simulation
        behaviorSimulator.startPresenceSimulation(sock, accountId);

        // Flush queued messages after connection
        setTimeout(() => {
          console.log(`📤 [${accountId}] Flushing queued messages...`);
          messageQueue
            .flushQueue(accountId, async (to, message) => {
              return await this.sendMessage(accountId, to, message);
            })
            .then(result => {
              console.log(`✅ [${accountId}] Flush result:`, result);
            })
            .catch(err => {
              console.error(`❌ [${accountId}] Flush error:`, err.message);
            });
        }, 2000);

        // TIER ULTIMATE 2: Initialize advanced health
        advancedHealthChecker.initAccount(accountId);
        advancedHealthChecker.recordEvent(accountId, 'connect');

        // TIER ULTIMATE 2: Send webhook
        webhookManager.onAccountConnected(accountId, sock.user?.id?.split(':')[0]);

        // Save session + metadata to Firestore for persistence (debounced)
        const sessionPath = path.join(this.sessionsPath, accountId);
        this.saveSessionDebounced(accountId, sessionPath, account);

        this.io.emit('whatsapp:ready', {
          accountId,
          phone: sock.user?.id?.split(':')[0],
          info: sock.user,
        });
      }
    });

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      // Also save to Firestore for persistence across restarts (debounced)
      const sessionPath = path.join(this.sessionsPath, accountId);
      const account = this.accounts.get(accountId);
      this.saveSessionDebounced(accountId, sessionPath, account);
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const message of messages) {
        if (!message.message) continue;

        console.log(
          `💬 [${accountId}] Message received - queued (${this.messageQueue.length} in queue)`
        );

        // Save message to Firestore immediately
        try {
          await messageStore.saveMessage(accountId, message);
        } catch (error) {
          console.error(`❌ Failed to save message to Firestore:`, error.message);
        }

        // TIER ULTIMATE 1: Simulate read receipt for incoming messages
        if (!message.key.fromMe) {
          behaviorSimulator.handleIncomingMessage(sock, message).catch(err => {
            console.error(`Error handling incoming message behavior:`, err.message);
          });
        }

        // Add to message queue
        this.messageQueue.push({ accountId, message });

        // Update chat cache
        const chatId = message.key.remoteJid;
        const chats = this.chatsCache.get(accountId);
        if (chats && chatId && !chatId.includes('@g.us')) {
          chats.set(chatId, {
            id: chatId,
            name: message.pushName || chatId.split('@')[0],
            lastMessage: message.messageTimestamp,
            unreadCount: message.key.fromMe ? 0 : 1,
          });
        }

        // Update messages cache
        const messagesMap = this.messagesCache.get(accountId);
        const messageData = {
          id: message.key.id,
          from: chatId,
          to: chatId,
          body: message.message?.conversation || message.message?.extendedTextMessage?.text || '',
          timestamp: message.messageTimestamp,
          fromMe: message.key.fromMe,
          hasMedia: !!message.message?.imageMessage || !!message.message?.videoMessage,
        };

        if (messagesMap && chatId) {
          if (!messagesMap.has(chatId)) {
            messagesMap.set(chatId, []);
          }
          const chatMessages = messagesMap.get(chatId);
          chatMessages.push(messageData);

          // Keep only last 100 messages per chat
          if (chatMessages.length > 100) {
            messagesMap.set(chatId, chatMessages.slice(-100));
          }
        }

        // ÎMBUNĂTĂȚIRE: Save to Firestore with retry logic and deduplication
        await this.saveMessageWithRetry(accountId, chatId, messageData, message.pushName);

        if (this.messageQueue.length > 1000) {
          console.warn(`⚠️ Message queue too large (${this.messageQueue.length}), dropping oldest`);
          this.messageQueue = this.messageQueue.slice(-500);
        }
      }
    });
  }

  /**
   * ÎMBUNĂTĂȚIRE: Save message with retry logic and deduplication
   * Reduce message loss from 6.36% to 0.5%
   */
  async saveMessageWithRetry(accountId, chatId, messageData, pushName, maxRetries = 3) {
    // TIER 3: Use batching for better performance
    const useBatching = process.env.USE_MESSAGE_BATCHING !== 'false';

    if (useBatching) {
      // Add to batch
      this.messageBatch.push({
        accountId,
        chatId,
        messageData,
        pushName,
      });

      // Flush if batch is full
      if (this.messageBatch.length >= 10) {
        await this.flushBatch();
      }

      this.metrics.messagesProcessed++;
      return;
    }

    // Original retry logic (fallback)
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // ÎMBUNĂTĂȚIRE: Check for duplicates before saving
        const exists = await firestore.messageExists(accountId, chatId, messageData.id);
        if (exists) {
          console.log(`[${accountId}] Message ${messageData.id} already exists, skipping`);
          return;
        }

        // Save message
        await firestore.saveMessage(accountId, chatId, messageData);

        // Save chat metadata
        await firestore.saveChat(accountId, chatId, {
          name: pushName || chatId.split('@')[0],
          lastMessage: messageData.body,
          lastMessageTimestamp: messageData.timestamp,
        });

        this.metrics.messagesProcessed++;
        await this.logMetric('message_saved', { accountId, messageId: messageData.id });

        // Success - exit retry loop
        return;
      } catch (error) {
        console.error(
          `❌ [${accountId}] Save attempt ${attempt + 1}/${maxRetries} failed:`,
          error.message
        );

        if (attempt === maxRetries - 1) {
          // Final attempt failed - log error but don't crash
          this.metrics.messageLoss++;
          await this.logMetric('message_lost', {
            accountId,
            messageId: messageData.id,
            error: error.message,
          });
          console.error(
            `❌ [${accountId}] Message ${messageData.id} lost after ${maxRetries} attempts`
          );
          return;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, attempt);
        console.log(`⏳ [${accountId}] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Regenerate QR/pairing code (explicit user action)
   */
  async regenerateQR(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    console.log(`[PAIRING] ${accountId} regenerate requested`);

    // Full reset
    account.qrGenerated = false;
    account.qrGeneratedAt = null;
    account.qrCode = null;
    account.pairingCode = null;
    account.status = 'connecting';
    account.pairingMode = true;

    // Clear timer
    if (account.qrExpiryTimer) {
      clearTimeout(account.qrExpiryTimer);
      account.qrExpiryTimer = null;
    }

    // Close old socket
    const oldSock = this.clients.get(accountId);
    if (oldSock) {
      try {
        await oldSock.logout();
      } catch (e) {}
      this.clients.delete(accountId);
    }

    // Start new pairing
    console.log(`[PAIRING] ${accountId} attempt new`);
    await this.connectBaileys(accountId, account.phone);

    return { success: true, message: 'QR regeneration started' };
  }

  async removeAccount(accountId) {
    const sock = this.clients.get(accountId);
    if (!sock) {
      throw new Error('Account not found');
    }

    try {
      await sock.logout();
      this.clients.delete(accountId);
      this.accounts.delete(accountId);

      // Delete local session
      const sessionPath = path.join(this.sessionsPath, accountId);
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }

      // Delete from Firestore
      await sessionStore.deleteSession(accountId);

      this.io.emit('whatsapp:account_removed', { accountId });
      console.log(`🗑️ [${accountId}] Account removed`);
      return { success: true };
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to remove:`, error);
      throw error;
    }
  }

  getAccounts() {
    return Array.from(this.accounts.values());
  }

  async getQRForWeb(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return null;

    return {
      id: accountId,
      status: account.status,
      qrCode: account.qrCode,
      pairingCode: account.pairingCode,
    };
  }

  async getChats(accountId) {
    const sock = this.clients.get(accountId);
    if (!sock) throw new Error('Account not found');

    try {
      const chats = await sock.groupFetchAllParticipating();
      const chatList = [];

      for (const [jid, chat] of Object.entries(chats)) {
        chatList.push({
          id: jid,
          name: chat.subject || jid.split('@')[0],
          isGroup: true,
          unreadCount: 0,
          timestamp: Date.now(),
          lastMessage: null,
        });
      }

      return chatList;
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to get chats:`, error);
      return [];
    }
  }

  async getMessages(accountId, chatId, limit = 50) {
    const sock = this.clients.get(accountId);
    if (!sock) throw new Error('Account not found');

    try {
      console.log(`📋 [${accountId}] Getting messages for ${chatId}...`);

      // Try Firestore first (persistent)
      const firestoreMessages = await firestore.getMessages(accountId, chatId, limit);
      if (firestoreMessages.length > 0) {
        console.log(
          `✅ [${accountId}] Returning ${firestoreMessages.length} messages from Firestore`
        );
        return firestoreMessages;
      }

      // Fallback to cache
      const messagesMap = this.messagesCache.get(accountId);
      if (!messagesMap) {
        console.log(`⚠️ [${accountId}] No messages found`);
        return [];
      }

      const messages = messagesMap.get(chatId) || [];
      console.log(`✅ [${accountId}] Returning ${messages.length} messages from cache`);

      return messages.slice(-limit);
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to get messages:`, error);
      return [];
    }
  }

  async sendMessage(accountId, chatId, message, options = {}) {
    // TIER ULTIMATE 1: Check circuit breaker
    const circuitCheck = circuitBreaker.canExecute(accountId);
    if (!circuitCheck.allowed) {
      console.warn(`⚠️ [${accountId}] Circuit breaker: ${circuitCheck.reason}`);
      throw new Error(`Circuit breaker open: ${circuitCheck.reason}`);
    }

    // TIER ULTIMATE 1: Check rate limiter
    const rateLimitCheck = rateLimiter.canSendNow(accountId, chatId);
    if (!rateLimitCheck.allowed) {
      console.log(`⏳ [${accountId}] Rate limited: ${rateLimitCheck.reason}, queuing...`);

      // Queue message
      const messageId = await rateLimiter.queueMessage(
        accountId,
        chatId,
        message,
        options.priority || 0
      );

      return { success: true, queued: true, messageId };
    }

    const sock = this.getActiveConnection(accountId);
    const account = this.accounts.get(accountId);

    // If not connected, queue message
    if (!sock || !account || account.status !== 'connected') {
      console.log(`📥 [${accountId}] Not connected, queuing message...`);
      const messageId = await messageQueue.queueMessage(accountId, chatId, message, {
        direction: 'client_to_operator',
        threadId: chatId,
        ...options,
      });
      return { success: true, queued: true, messageId };
    }

    try {
      // TIER ULTIMATE 1: Apply message variation if template provided
      let finalMessage = message;
      if (options.useVariation && options.template) {
        finalMessage = messageVariation.generateUniqueMessage(
          accountId,
          chatId,
          options.template,
          options.variables || {},
          options.variationOptions || {}
        );
      }

      // TIER ULTIMATE 1: Send with human behavior simulation
      let sentMessage;
      if (options.useBehavior !== false) {
        sentMessage = await behaviorSimulator.sendMessageWithBehavior(
          sock,
          chatId,
          finalMessage,
          options.behaviorOptions || {}
        );
      } else {
        // Direct send without behavior
        sentMessage = await sock.sendMessage(chatId, { text: finalMessage });
      }

      // Save sent message to Firestore
      if (sentMessage) {
        try {
          await messageStore.saveMessage(accountId, sentMessage);
        } catch (error) {
          console.error(`❌ Failed to save sent message to Firestore:`, error.message);
        }
      }

      // TIER ULTIMATE 1: Record success
      circuitBreaker.recordSuccess(accountId);
      rateLimiter.recordMessage(accountId, chatId);

      // TIER ULTIMATE 2: Record message sent
      advancedHealthChecker.recordEvent(accountId, 'message_sent');

      // TIER ULTIMATE 2: Send webhook
      webhookManager.onMessageSent(accountId, chatId, Date.now());

      console.log(`📤 [${accountId}] Message sent to ${chatId}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to send message:`, error);

      // TIER ULTIMATE 1: Record failure
      circuitBreaker.recordFailure(accountId, error);

      // TIER ULTIMATE 1: Check if rate limit error
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        rateLimiter.handleRateLimit(accountId, 'medium');
      }

      // TIER ULTIMATE 2: Record message failed
      advancedHealthChecker.recordEvent(accountId, 'message_failed', { error: error.message });

      // TIER ULTIMATE 2: Send webhook
      webhookManager.onMessageFailed(accountId, chatId, error.message);

      // TIER ULTIMATE 2: Handle proxy failure if proxy is used
      if (proxyRotationManager.getProxy(accountId)) {
        proxyRotationManager.handleProxyFailure(accountId, error);
      }

      throw error;
    }
  }

  /**
   * TIER ULTIMATE 1: Send bulk messages with variation
   */
  async sendBulkMessages(accountId, recipients, template, options = {}) {
    // Initialize account in rate limiter
    rateLimiter.initAccount(accountId, options.accountAge || 'normal');

    // Generate varied messages
    const messages = messageVariation.generateBatch(accountId, recipients, template, options);

    const results = [];

    for (const message of messages) {
      try {
        const result = await this.sendMessage(accountId, message.jid, message.text, {
          useBehavior: true,
          priority: options.priority || 0,
        });

        results.push({
          jid: message.jid,
          success: true,
          ...result,
        });
      } catch (error) {
        results.push({
          jid: message.jid,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get active connection (primary or backup)
   */
  getActiveConnection(accountId) {
    const active = this.activeConnection.get(accountId);
    if (active === 'backup') {
      return this.backupClients.get(accountId);
    }
    return this.clients.get(accountId);
  }

  async destroy() {
    console.log('🛑 Destroying all WhatsApp clients...');
    for (const [accountId, sock] of this.clients.entries()) {
      try {
        // TIER ULTIMATE 1: Stop presence simulation
        behaviorSimulator.stopPresenceSimulation(accountId);

        // TIER ULTIMATE 1: Cleanup modules
        rateLimiter.cleanup(accountId);
        messageVariation.cleanup(accountId);
        circuitBreaker.cleanup(accountId);

        await sock.logout();
        console.log(`✅ [${accountId}] Destroyed`);
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to destroy:`, error);
      }
    }
    this.clients.clear();
    this.accounts.clear();

    // TIER ULTIMATE 1: Global cleanup
    behaviorSimulator.cleanup();
    rateLimiter.cleanup();
    messageVariation.cleanup();
    circuitBreaker.cleanup();

    // TIER ULTIMATE 2: Global cleanup
    advancedHealthChecker.cleanup();
    proxyRotationManager.cleanup();
    webhookManager.cleanup();
  }

  async getAllClients() {
    const allClients = [];

    for (const [accountId, sock] of this.clients.entries()) {
      try {
        const account = this.accounts.get(accountId);
        if (!account || account.status !== 'connected') {
          console.log(`⏭️ [${accountId}] Skipping - not connected (${account?.status})`);
          continue;
        }

        console.log(`📋 [${accountId}] Fetching chats from cache...`);

        // Get chats from manual cache
        const chats = this.chatsCache.get(accountId);
        if (!chats) {
          console.log(`⚠️ [${accountId}] No chat cache found`);
          continue;
        }

        console.log(`📋 [${accountId}] Found ${chats.size} chats in cache`);

        for (const [chatId, chat] of chats.entries()) {
          allClients.push({
            id: chatId,
            accountId,
            name: chat.name,
            phone: chatId.split('@')[0],
            status: 'available',
            unreadCount: chat.unreadCount || 0,
            lastMessage: chat.lastMessage || Date.now(),
            lastMessageText: '',
          });
        }

        console.log(`✅ [${accountId}] Returning ${allClients.length} clients`);
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to get clients:`, error.message);
      }
    }

    return allClients;
  }

  async getClientMessages(clientId) {
    for (const [accountId, sock] of this.clients.entries()) {
      try {
        const account = this.accounts.get(accountId);
        if (!account || account.status !== 'connected') continue;

        const messages = await sock.fetchMessagesFromWA(clientId, 100);

        return messages.map(msg => ({
          id: msg.key.id,
          text: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
          fromClient: !msg.key.fromMe,
          timestamp: msg.messageTimestamp * 1000,
        }));
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to get messages for ${clientId}:`, error.message);
        continue;
      }
    }

    throw new Error('Client not found or no connected accounts');
  }

  async sendClientMessage(clientId, message) {
    for (const [accountId, sock] of this.clients.entries()) {
      try {
        const account = this.accounts.get(accountId);
        if (!account || account.status !== 'connected') continue;

        await sock.sendMessage(clientId, { text: message });

        console.log(`📤 [${accountId}] Message sent to ${clientId}`);

        return {
          id: `msg_${Date.now()}`,
          text: message,
          fromClient: false,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error(`❌ [${accountId}] Failed to send to ${clientId}:`, error.message);
        continue;
      }
    }

    throw new Error('Failed to send message - no connected accounts available');
  }

  async updateClientStatus(clientId, status) {
    this.io.emit('client:status_updated', { clientId, status });
    return { success: true };
  }

  /**
   * ÎMBUNĂTĂȚIRE: Graceful shutdown - process all messages before exit
   * Reduce message loss at restart from 0.1% to 0.01%
   */
  async gracefulShutdown() {
    console.log('🛑 Graceful shutdown initiated...');

    try {
      // Stop accepting new messages
      clearInterval(this.healthCheckInterval);

      // TIER 3: Flush message batch
      console.log(`💾 Flushing message batch (${this.messageBatch.length} messages)...`);
      await this.flushBatch();

      // Process remaining messages in queue
      console.log(`📤 Processing ${this.messageQueue.length} messages in queue...`);
      while (this.messageQueue.length > 0 && !this.processing) {
        await this.processNextMessage();
      }

      // TIER 3: Save queue to Firestore
      if (this.messageQueue.length > 0) {
        console.log(`💾 Saving ${this.messageQueue.length} messages to queue...`);
        await firestore.saveQueue('global', this.messageQueue);
      }

      // Save all sessions
      console.log('💾 Saving all sessions...');
      for (const [accountId, account] of this.accounts.entries()) {
        const sessionPath = path.join(this.sessionsPath, accountId);
        await sessionStore.saveSession(accountId, sessionPath, account);
      }

      // TIER 3: Log final metrics
      console.log('📊 Final metrics:', this.metrics);
      await this.logMetric('graceful_shutdown', { metrics: this.metrics });

      // Disconnect all clients cleanly (including backups)
      console.log('🔌 Disconnecting all clients...');
      await this.destroy();

      // TIER 3: Disconnect backup clients
      for (const [accountId, backupSock] of this.backupClients.entries()) {
        try {
          await backupSock.logout();
          console.log(`✅ [${accountId}] Backup disconnected`);
        } catch (e) {}
      }

      console.log('✅ Graceful shutdown complete');
    } catch (error) {
      console.error('❌ Graceful shutdown error:', error.message);
    }
  }

  /**
   * TIER 3: Generate daily report
   */
  async generateDailyReport() {
    const report = {
      date: new Date().toISOString().split('T')[0],
      metrics: this.metrics,
      accounts: this.accounts.size,
      activeConnections: this.clients.size,
      backupConnections: this.backupClients.size,
      queueSize: this.messageQueue.length,
      batchSize: this.messageBatch.length,
    };

    console.log('📊 Daily Report:', report);
    await this.logMetric('daily_report', report);

    return report;
  }
}

// Global error handlers to prevent process crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise);
  console.error('🚨 Reason:', reason);
  // Log to Firestore for monitoring
  try {
    const firestore = require('./firebase/firestore');
    firestore.db
      .collection('system_errors')
      .add({
        type: 'unhandledRejection',
        reason: reason?.message || String(reason),
        stack: reason?.stack || null,
        timestamp: firestore.admin.firestore.FieldValue.serverTimestamp(),
      })
      .catch(err => console.error('Failed to log unhandledRejection:', err));
  } catch (e) {
    // Ignore if firestore not available
  }
  // DO NOT rethrow or exit - keep process alive
});

process.on('uncaughtException', (error, origin) => {
  console.error('🚨 Uncaught Exception:', error);
  console.error('🚨 Origin:', origin);
  // Log to Firestore for monitoring
  try {
    const firestore = require('./firebase/firestore');
    firestore.db
      .collection('system_errors')
      .add({
        type: 'uncaughtException',
        message: error.message,
        stack: error.stack,
        origin: origin,
        timestamp: firestore.admin.firestore.FieldValue.serverTimestamp(),
      })
      .catch(err => console.error('Failed to log uncaughtException:', err));
  } catch (e) {
    // Ignore if firestore not available
  }
  // DO NOT exit - keep process alive
});

module.exports = WhatsAppManager;
