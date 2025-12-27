/**
 * ULTIMATE MONITORING SYSTEM
 * Combină toate features:
 * - Intelligent Repair
 * - Chaos Engineering
 * - Canary Deployments
 * - Extreme Monitoring
 * 
 * Target: 99% success rate, 30s recovery, 70% prevention
 */

const fetch = require('node-fetch');
const IntelligentRepair = require('./intelligent-repair');
const ChaosEngineer = require('./chaos-engineer');
const CanaryDeploy = require('./canary-deploy');

class UltimateMonitor {
  constructor() {
    // Services to monitor
    this.services = [
      {
        id: process.env.BACKEND_SERVICE_ID || 'backend',
        name: 'Backend Node.js',
        url: process.env.BACKEND_URL || 'https://web-production-00dca9.up.railway.app',
        healthPath: '/',
        critical: true
      },
      {
        id: process.env.COQUI_SERVICE_ID || 'coqui',
        name: 'Coqui Voice Service',
        url: process.env.COQUI_API_URL || 'https://coqui-production-xyz.up.railway.app',
        healthPath: '/health',
        critical: false
      }
    ];
    
    // Initialize subsystems
    this.intelligentRepair = new IntelligentRepair();
    this.chaosEngineer = new ChaosEngineer(this.services);
    this.canaryDeploy = new CanaryDeploy();
    
    // Configuration
    this.config = {
      healthCheckInterval: 5000,         // 5s
      maxConsecutiveFailures: 1,         // Trigger after 1 failure
      selfHealingEnabled: true,
      chaosTestingEnabled: false,        // Enable manually
      chaosTestInterval: 24 * 60 * 60 * 1000  // 24 hours
    };
    
    // State tracking
    this.state = {};
    this.services.forEach(service => {
      this.state[service.id] = {
        status: 'unknown',
        consecutiveFailures: 0,
        lastSuccess: null,
        lastFailure: null,
        responseTime: 0,
        uptime: 100,
        totalChecks: 0,
        successfulChecks: 0,
        repairInProgress: false,
        repairHistory: [],
        selfHealingCount: 0,
        preventedFailures: 0
      };
    });
    
    console.log('🚀 ULTIMATE MONITOR initialized');
    console.log(`⚡ Health checks every ${this.config.healthCheckInterval/1000}s`);
    console.log(`🧠 Intelligent repair: ENABLED`);
    console.log(`🔧 Self-healing: ${this.config.selfHealingEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🔥 Chaos testing: ${this.config.chaosTestingEnabled ? 'ENABLED' : 'DISABLED'}`);
  }
  
  /**
   * Start monitoring
   */
  start() {
    console.log('\n🔍 Starting ULTIMATE monitoring...\n');
    
    // Initial health check
    this.services.forEach(service => this.checkHealth(service));
    
    // Continuous health checks
    setInterval(() => {
      this.services.forEach(service => this.checkHealth(service));
    }, this.config.healthCheckInterval);
    
    // Status report every minute
    setInterval(() => this.printStatus(), 60000);
    
    // Chaos testing (if enabled)
    if (this.config.chaosTestingEnabled) {
      this.chaosEngineer.runContinuous(this.config.chaosTestInterval);
    }
  }
  
  /**
   * Health check with intelligent repair
   */
  async checkHealth(service) {
    const startTime = Date.now();
    const state = this.state[service.id];
    
    try {
      // Deep health check
      const healthData = await this.intelligentRepair.deepHealthCheck(service);
      const responseTime = Date.now() - startTime;
      
      if (healthData && healthData.status === 'healthy') {
        // SUCCESS
        state.status = 'healthy';
        state.consecutiveFailures = 0;
        state.lastSuccess = new Date().toISOString();
        state.responseTime = responseTime;
        state.successfulChecks++;
        
        // Self-healing check
        if (this.config.selfHealingEnabled) {
          const healed = await this.intelligentRepair.selfHeal(service, healthData);
          if (healed) {
            state.selfHealingCount++;
            state.preventedFailures++;
            console.log(`🔧 Self-healing applied to ${service.name} - failure prevented!`);
          }
        }
        
        console.log(`✅ ${service.name}: ${responseTime}ms`);
        
      } else {
        throw new Error('Unhealthy');
      }
      
    } catch (error) {
      // FAILURE
      state.status = 'unhealthy';
      state.consecutiveFailures++;
      state.lastFailure = new Date().toISOString();
      
      console.error(`❌ ${service.name}: ${error.message} (failure ${state.consecutiveFailures})`);
      
      // Trigger intelligent repair
      if (state.consecutiveFailures >= this.config.maxConsecutiveFailures && !state.repairInProgress) {
        console.error(`\n🧠 INTELLIGENT REPAIR triggered for ${service.name}...\n`);
        state.repairInProgress = true;
        
        const result = await this.intelligentRepair.repair(service);
        
        state.repairHistory.push(result);
        state.repairInProgress = false;
        
        if (result.success) {
          state.consecutiveFailures = 0;
        }
      }
    } finally {
      state.totalChecks++;
      state.uptime = (state.successfulChecks / state.totalChecks * 100).toFixed(2);
    }
  }
  
  /**
   * Print status report
   */
  printStatus() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 ULTIMATE MONITOR STATUS');
    console.log('='.repeat(70));
    
    this.services.forEach(service => {
      const state = this.state[service.id];
      const statusIcon = state.status === 'healthy' ? '✅' : '❌';
      
      console.log(`\n${statusIcon} ${service.name}`);
      console.log(`   Status: ${state.status}`);
      console.log(`   Uptime: ${state.uptime}%`);
      console.log(`   Response: ${state.responseTime}ms`);
      console.log(`   Checks: ${state.successfulChecks}/${state.totalChecks}`);
      
      if (state.selfHealingCount > 0) {
        console.log(`   🔧 Self-healing: ${state.selfHealingCount} times`);
        console.log(`   🛡️ Prevented failures: ${state.preventedFailures}`);
      }
      
      if (state.repairHistory.length > 0) {
        console.log(`   🧠 Repairs: ${state.repairHistory.length}`);
        const lastRepair = state.repairHistory[state.repairHistory.length - 1];
        console.log(`   Last: ${lastRepair.method} (${lastRepair.duration}s) - ${lastRepair.success ? '✅' : '❌'}`);
        
        // Success rate
        const successfulRepairs = state.repairHistory.filter(r => r.success).length;
        const successRate = (successfulRepairs / state.repairHistory.length * 100).toFixed(1);
        console.log(`   Success rate: ${successRate}%`);
      }
    });
    
    console.log('\n' + '='.repeat(70) + '\n');
  }
  
  /**
   * Deploy with canary strategy
   */
  async deployCanary(service, version) {
    console.log(`\n🐤 Starting canary deployment for ${service.name}...`);
    return await this.canaryDeploy.deploy(service, version);
  }
  
  /**
   * Run chaos test
   */
  async runChaosTest() {
    console.log(`\n🔥 Running chaos test...`);
    await this.chaosEngineer.runChaosTest();
  }
  
  /**
   * Get statistics
   */
  getStats() {
    const stats = {
      services: {},
      overall: {
        totalChecks: 0,
        successfulChecks: 0,
        uptime: 0,
        totalRepairs: 0,
        successfulRepairs: 0,
        repairSuccessRate: 0,
        selfHealingCount: 0,
        preventedFailures: 0
      }
    };
    
    this.services.forEach(service => {
      const state = this.state[service.id];
      
      stats.services[service.name] = {
        uptime: state.uptime,
        totalChecks: state.totalChecks,
        successfulChecks: state.successfulChecks,
        repairs: state.repairHistory.length,
        successfulRepairs: state.repairHistory.filter(r => r.success).length,
        selfHealingCount: state.selfHealingCount,
        preventedFailures: state.preventedFailures
      };
      
      stats.overall.totalChecks += state.totalChecks;
      stats.overall.successfulChecks += state.successfulChecks;
      stats.overall.totalRepairs += state.repairHistory.length;
      stats.overall.successfulRepairs += state.repairHistory.filter(r => r.success).length;
      stats.overall.selfHealingCount += state.selfHealingCount;
      stats.overall.preventedFailures += state.preventedFailures;
    });
    
    stats.overall.uptime = (stats.overall.successfulChecks / stats.overall.totalChecks * 100).toFixed(2);
    stats.overall.repairSuccessRate = stats.overall.totalRepairs > 0 ?
      (stats.overall.successfulRepairs / stats.overall.totalRepairs * 100).toFixed(1) : 0;
    
    return stats;
  }
}

// Start monitoring
if (require.main === module) {
  const monitor = new UltimateMonitor();
  monitor.start();
}

module.exports = UltimateMonitor;
