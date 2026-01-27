/**
 * DEPLOY GUARD - Detects deploy mismatch and creates incidents
 * Prevents silent deploy failures
 */

const http = require('http');
const https = require('https');

class DeployGuard {
  constructor(db, schema, baseUrl, expectedCommit) {
    this.db = db;
    this.schema = schema;
    // Normalize baseUrl: ensure it has a protocol
    if (typeof baseUrl === 'string' && baseUrl && !baseUrl.match(/^https?:\/\//)) {
      // If no protocol, default to http://
      this.baseUrl = `http://${baseUrl.replace(/^\/+/, '')}`;
    } else {
      this.baseUrl = baseUrl || `http://localhost:8080`;
    }
    this.expectedCommit = expectedCommit;
    // Choose http module based on protocol
    this.httpModule = typeof this.baseUrl === 'string' && this.baseUrl.startsWith('https://') ? https : http;
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
        console.log(
          `[DeployGuard] ⚠️ Deploy mismatch detected: expected ${this.expectedCommit}, got ${deployedCommit}`
        );
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
            '1. SSH to Hetzner server',
            '2. cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend',
            '3. git pull && npm install',
            '4. systemctl restart whatsapp-backend',
          ],
        },
        commitHash: this.expectedCommit,
        instanceId: process.env.HOSTNAME || process.env.INSTANCE_ID || 'unknown',
        createdAt: new Date().toISOString(),
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
      // Normalize URL: ensure /health path is properly appended
      let url = this.baseUrl;
      if (!url.endsWith('/health')) {
        url = url.replace(/\/+$/, '') + '/health';
      }

      // Parse URL to extract hostname and path
      try {
        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (this.httpModule === https ? 443 : 80),
          path: urlObj.pathname + (urlObj.search || ''),
          method: 'GET',
        };

        const req = this.httpModule.get(options, res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            try {
              if (res.statusCode === 200) {
                resolve(JSON.parse(data));
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              }
            } catch (e) {
              reject(new Error(`Failed to parse response: ${e.message}`));
            }
          });
        });

        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
      } catch (urlError) {
        reject(new Error(`Invalid URL: ${url} - ${urlError.message}`));
      }
    });
  }
}

module.exports = DeployGuard;
