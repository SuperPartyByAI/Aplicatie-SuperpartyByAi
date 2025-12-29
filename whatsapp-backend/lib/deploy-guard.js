/**
 * DEPLOY GUARD - Detects deploy mismatch and creates incidents
 * Prevents silent deploy failures
 */

const https = require('https');

class DeployGuard {
  constructor(db, schema, baseUrl, expectedCommit) {
    this.db = db;
    this.schema = schema;
    this.baseUrl = baseUrl;
    this.expectedCommit = expectedCommit;
    this.checkInterval = 5 * 60 * 1000; // 5 minutes
    this.mismatchThreshold = 10 * 60 * 1000; // 10 minutes
    this.lastMismatchDetected = null;
    this.incidentCreated = false;
  }

  start() {
    console.log('[DeployGuard] Starting deploy guard...');
    console.log(`[DeployGuard] Expected commit: ${this.expectedCommit}`);
    
    // Check immediately
    this.checkDeployStatus();
    
    // Then check every 5 minutes
    this.interval = setInterval(() => {
      this.checkDeployStatus();
    }, this.checkInterval);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async checkDeployStatus() {
    try {
      const healthData = await this.fetchHealth();
      
      if (!healthData || !healthData.commit) {
        console.error('[DeployGuard] Failed to fetch health data');
        return;
      }

      const deployedCommit = healthData.commit;
      
      if (deployedCommit === this.expectedCommit) {
        // Match - reset mismatch tracking
        if (this.lastMismatchDetected) {
          console.log('[DeployGuard] ✅ Deploy mismatch resolved');
          this.lastMismatchDetected = null;
          this.incidentCreated = false;
        }
        return;
      }

      // Mismatch detected
      const now = Date.now();
      
      if (!this.lastMismatchDetected) {
        this.lastMismatchDetected = now;
        console.log(`[DeployGuard] ⚠️ Deploy mismatch detected: expected ${this.expectedCommit}, got ${deployedCommit}`);
        return;
      }

      const mismatchDuration = now - this.lastMismatchDetected;
      
      if (mismatchDuration > this.mismatchThreshold && !this.incidentCreated) {
        // Create incident
        await this.createDeployStuckIncident(deployedCommit, mismatchDuration);
        this.incidentCreated = true;
      }
    } catch (error) {
      console.error('[DeployGuard] Error checking deploy status:', error);
    }
  }

  async createDeployStuckIncident(deployedCommit, mismatchDuration) {
    try {
      const incidentId = `INC_DEPLOY_STUCK_${Date.now()}`;
      
      const incident = {
        incidentId,
        type: 'deploy_stuck',
        tsStart: Date.now(),
        tsEnd: null,
        mttrSec: null,
        accountId: null,
        reason: `Deploy stuck: expected ${this.expectedCommit}, deployed ${deployedCommit}`,
        lastDisconnect: null,
        details: {
          expectedCommit: this.expectedCommit,
          deployedCommit: deployedCommit,
          mismatchDurationMs: mismatchDuration,
          instructions: [
            '1. Go to Railway dashboard',
            '2. Click "Deployments" tab',
            '3. Find latest commit and click "Redeploy"',
            '4. OR run: railway up --service whatsapp-backend'
          ]
        },
        commitHash: this.expectedCommit,
        instanceId: process.env.RAILWAY_DEPLOYMENT_ID || 'unknown',
        createdAt: new Date().toISOString()
      };

      await this.schema.createIncident(incidentId, incident);
      
      console.error('[DeployGuard] 🚨 INCIDENT CREATED:', incidentId);
      console.error('[DeployGuard] Expected:', this.expectedCommit);
      console.error('[DeployGuard] Deployed:', deployedCommit);
      console.error('[DeployGuard] Duration:', Math.floor(mismatchDuration / 1000), 'seconds');
      
      // TODO: Send Telegram alert if configured
    } catch (error) {
      console.error('[DeployGuard] Failed to create incident:', error);
    }
  }

  fetchHealth() {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}/health`;
      
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }
}

module.exports = DeployGuard;
