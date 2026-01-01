/**
 * LONG-RUN FIRESTORE SCHEMA - COMPLETE (DoD-LR-1 to DoD-LR-27)
 * NO BULLSHIT: All writes idempotent, all reads deterministic
 *
 * Collections:
 * - wa_metrics/longrun/config/current
 * - wa_metrics/longrun/locks/{lockName}
 * - wa_metrics/longrun/runs/{runKey}
 * - wa_metrics/longrun/heartbeats/{bucketId}
 * - wa_metrics/longrun/probes/{probeKey}
 * - wa_metrics/longrun/incidents/{incidentId}
 * - wa_metrics/longrun/rollups/{yyyy-mm-dd}
 * - wa_metrics/longrun/state/current
 * - wa_metrics/longrun/remediations/{remediationId}
 * - wa_metrics/longrun/audits/{auditId}
 * - wa_metrics/longrun/auth_backups/{backupId}
 * - wa_metrics/longrun/wal/{eventId}
 * - wa_metrics/longrun/missing_buckets/{bucketId}
 */

const { FieldValue } = require('firebase-admin/firestore');

class LongRunSchemaComplete {
  constructor(db) {
    this.db = db;
    this.collectionPrefix = 'wa_metrics/longrun';
  }

  /**
   * Initialize complete config (DoD-LR-1)
   */
  async initConfig(baseUrl, commitHash, serviceVersion, instanceId) {
    const configRef = this.db.doc(`${this.collectionPrefix}/config/current`);

    const config = {
      // Basic
      baseUrl,
      commitHash,
      serviceVersion,
      expectedAccounts: 4,
      updatedAt: FieldValue.serverTimestamp(),

      // Heartbeat settings
      heartbeatIntervalSec: 60,
      driftSec: 10,

      // Insufficient data threshold
      insufficientDataThreshold: 0.8,

      // Probe schedules
      probeSchedules: {
        outboundHours: 6,
        queueHours: 24,
        inboundHours: 6,
      },

      // Alert thresholds
      alertThresholds: {
        missedHbPerHour: 3,
        consecutiveProbeFails: 2,
        queueDepthThreshold: 100,
        reconnectLoopThreshold: 10,
      },

      // Account IDs
      operatorAccountId: null, // Set manually
      probeSenderAccountId: null, // Set manually
      operatorJid: null,
      operatorPhone: null,

      // Persistence policy (DoD-LR-22, DoD-LR-24)
      persistencePolicy: {
        authStatePath: '/app/.wa-auth',
        requiresPersistentStorage: true,
        backupEveryHours: 6,
        backupRetentionCount: 50,
        walEnabled: true,
        walPath: '/app/.wa-wal',
        walFlushIntervalSec: 60,
      },

      // Failover policy (DoD-LR-18)
      failoverPolicy: {
        enabled: true,
        leaseSec: 120,
        renewEverySec: 60,
        takeoverAfterLeaseExpirySec: 5,
        maxStandbyReplicasAllowed: 1,
      },

      // Circuit breaker policy (DoD-LR-19)
      circuitBreakerPolicy: {
        reconnectLoopThreshold: 10, // in 10 min
        enterSafeModeMin: 30,
        maxRemediationsPerHour: 3,
        backoffBaseMs: 1000,
        backoffMaxMs: 60000,
        jitter: true,
      },

      // Preflight policy (DoD-LR-20)
      preflightPolicy: {
        enabled: true,
        canaryMode: false,
        requireConfigPresent: true,
        requireAuthStatePresent: true, // except first-time
        requireNoOtherLeader: true,
      },

      // Restart policy (DoD-LR-27)
      restartPolicy: {
        crashToRecoverEnabled: true,
        maxCrashesPerHour: 2,
        stuckThresholdSec: 300, // 5 min without heartbeat
      },
    };

    await configRef.set(config, { merge: true });
    return config;
  }

  /**
   * Acquire distributed lock (DoD-LR-4)
   */
  async acquireLock(lockName, holderInstanceId, leaseDurationMs = 120000) {
    const lockRef = this.db.doc(`${this.collectionPrefix}/locks/${lockName}`);

    try {
      const result = await this.db.runTransaction(async transaction => {
        const lockDoc = await transaction.get(lockRef);
        const now = Date.now();

        if (lockDoc.exists) {
          const data = lockDoc.data();
          if (data.leaseUntilTs > now) {
            return false; // Lock held by someone else
          }
        }

        const renewCount = lockDoc.exists ? (lockDoc.data().renewCount || 0) + 1 : 1;

        transaction.set(lockRef, {
          holderInstanceId,
          leaseUntilTs: now + leaseDurationMs,
          updatedAt: FieldValue.serverTimestamp(),
          renewCount,
        });

        return true;
      });

      return result;
    } catch (error) {
      console.error(`[Schema] Lock acquisition failed for ${lockName}:`, error);
      return false;
    }
  }

  /**
   * Release lock
   */
  async releaseLock(lockName, holderInstanceId) {
    const lockRef = this.db.doc(`${this.collectionPrefix}/locks/${lockName}`);

    try {
      await this.db.runTransaction(async transaction => {
        const lockDoc = await transaction.get(lockRef);

        if (lockDoc.exists) {
          const data = lockDoc.data();
          if (data.holderInstanceId === holderInstanceId) {
            transaction.delete(lockRef);
          }
        }
      });
    } catch (error) {
      console.error(`[Schema] Lock release failed for ${lockName}:`, error);
    }
  }

  /**
   * Create run document (DoD-LR-2)
   */
  async createRun(runKey, commitHash, deploymentId, instanceId, mode) {
    const runRef = this.db.doc(`${this.collectionPrefix}/runs/${runKey}`);

    const runDoc = {
      runKey,
      startTs: Date.now(),
      commitHash,
      deploymentId,
      instanceId,
      mode, // leader|standby|canary
      status: 'running',
      createdAt: FieldValue.serverTimestamp(),
    };

    await runRef.set(runDoc);
    return runDoc;
  }

  /**
   * Write heartbeat (DoD-LR-2)
   */
  async writeHeartbeat(bucketId, data) {
    const hbRef = this.db.doc(`${this.collectionPrefix}/heartbeats/${bucketId}`);

    const hbDoc = {
      bucketId,
      ts: data.ts,
      tsIso: new Date(data.ts).toISOString(),
      commitHash: data.commitHash,
      serviceVersion: data.serviceVersion,
      instanceId: data.instanceId,
      mode: data.mode,
      uptimeSec: data.uptimeSec,
      memoryRss: data.memoryRss,
      connectedCount: data.connectedCount,
      reconnectingCount: data.reconnectingCount,
      needsQrCount: data.needsQrCount,
      queueDepth: data.queueDepth,
      expectedIntervalSec: data.expectedIntervalSec,
      driftSec: data.driftSec,
      createdAt: FieldValue.serverTimestamp(),
    };

    await hbRef.set(hbDoc);
    return hbDoc;
  }

  /**
   * Write probe (DoD-LR-3)
   */
  async writeProbe(probeKey, data) {
    const probeRef = this.db.doc(`${this.collectionPrefix}/probes/${probeKey}`);

    const probeDoc = {
      probeKey,
      type: data.type, // outbound|inbound|queue|EXT_HTTP
      ts: data.ts,
      tsIso: new Date(data.ts).toISOString(),
      result: data.result, // PASS|FAIL
      latencyMs: data.latencyMs,
      details: data.details || {},
      relatedIds: data.relatedIds || [],
      trigger: data.trigger || 'scheduled', // scheduled|bootstrap|external
      commitHash: data.commitHash,
      serviceVersion: data.serviceVersion,
      instanceId: data.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    };

    await probeRef.set(probeDoc);
    return probeDoc;
  }

  /**
   * Create incident (DoD-LR-6)
   */
  async createIncident(incidentId, data) {
    const incidentRef = this.db.doc(`${this.collectionPrefix}/incidents/${incidentId}`);

    const incidentDoc = {
      incidentId,
      type: data.type, // logged_out|reconnect_loop|missed_heartbeat|probe_fail|queue_depth|auth_state_missing|failover|preflight_fail
      tsStart: data.tsStart,
      tsEnd: data.tsEnd || null,
      mttrSec: data.mttrSec || null,
      accountId: data.accountId,
      reason: data.reason,
      lastDisconnect: data.lastDisconnect || null,
      commitHash: data.commitHash,
      instanceId: data.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    };

    await incidentRef.set(incidentDoc);
    return incidentDoc;
  }

  /**
   * Write daily rollup (DoD-LR-5)
   */
  async writeRollup(date, data) {
    const rollupRef = this.db.doc(`${this.collectionPrefix}/rollups/${date}`);

    const rollupDoc = {
      date,
      expectedHb: data.expectedHb,
      writtenHb: data.writtenHb,
      missedHb: data.missedHb,
      uptimePct: data.uptimePct,
      probePassRates: data.probePassRates || {},
      mttrP50: data.mttrP50 || null,
      mttrP90: data.mttrP90 || null,
      mttrP95: data.mttrP95 || null,
      incidentsCount: data.incidentsCount || 0,
      insufficientData: data.insufficientData,
      numericCoverage: data.numericCoverage,
      commitHash: data.commitHash,
      serviceVersion: data.serviceVersion,
      instanceId: data.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    };

    await rollupRef.set(rollupDoc);
    return rollupDoc;
  }

  /**
   * Update state/current (DoD-LR-2)
   */
  async updateState(data) {
    const stateRef = this.db.doc(`${this.collectionPrefix}/state/current`);

    const stateDoc = {
      schedulerOwnerInstanceId: data.schedulerOwnerInstanceId,
      standbyInstanceId: data.standbyInstanceId || null,
      lastGoodHeartbeatTs: data.lastGoodHeartbeatTs,
      reconnectLoopCountRolling: data.reconnectLoopCountRolling || 0,
      safeMode: data.safeMode || false,
      safeModeUntilTs: data.safeModeUntilTs || null,
      lastRemediationTs: data.lastRemediationTs || null,
      authStateStatus: data.authStateStatus, // present|missing|corrupt
      preflightStatus: data.preflightStatus, // pass|fail
      preflightReason: data.preflightReason || null,
      commitHash: data.commitHash,
      instanceId: data.instanceId,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await stateRef.set(stateDoc, { merge: true });
    return stateDoc;
  }

  /**
   * Create remediation (DoD-LR-9)
   */
  async createRemediation(remediationId, data) {
    const remediationRef = this.db.doc(`${this.collectionPrefix}/remediations/${remediationId}`);

    const remediationDoc = {
      remediationId,
      type: data.type, // REACQUIRE_LOCK|RESET_BAILEYS|RESTART_SCHEDULER|RESTART_PROCESS|ENTER_SAFE_MODE|EXIT_SAFE_MODE|BACKOFF_RECONNECT|FAILOVER_TAKEOVER
      reason: data.reason,
      tsStart: data.tsStart,
      tsEnd: data.tsEnd || null,
      durationMs: data.durationMs || null,
      result: data.result, // PASS|FAIL
      details: data.details || {},
      relatedIds: data.relatedIds || [],
      commitHash: data.commitHash,
      instanceId: data.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    };

    await remediationRef.set(remediationDoc);
    return remediationDoc;
  }

  /**
   * Create audit (DoD-LR-8, DoD-LR-10, DoD-LR-11)
   */
  async createAudit(auditId, data) {
    const auditRef = this.db.doc(`${this.collectionPrefix}/audits/${auditId}`);

    const auditDoc = {
      auditId,
      type: data.type, // PREFLIGHT|CANARY|CHAOS_RESTART|CHAOS_LOCK|CHAOS_IDEMPOTENCY|STATE_PERSISTENCE|FAILOVER|CIRCUIT_BREAKER
      tsStart: data.tsStart,
      tsEnd: data.tsEnd || null,
      durationMs: data.durationMs || null,
      result: data.result, // PASS|FAIL
      details: data.details || {},
      relatedIds: data.relatedIds || [],
      commitHash: data.commitHash,
      instanceId: data.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    };

    await auditRef.set(auditDoc);
    return auditDoc;
  }

  /**
   * Create auth backup (DoD-LR-12, DoD-LR-16)
   */
  async createAuthBackup(backupId, data) {
    const backupRef = this.db.doc(`${this.collectionPrefix}/auth_backups/${backupId}`);

    const backupDoc = {
      backupId,
      ts: data.ts,
      tsIso: new Date(data.ts).toISOString(),
      result: data.result, // PASS|FAIL
      sizeBytes: data.sizeBytes,
      checksum: data.checksum,
      keyId: data.keyId || null,
      storageRef: data.storageRef, // path to backup file
      commitHash: data.commitHash,
      instanceId: data.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    };

    await backupRef.set(backupDoc);
    return backupDoc;
  }

  /**
   * Write WAL event (DoD-LR-24)
   */
  async writeWALEvent(eventId, data) {
    const walRef = this.db.doc(`${this.collectionPrefix}/wal/${eventId}`);

    const walDoc = {
      eventId,
      ts: data.ts,
      tsIso: new Date(data.ts).toISOString(),
      type: data.type, // heartbeat|probe|incident|remediation
      payload: data.payload,
      checksum: data.checksum,
      ack: data.ack || false, // true when flushed to Firestore
      ackTs: data.ackTs || null,
      commitHash: data.commitHash,
      instanceId: data.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    };

    await walRef.set(walDoc);
    return walDoc;
  }

  /**
   * Mark WAL event as acknowledged
   */
  async ackWALEvent(eventId) {
    const walRef = this.db.doc(`${this.collectionPrefix}/wal/${eventId}`);

    await walRef.update({
      ack: true,
      ackTs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  /**
   * Mark missing bucket (DoD-LR-25)
   */
  async markMissingBucket(bucketId, data) {
    const missingRef = this.db.doc(`${this.collectionPrefix}/missing_buckets/${bucketId}`);

    const missingDoc = {
      bucketId,
      expectedTs: data.expectedTs,
      detectedTs: data.detectedTs,
      reason: data.reason, // gap|restart|crash
      commitHash: data.commitHash,
      instanceId: data.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    };

    await missingRef.set(missingDoc);
    return missingDoc;
  }

  /**
   * Query heartbeats in time range
   */
  async queryHeartbeats(startTs, endTs, limit = 1000) {
    const snapshot = await this.db
      .collection(`${this.collectionPrefix}/heartbeats`)
      .where('ts', '>=', startTs)
      .where('ts', '<=', endTs)
      .orderBy('ts', 'asc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Query probes by type and time range
   */
  async queryProbes(type, startTs, endTs, limit = 1000) {
    const snapshot = await this.db
      .collection(`${this.collectionPrefix}/probes`)
      .where('type', '==', type)
      .where('ts', '>=', startTs)
      .where('ts', '<=', endTs)
      .orderBy('ts', 'asc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Get state/current
   */
  async getState() {
    const stateRef = this.db.doc(`${this.collectionPrefix}/state/current`);
    const doc = await stateRef.get();

    if (!doc.exists) {
      return null;
    }

    return { id: doc.id, ...doc.data() };
  }

  /**
   * Get config
   */
  async getConfig() {
    const configRef = this.db.doc(`${this.collectionPrefix}/config/current`);
    const doc = await configRef.get();

    if (!doc.exists) {
      return null;
    }

    return doc.data();
  }

  /**
   * Get rollup by date
   */
  async getRollup(date) {
    const rollupRef = this.db.doc(`${this.collectionPrefix}/rollups/${date}`);
    const doc = await rollupRef.get();

    if (!doc.exists) {
      return null;
    }

    return { id: doc.id, ...doc.data() };
  }

  /**
   * Generate deterministic bucket ID (yyyyMMddHHmmss)
   */
  generateBucketId(ts) {
    const date = new Date(ts);
    const yyyy = date.getUTCFullYear();
    const MM = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const HH = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');

    return `${yyyy}-${MM}-${dd}T${HH}-${mm}-${ss}`;
  }

  /**
   * Generate deterministic probe key
   */
  generateProbeKey(type, ts) {
    const date = new Date(ts);
    const yyyy = date.getUTCFullYear();
    const MM = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const HH = String(date.getUTCHours()).padStart(2, '0');

    return `${type}_${yyyy}${MM}${dd}${HH}`;
  }

  /**
   * Generate deterministic remediation ID
   */
  generateRemediationId(type, ts) {
    const date = new Date(ts);
    const yyyy = date.getUTCFullYear();
    const MM = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const HH = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');

    return `REM_${yyyy}${MM}${dd}${HH}${mm}${ss}_${type}`;
  }

  /**
   * Generate deterministic audit ID
   */
  generateAuditId(type, ts) {
    const date = new Date(ts);
    const yyyy = date.getUTCFullYear();
    const MM = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const HH = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');

    return `AUD_${yyyy}${MM}${dd}${HH}${mm}${ss}_${type}`;
  }

  /**
   * Generate deterministic backup ID
   */
  generateBackupId(ts) {
    const date = new Date(ts);
    const yyyy = date.getUTCFullYear();
    const MM = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const HH = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');

    return `AUTH_${yyyy}${MM}${dd}${HH}${mm}`;
  }

  /**
   * Generate deterministic WAL event ID
   */
  generateWALEventId(type, ts) {
    const date = new Date(ts);
    const yyyy = date.getUTCFullYear();
    const MM = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const HH = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    const ms = String(date.getUTCMilliseconds()).padStart(3, '0');

    return `WAL_${yyyy}${MM}${dd}${HH}${mm}${ss}${ms}_${type}`;
  }
}

module.exports = LongRunSchemaComplete;
