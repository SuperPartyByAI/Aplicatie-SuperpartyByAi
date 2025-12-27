/**
 * Auto-Repair System
 * Escalation: Health Check → Restart → Redeploy → Rollback
 */

const https = require('https');

class AutoRepair {
  constructor(railwayToken) {
    this.token = railwayToken;
    this.repairHistory = new Map();
    this.maxRestartAttempts = 3;
    this.maxRedeployAttempts = 2;
  }
  
  railwayAPI(query, variables = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ query, variables });
      
      const options = {
        hostname: 'backboard.railway.app',
        path: '/graphql/v2',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };
      
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.errors) {
              reject(new Error(json.errors[0].message));
            } else {
              resolve(json.data);
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
  
  getRepairState(serviceId) {
    if (!this.repairHistory.has(serviceId)) {
      this.repairHistory.set(serviceId, {
        restartCount: 0,
        redeployCount: 0,
        lastRestart: null,
        lastRedeploy: null,
        lastRollback: null,
        consecutiveFailures: 0
      });
    }
    return this.repairHistory.get(serviceId);
  }
  
  resetRepairState(serviceId) {
    this.repairHistory.delete(serviceId);
    console.log(`✅ [AutoRepair] Reset repair state for ${serviceId}`);
  }
  
  /**
   * Step 1: Restart service instance
   */
  async restartService(serviceId, serviceName) {
    const state = this.getRepairState(serviceId);
    
    if (state.restartCount >= this.maxRestartAttempts) {
      console.log(`⚠️  [AutoRepair] Max restart attempts reached for ${serviceName}`);
      return { success: false, escalate: true };
    }
    
    try {
      console.log(`🔄 [AutoRepair] Restarting ${serviceName}...`);
      
      const mutation = `
        mutation RestartService($serviceId: String!) {
          serviceInstanceRestart(serviceId: $serviceId)
        }
      `;
      
      await this.railwayAPI(mutation, { serviceId });
      
      state.restartCount++;
      state.lastRestart = new Date().toISOString();
      
      console.log(`✅ [AutoRepair] ${serviceName} restarted (attempt ${state.restartCount}/${this.maxRestartAttempts})`);
      
      return { success: true, action: 'restart' };
    } catch (error) {
      console.error(`❌ [AutoRepair] Restart failed:`, error.message);
      return { success: false, escalate: true };
    }
  }
  
  /**
   * Step 2: Redeploy service
   */
  async redeployService(serviceId, serviceName) {
    const state = this.getRepairState(serviceId);
    
    if (state.redeployCount >= this.maxRedeployAttempts) {
      console.log(`⚠️  [AutoRepair] Max redeploy attempts reached for ${serviceName}`);
      return { success: false, escalate: true };
    }
    
    try {
      console.log(`🚀 [AutoRepair] Redeploying ${serviceName}...`);
      
      const mutation = `
        mutation RedeployService($serviceId: String!) {
          serviceRedeploy(serviceId: $serviceId)
        }
      `;
      
      await this.railwayAPI(mutation, { serviceId });
      
      state.redeployCount++;
      state.lastRedeploy = new Date().toISOString();
      
      console.log(`✅ [AutoRepair] ${serviceName} redeployed (attempt ${state.redeployCount}/${this.maxRedeployAttempts})`);
      
      return { success: true, action: 'redeploy' };
    } catch (error) {
      console.error(`❌ [AutoRepair] Redeploy failed:`, error.message);
      return { success: false, escalate: true };
    }
  }
  
  /**
   * Step 3: Rollback to previous deployment
   */
  async rollbackService(serviceId, serviceName) {
    try {
      console.log(`⏪ [AutoRepair] Rolling back ${serviceName}...`);
      
      // Get previous deployment
      const query = `
        query GetDeployments($serviceId: String!) {
          service(id: $serviceId) {
            deployments(first: 5) {
              edges {
                node {
                  id
                  status
                  createdAt
                }
              }
            }
          }
        }
      `;
      
      const data = await this.railwayAPI(query, { serviceId });
      const deployments = data.service?.deployments?.edges || [];
      
      // Find last successful deployment
      const successfulDeployment = deployments.find(d => 
        d.node.status === 'SUCCESS' && d.node.id !== deployments[0]?.node.id
      );
      
      if (!successfulDeployment) {
        console.error(`❌ [AutoRepair] No previous successful deployment found`);
        return { success: false, action: 'rollback' };
      }
      
      // Trigger rollback (redeploy old version)
      const mutation = `
        mutation RollbackDeployment($deploymentId: String!) {
          deploymentRedeploy(id: $deploymentId)
        }
      `;
      
      await this.railwayAPI(mutation, { deploymentId: successfulDeployment.node.id });
      
      const state = this.getRepairState(serviceId);
      state.lastRollback = new Date().toISOString();
      
      console.log(`✅ [AutoRepair] ${serviceName} rolled back to previous version`);
      
      return { success: true, action: 'rollback' };
    } catch (error) {
      console.error(`❌ [AutoRepair] Rollback failed:`, error.message);
      return { success: false, action: 'rollback' };
    }
  }
  
  /**
   * Main repair orchestration
   */
  async repair(serviceId, serviceName, issue) {
    console.log(`\n🔧 [AutoRepair] Starting repair for ${serviceName}`);
    console.log(`   Issue: ${issue}`);
    
    const state = this.getRepairState(serviceId);
    state.consecutiveFailures++;
    
    // Step 1: Try restart first
    if (state.restartCount < this.maxRestartAttempts) {
      const result = await this.restartService(serviceId, serviceName);
      if (result.success) {
        return result;
      }
    }
    
    // Step 2: Try redeploy
    if (state.redeployCount < this.maxRedeployAttempts) {
      const result = await this.redeployService(serviceId, serviceName);
      if (result.success) {
        return result;
      }
    }
    
    // Step 3: Last resort - rollback
    const result = await this.rollbackService(serviceId, serviceName);
    
    if (!result.success) {
      console.error(`💥 [AutoRepair] All repair attempts failed for ${serviceName}`);
      console.error(`   Manual intervention required!`);
    }
    
    return result;
  }
  
  /**
   * Record successful recovery
   */
  recordSuccess(serviceId) {
    this.resetRepairState(serviceId);
  }
}

module.exports = AutoRepair;
