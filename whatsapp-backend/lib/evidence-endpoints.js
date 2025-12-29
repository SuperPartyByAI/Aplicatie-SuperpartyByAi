/**
 * EVIDENCE ENDPOINTS - ANTI-HALUCINATION LAYER
 * Produces raw evidence via curl (eliminates "no local credentials" excuse)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class EvidenceEndpoints {
  constructor(app, db, schema, adminToken) {
    this.app = app;
    this.db = db;
    this.schema = schema;
    this.adminToken = adminToken;
    
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
        
        res.json({
          success: true,
          timestamp: new Date().toISOString(),
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

    // POST /api/longrun/firestore-write-test
    this.app.post('/api/longrun/firestore-write-test', this.verifyToken.bind(this), async (req, res) => {
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
    });

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
        // This will be implemented by the bootstrap runner
        res.json({
          success: true,
          message: 'Bootstrap runner not yet implemented',
          timestamp: new Date().toISOString()
        });
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
  }
}

module.exports = EvidenceEndpoints;
