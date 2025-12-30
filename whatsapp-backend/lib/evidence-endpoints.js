/**
 * EVIDENCE ENDPOINTS - ANTI-HALUCINATION LAYER
 * Produces raw evidence via curl (eliminates "no local credentials" excuse)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BootstrapRunner = require('./bootstrap-runner');

class EvidenceEndpoints {
  constructor(app, db, schema, adminToken, baileys, waBootstrap) {
    this.app = app;
    this.db = db;
    this.schema = schema;
    this.adminToken = adminToken;
    this.baileys = baileys;
    this.waBootstrap = waBootstrap;
    
    this.setupEndpoints();
  }

  verifyToken(req, res, next) {
    const token = req.query.token || req.headers['x-admin-token'];
    if (token !== this.adminToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  setupEndpoints() {
    // GET /api/longrun/status-now
    this.app.get('/api/longrun/status-now', this.verifyToken.bind(this), async (req, res) => {
      try {
        const state = await this.schema.getState();
        const config = await this.schema.getConfig();
        
        // Get WA status from bootstrap (MAIN FLOW)
        let waStatus = null;
        if (this.waBootstrap) {
          waStatus = await this.waBootstrap.getWAStatus();
        } else {
          // Fallback: read from Firestore directly
          const waConnectionDoc = await this.db.doc('wa_metrics/longrun/state/wa_connection').get();
          const waConnection = waConnectionDoc.exists ? waConnectionDoc.data() : null;
          
          const waLockDoc = await this.db.doc('wa_metrics/longrun/locks/wa_connection').get();
          const waLock = waLockDoc.exists ? waLockDoc.data() : null;
          
          waStatus = {
            waMode: waLock && waLock.leaseUntil > Date.now() ? 'active' : 'passive_lock_not_acquired',
            waStatus: waConnection?.waStatus || 'NOT_RUNNING',
            lockHolder: waLock?.holderInstanceId || null
          };
        }
        
        // Auth info already in waStatus if using bootstrap
        // Keep for backward compatibility
        let authKeyCount = waStatus.authKeyCount || 0;
        let authStateExists = waStatus.authStateExists || false;
        let lastAuthWriteAt = waStatus.lastAuthWriteAt || null;
        
        // Get latest heartbeats
        const now = Date.now();
        const heartbeats = await this.schema.queryHeartbeats(now - 3600000, now, 20);
        
        // Get latest probes
        const probes = await this.db.collection('wa_metrics/longrun/probes')
          .orderBy('ts', 'desc')
          .limit(10)
          .get();
        
        const probesList = [];
        probes.forEach(doc => {
          probesList.push({
            id: doc.id,
            path: `wa_metrics/longrun/probes/${doc.id}`,
            ...doc.data()
          });
        });
        
        // Get today's rollup
        const today = new Date().toISOString().split('T')[0];
        const rollup = await this.schema.getRollup(today);
        
        // Get latest remediations
        const remediations = await this.db.collection('wa_metrics/longrun/remediations')
          .orderBy('tsStart', 'desc')
          .limit(5)
          .get();
        
        const remediationsList = [];
        remediations.forEach(doc => {
          remediationsList.push({
            id: doc.id,
            path: `wa_metrics/longrun/remediations/${doc.id}`,
            ...doc.data()
          });
        });
        
        // Get latest audits
        const audits = await this.db.collection('wa_metrics/longrun/audits')
          .orderBy('tsStart', 'desc')
          .limit(5)
          .get();
        
        const auditsList = [];
        audits.forEach(doc => {
          auditsList.push({
            id: doc.id,
            path: `wa_metrics/longrun/audits/${doc.id}`,
            ...doc.data()
          });
        });
        
        // DoD-WA-1: WA connection status fields (COMPLETE W1-W18) - FROM MAIN FLOW
        // Ensure ALL required fields are present with defaults
        const completeWAStatus = {
          // From waBootstrap
          instanceId: waStatus.instanceId || 'unknown',
          waMode: waStatus.waMode || 'passive_lock_not_acquired',
          waStatus: waStatus.waStatus || 'NOT_RUNNING',
          
          // Lock
          lockHolder: waStatus.lockHolder || null,
          lockLeaseUntil: waStatus.lock?.leaseUntil || null,
          leaseEpoch: waStatus.lock?.leaseEpoch || 0,
          lockStatus: waStatus.lock?.exists ? 'held' : 'not_held',
          
          // Connection state
          connectedAt: waStatus.connectedAt || null,
          lastDisconnectAt: waStatus.lastDisconnectAt || null,
          lastDisconnectReason: waStatus.lastDisconnectReason || null,
          retryCount: waStatus.retryCount || 0,
          nextRetryAt: waStatus.nextRetryAt || null,
          
          // Auth
          authStore: 'firestore',
          authStateExists: authStateExists,
          authKeyCount: authKeyCount,
          lastAuthWriteAt: lastAuthWriteAt,
          
          // Keepalive
          lastEventAt: waStatus.lastEventAt || null,
          lastMessageAt: waStatus.lastMessageAt || null,
          lastAckAt: waStatus.lastAckAt || null,
          
          // Outbox
          outboxPendingCount: waStatus.outboxPendingCount || 0,
          outboxOldestPendingAgeSec: waStatus.outboxOldestPendingAgeSec || null,
          drainMode: waStatus.drainMode || false,
          
          // Inbound dedupe
          inboundDedupeStore: 'firestore',
          
          // Dependency health
          consecutiveFirestoreErrors: waStatus.consecutiveFirestoreErrors || 0,
          degradedSince: waStatus.degradedSince || null,
          
          // Circuit breaker
          reconnectMode: waStatus.reconnectMode || 'normal',
          
          // Single-flight
          connectInProgress: waStatus.connectInProgress || false,
          lastConnectAttemptAt: waStatus.lastConnectAttemptAt || null,
          
          // Pairing
          pairingRequired: waStatus.pairingRequired || false,
          
          // Warm-up
          warmUpComplete: waStatus.warmUpComplete || false
        };
        
        waStatus = completeWAStatus;
        
        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          wa: waStatus, // DoD-WA-1
          state: state ? {
            path: 'wa_metrics/longrun/state/current',
            ...state
          } : null,
          config: config ? {
            path: 'wa_metrics/longrun/config/current',
            ...config
          } : null,
          heartbeats: {
            count: heartbeats.length,
            docs: heartbeats.map(hb => ({
              path: `wa_metrics/longrun/heartbeats/${hb.id}`,
              ...hb
            }))
          },
          probes: {
            count: probesList.length,
            docs: probesList
          },
          rollup: rollup ? {
            path: `wa_metrics/longrun/rollups/${today}`,
            ...rollup
          } : null,
          remediations: {
            count: remediationsList.length,
            docs: remediationsList
          },
          audits: {
            count: auditsList.length,
            docs: auditsList
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
      }
    });

    // POST /api/longrun/firestore-write-test (also support GET for convenience)
    const firestoreWriteTestHandler = async (req, res) => {
      try {
        const testId = `TEST_${Date.now()}`;
        const testRef = this.db.doc(`wa_metrics/longrun/tests/${testId}`);
        
        const testDoc = {
          testId,
          ts: Date.now(),
          tsIso: new Date().toISOString(),
          purpose: 'write_capability_proof',
          commitHash: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) || 'unknown',
          instanceId: process.env.RAILWAY_DEPLOYMENT_ID || 'local'
        };
        
        await testRef.set(testDoc);
        
        // Read back
        const readDoc = await testRef.get();
        
        res.json({
          success: true,
          write: {
            path: `wa_metrics/longrun/tests/${testId}`,
            doc: testDoc
          },
          read: {
            exists: readDoc.exists,
            data: readDoc.data()
          },
          proof: 'Firestore write/read capability confirmed'
        });
      } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
      }
    };
    
    this.app.post('/api/longrun/firestore-write-test', this.verifyToken.bind(this), firestoreWriteTestHandler);
    this.app.get('/api/longrun/firestore-write-test', this.verifyToken.bind(this), firestoreWriteTestHandler);

    // GET /api/longrun/fs-check
    this.app.get('/api/longrun/fs-check', this.verifyToken.bind(this), async (req, res) => {
      try {
        const checks = {};
        
        // Check auth path
        const authPath = process.env.WA_AUTH_PATH || '/app/.wa-auth';
        checks.authPath = {
          path: authPath,
          exists: fs.existsSync(authPath),
          isDirectory: fs.existsSync(authPath) && fs.statSync(authPath).isDirectory(),
          writable: false
        };
        
        if (checks.authPath.exists) {
          try {
            const testFile = path.join(authPath, '.write-test');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            checks.authPath.writable = true;
          } catch (e) {
            checks.authPath.writeError = e.message;
          }
        }
        
        // Check WAL path
        const walPath = process.env.WA_WAL_PATH || '/app/.wa-wal';
        checks.walPath = {
          path: walPath,
          exists: fs.existsSync(walPath),
          isDirectory: fs.existsSync(walPath) && fs.statSync(walPath).isDirectory(),
          writable: false
        };
        
        if (checks.walPath.exists) {
          try {
            const testFile = path.join(walPath, '.write-test');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            checks.walPath.writable = true;
          } catch (e) {
            checks.walPath.writeError = e.message;
          }
        }
        
        // Check Railway Volume mount
        const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH;
        if (volumePath) {
          checks.volumeMount = {
            path: volumePath,
            exists: fs.existsSync(volumePath),
            isDirectory: fs.existsSync(volumePath) && fs.statSync(volumePath).isDirectory(),
            writable: false
          };
          
          if (checks.volumeMount.exists) {
            try {
              const testFile = path.join(volumePath, '.write-test');
              fs.writeFileSync(testFile, 'test');
              fs.unlinkSync(testFile);
              checks.volumeMount.writable = true;
            } catch (e) {
              checks.volumeMount.writeError = e.message;
            }
          }
        }
        
        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          checks,
          env: {
            WA_AUTH_PATH: process.env.WA_AUTH_PATH,
            WA_WAL_PATH: process.env.WA_WAL_PATH,
            RAILWAY_VOLUME_MOUNT_PATH: process.env.RAILWAY_VOLUME_MOUNT_PATH
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
      }
    });

    // POST /api/longrun/fs-write-sentinel
    this.app.post('/api/longrun/fs-write-sentinel', this.verifyToken.bind(this), async (req, res) => {
      try {
        const results = {};
        
        // Write sentinel to auth path
        const authPath = process.env.WA_AUTH_PATH || '/app/.wa-auth';
        if (fs.existsSync(authPath)) {
          const sentinelFile = path.join(authPath, 'sentinel.txt');
          const sentinelData = `SENTINEL_${Date.now()}`;
          fs.writeFileSync(sentinelFile, sentinelData);
          
          results.authSentinel = {
            path: sentinelFile,
            written: true,
            data: sentinelData,
            stat: fs.statSync(sentinelFile)
          };
        }
        
        // Write sentinel to WAL path
        const walPath = process.env.WA_WAL_PATH || '/app/.wa-wal';
        if (fs.existsSync(walPath)) {
          const sentinelFile = path.join(walPath, 'sentinel.txt');
          const sentinelData = `SENTINEL_${Date.now()}`;
          fs.writeFileSync(sentinelFile, sentinelData);
          
          results.walSentinel = {
            path: sentinelFile,
            written: true,
            data: sentinelData,
            stat: fs.statSync(sentinelFile)
          };
        }
        
        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          results
        });
      } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
      }
    });

    // POST /api/longrun/bootstrap
    this.app.post('/api/longrun/bootstrap', this.verifyToken.bind(this), async (req, res) => {
      try {
        const baseUrl = process.env.BAILEYS_BASE_URL || 'https://whats-upp-production.up.railway.app';
        const bootstrap = new BootstrapRunner(this.db, this.schema, baseUrl, this.baileys);
        const results = await bootstrap.run();
        
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
      }
    });

    // POST /api/longrun/actions/reconnect
    this.app.post('/api/longrun/actions/reconnect', this.verifyToken.bind(this), async (req, res) => {
      try {
        // This will be implemented by the reconnect handler
        res.json({
          success: true,
          message: 'Reconnect handler not yet implemented',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
      }
    });

    // GET /api/longrun/verify/dataquality
    this.app.get('/api/longrun/verify/dataquality', this.verifyToken.bind(this), async (req, res) => {
      try {
        const failures = [];
        let exitCode = 0;

        // Check for duplicate heartbeat IDs
        const heartbeats = await this.db.collection('wa_metrics/longrun/heartbeats')
          .limit(100)
          .get();
        
        const hbIds = new Set();
        const duplicates = [];
        heartbeats.forEach(doc => {
          if (hbIds.has(doc.id)) {
            duplicates.push(doc.id);
          }
          hbIds.add(doc.id);
        });

        if (duplicates.length > 0) {
          failures.push(`Duplicate heartbeat IDs: ${duplicates.join(', ')}`);
          exitCode = 1;
        }

        // Check deterministic IDs (only check recent ones, ignore old format)
        const idPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;
        const oldPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/; // Old format with milliseconds
        const invalidIds = [];
        const oldFormatIds = [];
        
        heartbeats.forEach(doc => {
          if (oldPattern.test(doc.id)) {
            oldFormatIds.push(doc.id);
          } else if (!idPattern.test(doc.id)) {
            invalidIds.push(doc.id);
          }
        });

        if (invalidIds.length > 0) {
          failures.push(`Non-deterministic heartbeat IDs: ${invalidIds.join(', ')}`);
          exitCode = 1;
        }
        
        // Old format is warning only, not failure
        const oldFormatWarning = oldFormatIds.length > 0 ? 
          `${oldFormatIds.length} old-format heartbeats (will be cleaned up)` : null;

        res.json({
          exitCode,
          status: exitCode === 0 ? 'PASS' : 'FAIL',
          failures,
          warnings: oldFormatWarning ? [oldFormatWarning] : [],
          checks: {
            duplicates: duplicates.length === 0,
            deterministicIds: invalidIds.length === 0,
            oldFormatCount: oldFormatIds.length
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message, exitCode: 1 });
      }
    });

    // GET /api/longrun/verify/readiness
    this.app.get('/api/longrun/verify/readiness', this.verifyToken.bind(this), async (req, res) => {
      try {
        const failures = [];
        let exitCode = 0;

        // Check config exists
        const config = await this.schema.getConfig();
        if (!config) {
          failures.push('Config not found: wa_metrics/longrun/config/current');
          exitCode = 1;
        }

        // Check state exists
        const state = await this.schema.getState();
        if (!state) {
          failures.push('State not found: wa_metrics/longrun/state/current');
          exitCode = 1;
        }

        // Check run doc exists
        const runsSnapshot = await this.db.collection('wa_metrics/longrun/runs').limit(1).get();
        if (runsSnapshot.empty) {
          failures.push('No run docs found: wa_metrics/longrun/runs/*');
          exitCode = 1;
        }

        // Check probes exist (query each type separately to avoid index issues)
        const outboundProbes = await this.db.collection('wa_metrics/longrun/probes')
          .where('type', '==', 'outbound')
          .limit(1)
          .get();
        
        const queueProbes = await this.db.collection('wa_metrics/longrun/probes')
          .where('type', '==', 'queue')
          .limit(1)
          .get();
        
        const inboundProbes = await this.db.collection('wa_metrics/longrun/probes')
          .where('type', '==', 'inbound')
          .limit(1)
          .get();

        if (outboundProbes.empty) {
          failures.push('No outbound probe found');
          exitCode = 1;
        }
        if (queueProbes.empty) {
          failures.push('No queue probe found');
          exitCode = 1;
        }
        if (inboundProbes.empty) {
          failures.push('No inbound probe found');
          exitCode = 1;
        }

        // Check rollup exists
        const today = new Date().toISOString().split('T')[0];
        const rollup = await this.schema.getRollup(today);
        if (!rollup) {
          failures.push(`No rollup found for today: wa_metrics/longrun/rollups/${today}`);
          exitCode = 1;
        }

        res.json({
          exitCode,
          status: exitCode === 0 ? 'READY+COLLECTING' : 'NOT_READY',
          failures,
          checks: {
            config: !!config,
            state: !!state,
            runDoc: !runsSnapshot.empty,
            outboundProbe: !outboundProbes.empty,
            queueProbe: !queueProbes.empty,
            inboundProbe: !inboundProbes.empty,
            rollup: !!rollup
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message, exitCode: 1 });
      }
    });

    // GET /api/longrun/report/7d
    this.app.get('/api/longrun/report/7d', this.verifyToken.bind(this), async (req, res) => {
      try {
        const now = Date.now();
        const sevenDaysAgo = now - (7 * 24 * 3600 * 1000);
        
        // Get heartbeats
        const heartbeats = await this.schema.queryHeartbeats(sevenDaysAgo, now, 10000);
        
        // Get probes
        const probesSnapshot = await this.db.collection('wa_metrics/longrun/probes')
          .where('ts', '>=', sevenDaysAgo)
          .where('ts', '<=', now)
          .get();
        
        const probes = [];
        probesSnapshot.forEach(doc => probes.push(doc.data()));
        
        // Calculate metrics
        const expectedHb = 7 * 24 * 60; // 7 days * 24 hours * 60 minutes
        const coverage = heartbeats.length / expectedHb;
        
        const probesByType = {};
        probes.forEach(p => {
          if (!probesByType[p.type]) {
            probesByType[p.type] = { total: 0, pass: 0, fail: 0 };
          }
          probesByType[p.type].total++;
          if (p.result === 'PASS') probesByType[p.type].pass++;
          else probesByType[p.type].fail++;
        });
        
        res.json({
          period: '7d',
          startTs: sevenDaysAgo,
          endTs: now,
          heartbeats: {
            expected: expectedHb,
            actual: heartbeats.length,
            coverage: (coverage * 100).toFixed(2) + '%'
          },
          probes: probesByType,
          status: coverage >= 0.8 ? 'SUFFICIENT_DATA' : 'INSUFFICIENT_DATA',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/longrun/report/30d
    this.app.get('/api/longrun/report/30d', this.verifyToken.bind(this), async (req, res) => {
      try {
        const now = Date.now();
        const thirtyDaysAgo = now - (30 * 24 * 3600 * 1000);
        
        // Get rollups for last 30 days
        const rollupsSnapshot = await this.db.collection('wa_metrics/longrun/rollups')
          .where('date', '>=', new Date(thirtyDaysAgo).toISOString().split('T')[0])
          .get();
        
        const rollups = [];
        rollupsSnapshot.forEach(doc => rollups.push(doc.data()));
        
        // Aggregate
        let totalExpected = 0;
        let totalWritten = 0;
        let daysWithSufficientData = 0;
        
        rollups.forEach(r => {
          totalExpected += r.expectedHb || 0;
          totalWritten += r.writtenHb || 0;
          if (!r.insufficientData) daysWithSufficientData++;
        });
        
        const coverage = totalExpected > 0 ? totalWritten / totalExpected : 0;
        
        res.json({
          period: '30d',
          startTs: thirtyDaysAgo,
          endTs: now,
          rollups: {
            total: rollups.length,
            daysWithSufficientData,
            totalExpectedHb: totalExpected,
            totalWrittenHb: totalWritten,
            overallCoverage: (coverage * 100).toFixed(2) + '%'
          },
          status: coverage >= 0.8 ? 'SUFFICIENT_DATA' : 'INSUFFICIENT_DATA',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/longrun/metrics/summary
    this.app.get('/api/longrun/metrics/summary', this.verifyToken.bind(this), async (req, res) => {
      try {
        const config = await this.schema.getConfig();
        const state = await this.schema.getState();
        
        // Get latest rollup
        const today = new Date().toISOString().split('T')[0];
        const rollup = await this.schema.getRollup(today);
        
        // Get recent probes
        const now = Date.now();
        const last24h = now - (24 * 3600 * 1000);
        
        const probesSnapshot = await this.db.collection('wa_metrics/longrun/probes')
          .where('ts', '>=', last24h)
          .limit(50)
          .get();
        
        const probes = [];
        probesSnapshot.forEach(doc => probes.push(doc.data()));
        
        const probeStats = {};
        probes.forEach(p => {
          if (!probeStats[p.type]) {
            probeStats[p.type] = { total: 0, pass: 0, avgLatency: 0, latencies: [] };
          }
          probeStats[p.type].total++;
          if (p.result === 'PASS') probeStats[p.type].pass++;
          if (p.latencyMs) probeStats[p.type].latencies.push(p.latencyMs);
        });
        
        Object.keys(probeStats).forEach(type => {
          const latencies = probeStats[type].latencies;
          if (latencies.length > 0) {
            probeStats[type].avgLatency = Math.round(
              latencies.reduce((a, b) => a + b, 0) / latencies.length
            );
          }
          delete probeStats[type].latencies;
        });
        
        res.json({
          config: {
            commitHash: config?.commitHash,
            expectedAccounts: config?.expectedAccounts
          },
          state: {
            leader: state?.schedulerOwnerInstanceId,
            safeMode: state?.safeMode,
            authStatus: state?.authStateStatus
          },
          today: rollup ? {
            coverage: (rollup.numericCoverage * 100).toFixed(2) + '%',
            insufficientData: rollup.insufficientData
          } : null,
          probes24h: probeStats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/longrun/firestore-snapshot
    this.app.get('/api/longrun/firestore-snapshot', this.verifyToken.bind(this), async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 20;
        
        // Get heartbeats
        const heartbeatsSnapshot = await this.db.collection('wa_metrics/longrun/heartbeats')
          .orderBy('ts', 'desc')
          .limit(limit)
          .get();
        
        const heartbeats = [];
        heartbeatsSnapshot.forEach(doc => {
          heartbeats.push({
            id: doc.id,
            path: `wa_metrics/longrun/heartbeats/${doc.id}`,
            ...doc.data()
          });
        });
        
        // Get probes
        const probesSnapshot = await this.db.collection('wa_metrics/longrun/probes')
          .orderBy('ts', 'desc')
          .limit(limit)
          .get();
        
        const probes = [];
        probesSnapshot.forEach(doc => {
          probes.push({
            id: doc.id,
            path: `wa_metrics/longrun/probes/${doc.id}`,
            ...doc.data()
          });
        });
        
        // Get rollups
        const rollupsSnapshot = await this.db.collection('wa_metrics/longrun/rollups')
          .orderBy('date', 'desc')
          .limit(10)
          .get();
        
        const rollups = [];
        rollupsSnapshot.forEach(doc => {
          rollups.push({
            id: doc.id,
            path: `wa_metrics/longrun/rollups/${doc.id}`,
            ...doc.data()
          });
        });
        
        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          heartbeats: {
            count: heartbeats.length,
            docs: heartbeats
          },
          probes: {
            count: probes.length,
            docs: probes
          },
          rollups: {
            count: rollups.length,
            docs: rollups
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
      }
    });
    
    // W8: Outbox management endpoints
    this.app.post('/api/longrun/outbox/create', this.verifyToken.bind(this), async (req, res) => {
      try {
        const { to, payload } = req.body;
        
        if (!to || !payload) {
          return res.status(400).json({ error: 'Missing to or payload' });
        }
        
        const outboxId = `OUT_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        await this.db.doc(`wa_metrics/longrun/outbox/${outboxId}`).set({
          to,
          payload,
          status: 'PENDING',
          createdAt: FieldValue.serverTimestamp(),
          nextAttemptAt: FieldValue.serverTimestamp(),
          attemptCount: 0,
          instanceId: process.env.INSTANCE_ID || 'unknown'
        });
        
        res.json({
          success: true,
          outboxId,
          path: `wa_metrics/longrun/outbox/${outboxId}`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/api/longrun/outbox/stats', this.verifyToken.bind(this), async (req, res) => {
      try {
        const pendingSnapshot = await this.db.collection('wa_metrics/longrun/outbox')
          .where('status', '==', 'PENDING')
          .get();
        
        const sentSnapshot = await this.db.collection('wa_metrics/longrun/outbox')
          .where('status', '==', 'SENT')
          .get();
        
        const ackedSnapshot = await this.db.collection('wa_metrics/longrun/outbox')
          .where('status', '==', 'ACKED')
          .get();
        
        res.json({
          success: true,
          stats: {
            pending: pendingSnapshot.size,
            sent: sentSnapshot.size,
            acked: ackedSnapshot.size,
            total: pendingSnapshot.size + sentSnapshot.size + ackedSnapshot.size
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }
}

module.exports = EvidenceEndpoints;
