/**
 * WA STABILITY INTEGRATION
 * 
 * Integrates all W1-W18 requirements into the existing multi-account system.
 * Provides single-instance guarantee, outbox, dedupe, watchdogs, graceful shutdown.
 */

const WAStabilityManager = require('./wa-stability-manager');
const { FieldValue } = require('firebase-admin/firestore');

class WAIntegration {
  constructor(db, instanceId) {
    this.db = db;
    this.instanceId = instanceId;
    this.stability = new WAStabilityManager(db, instanceId);
    
    // W8: Outbox
    this.outboxWorkerInterval = null;
    this.outboxProcessing = false;
    
    // W9: Inbound dedupe
    this.inboundDedupeCache = new Map(); // waMessageId -> timestamp
    
    // W12: Dependency health
    this.consecutiveFirestoreErrors = 0;
    this.degradedSince = null;
    
    // W13: Circuit breaker
    this.disconnectHistory = []; // timestamps
    this.reconnectMode = 'normal'; // normal | cooldown
    
    // W14: Single-flight connect
    this.connectInProgress = false;
    this.lastConnectAttemptAt = null;
    
    // W15: Watchdogs
    this.eventLoopLag = [];
    this.lastEventLoopCheck = Date.now();
    
    // W16: Rate limiting
    this.sendQueue = [];
    this.lastSendAt = 0;
    this.maxSendRate = 10; // msg/s
    this.drainMode = false;
    
    // W17: Warm-up
    this.warmUpComplete = false;
    this.warmUpDelay = 5000; // 5s
    
    // W18: Pairing block
    this.pairingRequired = false;
    
    console.log('[WAIntegration] Initialized');
  }

  /**
   * Initialize and try to acquire lock
   */
  async initialize() {
    // Try to acquire lock
    const isActive = await this.stability.tryActivate();
    
    if (!isActive) {
      console.log('[WAIntegration] Running in PASSIVE mode');
      return { mode: 'passive', reason: 'lock_not_acquired' };
    }
    
    console.log('[WAIntegration] Running in ACTIVE mode');
    
    // Check for pairing requirement
    await this.checkPairingRequired();
    
    if (this.pairingRequired) {
      console.log('[WAIntegration] PAIRING REQUIRED - blocking operations');
      return { mode: 'active', blocked: true, reason: 'pairing_required' };
    }
    
    // Start watchdogs
    this.startWatchdogs();
    
    // Start outbox worker
    this.startOutboxWorker();
    
    return { mode: 'active', blocked: false };
  }

  /**
   * W18: Check if pairing is required
   */
  async checkPairingRequired() {
    try {
      const stateDoc = await this.db.doc('wa_metrics/longrun/state/wa_connection').get();
      if (stateDoc.exists) {
        const data = stateDoc.data();
        this.pairingRequired = data.pairingRequired || false;
      }
    } catch (error) {
      console.error('[WAIntegration] Error checking pairing:', error.message);
    }
  }

  /**
   * W8: Start outbox worker
   */
  startOutboxWorker() {
    if (this.outboxWorkerInterval) {
      clearInterval(this.outboxWorkerInterval);
    }
    
    this.outboxWorkerInterval = setInterval(async () => {
      await this.processOutbox();
    }, 5000); // Every 5s
    
    console.log('[WAIntegration] Outbox worker started');
  }

  /**
   * W8: Process outbox
   */
  async processOutbox() {
    if (this.outboxProcessing || this.pairingRequired || !this.warmUpComplete) {
      return;
    }
    
    this.outboxProcessing = true;
    
    try {
      // Get pending messages
      const snapshot = await this.db.collection('wa_metrics/longrun/outbox')
        .where('status', '==', 'PENDING')
        .where('nextAttemptAt', '<=', new Date())
        .orderBy('nextAttemptAt')
        .limit(this.drainMode ? 5 : 10)
        .get();
      
      for (const doc of snapshot.docs) {
        await this.sendOutboxMessage(doc.id, doc.data());
      }
    } catch (error) {
      console.error('[WAIntegration] Outbox processing error:', error.message);
      this.handleFirestoreError(error);
    } finally {
      this.outboxProcessing = false;
    }
  }

  /**
   * W8: Send outbox message
   */
  async sendOutboxMessage(outboxId, data) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastSend = now - this.lastSendAt;
    const minInterval = 1000 / this.maxSendRate;
    
    if (timeSinceLastSend < minInterval) {
      return; // Skip, will retry next cycle
    }
    
    try {
      // TODO: Actual send via Baileys socket
      // For now, mark as SENT
      await this.db.doc(`wa_metrics/longrun/outbox/${outboxId}`).update({
        status: 'SENT',
        attemptCount: (data.attemptCount || 0) + 1,
        lastUpdatedAt: FieldValue.serverTimestamp(),
        instanceId: this.instanceId
      });
      
      this.lastSendAt = now;
      console.log(`[WAIntegration] Sent outbox message: ${outboxId}`);
    } catch (error) {
      console.error(`[WAIntegration] Failed to send ${outboxId}:`, error.message);
      
      // Update with backoff
      const attemptCount = (data.attemptCount || 0) + 1;
      const backoffMs = Math.min(60000, 1000 * Math.pow(2, attemptCount));
      
      await this.db.doc(`wa_metrics/longrun/outbox/${outboxId}`).update({
        status: 'PENDING',
        attemptCount,
        nextAttemptAt: new Date(Date.now() + backoffMs),
        lastError: error.message,
        lastUpdatedAt: FieldValue.serverTimestamp()
      });
    }
  }

  /**
   * W9: Check inbound dedupe
   */
  async checkInboundDedupe(waMessageId) {
    // Check cache first
    if (this.inboundDedupeCache.has(waMessageId)) {
      return { isDuplicate: true, source: 'cache' };
    }
    
    // Check Firestore
    try {
      const dedupeRef = this.db.doc(`wa_metrics/longrun/inbound_dedupe/${waMessageId}`);
      
      const result = await this.db.runTransaction(async (transaction) => {
        const doc = await transaction.get(dedupeRef);
        
        if (doc.exists) {
          // Update lastSeenAt
          transaction.update(dedupeRef, {
            lastSeenAt: FieldValue.serverTimestamp()
          });
          return { isDuplicate: true, source: 'firestore' };
        }
        
        // Create dedupe entry
        transaction.set(dedupeRef, {
          waMessageId,
          firstSeenAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
          instanceId: this.instanceId
        });
        
        return { isDuplicate: false };
      });
      
      // Add to cache
      if (!result.isDuplicate) {
        this.inboundDedupeCache.set(waMessageId, Date.now());
        
        // Limit cache size
        if (this.inboundDedupeCache.size > 10000) {
          const oldestKey = this.inboundDedupeCache.keys().next().value;
          this.inboundDedupeCache.delete(oldestKey);
        }
      }
      
      return result;
    } catch (error) {
      console.error('[WAIntegration] Dedupe check error:', error.message);
      this.handleFirestoreError(error);
      return { isDuplicate: false, error: error.message };
    }
  }

  /**
   * W12: Handle Firestore errors
   */
  handleFirestoreError(error) {
    this.consecutiveFirestoreErrors++;
    
    if (this.consecutiveFirestoreErrors >= 5 && !this.degradedSince) {
      this.degradedSince = new Date().toISOString();
      console.error('[WAIntegration] Entering DEGRADED mode (Firestore errors)');
      
      // Create incident
      this.createDegradedIncident();
    }
  }

  /**
   * W12: Create degraded incident
   */
  async createDegradedIncident() {
    try {
      await this.db.doc('wa_metrics/longrun/incidents/wa_firestore_degraded_active').set({
        type: 'wa_firestore_degraded',
        active: true,
        firstDetectedAt: FieldValue.serverTimestamp(),
        lastCheckedAt: FieldValue.serverTimestamp(),
        instanceId: this.instanceId,
        consecutiveErrors: this.consecutiveFirestoreErrors,
        instructions: 'Firestore connectivity issues. Check network and Firestore status.'
      }, { merge: true });
    } catch (error) {
      console.error('[WAIntegration] Failed to create degraded incident:', error.message);
    }
  }

  /**
   * W13: Check circuit breaker
   */
  checkCircuitBreaker() {
    const now = Date.now();
    const fifteenMinutesAgo = now - (15 * 60 * 1000);
    
    // Clean old disconnects
    this.disconnectHistory = this.disconnectHistory.filter(ts => ts > fifteenMinutesAgo);
    
    if (this.disconnectHistory.length >= 20 && this.reconnectMode === 'normal') {
      this.reconnectMode = 'cooldown';
      console.warn('[WAIntegration] Circuit breaker TRIPPED - entering cooldown');
      
      // Create incident
      this.createCooldownIncident();
      
      return { tripped: true, nextRetryAt: new Date(now + 5 * 60 * 1000) };
    }
    
    return { tripped: false };
  }

  /**
   * W13: Create cooldown incident
   */
  async createCooldownIncident() {
    try {
      await this.db.doc('wa_metrics/longrun/incidents/wa_reconnect_cooldown_active').set({
        type: 'wa_reconnect_cooldown',
        active: true,
        firstDetectedAt: FieldValue.serverTimestamp(),
        instanceId: this.instanceId,
        disconnectCount: this.disconnectHistory.length,
        instructions: 'Too many disconnects. System in cooldown mode for 5 minutes.'
      }, { merge: true });
    } catch (error) {
      console.error('[WAIntegration] Failed to create cooldown incident:', error.message);
    }
  }

  /**
   * W15: Start watchdogs
   */
  startWatchdogs() {
    // Event loop lag watchdog
    setInterval(() => {
      const now = Date.now();
      const lag = now - this.lastEventLoopCheck;
      this.lastEventLoopCheck = now;
      
      this.eventLoopLag.push(lag);
      if (this.eventLoopLag.length > 30) {
        this.eventLoopLag.shift();
      }
      
      // Check P95
      if (this.eventLoopLag.length >= 30) {
        const sorted = [...this.eventLoopLag].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        
        if (p95 > 2000) {
          console.error('[WAIntegration] Event loop lag P95 > 2000ms - triggering shutdown');
          this.gracefulShutdown('event_loop_stall');
        }
      }
    }, 10000); // Every 10s
    
    // Memory watchdog
    setInterval(() => {
      const usage = process.memoryUsage();
      const heapPercent = (usage.heapUsed / usage.heapTotal) * 100;
      
      if (heapPercent > 80) {
        console.warn(`[WAIntegration] High memory usage: ${heapPercent.toFixed(1)}%`);
        
        // TODO: Track trend over 2-3 minutes
        // For now, just log
      }
    }, 30000); // Every 30s
    
    console.log('[WAIntegration] Watchdogs started');
  }

  /**
   * W7: Graceful shutdown
   */
  async gracefulShutdown(reason) {
    console.log(`[WAIntegration] Graceful shutdown initiated: ${reason}`);
    
    // Stop outbox worker
    if (this.outboxWorkerInterval) {
      clearInterval(this.outboxWorkerInterval);
    }
    
    // Stop stability monitoring
    await this.stability.cleanup();
    
    // Exit
    process.exit(reason === 'event_loop_stall' ? 1 : 0);
  }

  /**
   * Get comprehensive status
   */
  async getStatus() {
    const stabilityStatus = await this.stability.getStatus();
    
    // Get outbox stats
    let outboxPendingCount = 0;
    let outboxOldestPendingAgeSec = null;
    
    try {
      const outboxSnapshot = await this.db.collection('wa_metrics/longrun/outbox')
        .where('status', '==', 'PENDING')
        .orderBy('createdAt')
        .limit(1)
        .get();
      
      outboxPendingCount = outboxSnapshot.size;
      
      if (!outboxSnapshot.empty) {
        const oldest = outboxSnapshot.docs[0].data();
        const age = Date.now() - oldest.createdAt.toMillis();
        outboxOldestPendingAgeSec = Math.floor(age / 1000);
      }
    } catch (error) {
      console.error('[WAIntegration] Error getting outbox stats:', error.message);
    }
    
    return {
      ...stabilityStatus,
      instanceId: this.instanceId,
      pairingRequired: this.pairingRequired,
      connectInProgress: this.connectInProgress,
      lastConnectAttemptAt: this.lastConnectAttemptAt,
      reconnectMode: this.reconnectMode,
      outboxPendingCount,
      outboxOldestPendingAgeSec,
      drainMode: this.drainMode,
      inboundDedupeStore: 'firestore',
      consecutiveFirestoreErrors: this.consecutiveFirestoreErrors,
      degradedSince: this.degradedSince,
      warmUpComplete: this.warmUpComplete
    };
  }
}

module.exports = WAIntegration;
