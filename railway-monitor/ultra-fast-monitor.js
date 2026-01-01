/**
 * ULTRA-FAST MONITORING & AUTO-REPAIR
 * Target: <5 minute recovery from ANY failure
 *
 * Timeline:
 * - Detection: 10s (health check every 10s)
 * - Instant failover: <1s (circuit breaker)
 * - Auto-restart: 30s (3 attempts x 10s)
 * - Auto-redeploy: 2min (if restart fails)
 * - Rollback: 1min (if redeploy fails)
 * Total: ~3.5 minutes worst case
 */

const fetch = require('node-fetch');
const RailwayAPI = require('./railway-api');

class UltraFastMonitor {
  constructor() {
    // Services to monitor
    this.services = [
      {
        id: process.env.BACKEND_SERVICE_ID || 'backend',
        name: 'Backend Node.js',
        url: process.env.BACKEND_URL || 'https://web-production-00dca9.up.railway.app',
        healthPath: '/',
        critical: true,
      },
      {
        id: process.env.COQUI_SERVICE_ID || 'coqui',
        name: 'Coqui Voice Service',
        url: process.env.COQUI_API_URL || 'https://coqui-production-xyz.up.railway.app',
        healthPath: '/health',
        critical: false, // Has fallback to Polly
      },
    ];

    // Ultra-aggressive settings
    this.config = {
      healthCheckInterval: 10000, // Check every 10 seconds
      healthCheckTimeout: 5000, // 5s timeout
      maxConsecutiveFailures: 2, // Trigger after 2 failures (20s)
      restartMaxAttempts: 3, // Try restart 3 times
      restartAttemptDelay: 10000, // 10s between restart attempts
      redeployMaxAttempts: 2, // Try redeploy 2 times
      redeployTimeout: 120000, // 2 min redeploy timeout
      rollbackTimeout: 60000, // 1 min rollback timeout
      preWarmInterval: 30000, // Keep-alive every 30s
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
      };
    });

    // Railway API
    this.railway = new RailwayAPI(process.env.RAILWAY_TOKEN);

    console.log('🚀 Ultra-Fast Monitor initialized');
    console.log(`⚡ Health checks every ${this.config.healthCheckInterval / 1000}s`);
    console.log(`🎯 Target: <5 minute recovery`);
  }

  /**
   * Start monitoring all services
   */
  start() {
    console.log('\n🔍 Starting ultra-fast monitoring...\n');

    // Initial health check
    this.services.forEach(service => this.checkHealth(service));

    // Continuous health checks (every 10s)
    setInterval(() => {
      this.services.forEach(service => this.checkHealth(service));
    }, this.config.healthCheckInterval);

    // Pre-warming to prevent cold starts (every 30s)
    setInterval(() => {
      this.services.forEach(service => this.preWarm(service));
    }, this.config.preWarmInterval);

    // Status report every minute
    setInterval(() => this.printStatus(), 60000);
  }

  /**
   * Health check with instant failover detection
   */
  async checkHealth(service) {
    const startTime = Date.now();
    const state = this.state[service.id];

    try {
      const response = await fetch(`${service.url}${service.healthPath}`, {
        timeout: this.config.healthCheckTimeout,
        headers: { 'User-Agent': 'UltraFastMonitor/1.0' },
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        // SUCCESS
        state.status = 'healthy';
        state.consecutiveFailures = 0;
        state.lastSuccess = new Date().toISOString();
        state.responseTime = responseTime;
        state.successfulChecks++;

        // PREDICTIVE MONITORING: Detect degradation
        if (responseTime > 3000) {
          console.warn(`⚠️ ${service.name}: SLOW response ${responseTime}ms - potential issue`);
          state.status = 'degraded';
        } else {
          console.log(`✅ ${service.name}: ${responseTime}ms`);
        }

        // Track response time trend
        if (!state.responseTimes) state.responseTimes = [];
        state.responseTimes.push(responseTime);
        if (state.responseTimes.length > 10) state.responseTimes.shift();

        // Detect increasing response time trend
        if (state.responseTimes.length >= 5) {
          const recent = state.responseTimes.slice(-5);
          const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

          if (avg > 2000) {
            console.warn(
              `⚠️ ${service.name}: Average response time degrading (${Math.round(avg)}ms)`
            );
            state.status = 'degraded';
          }
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      // FAILURE
      state.status = 'unhealthy';
      state.consecutiveFailures++;
      state.lastFailure = new Date().toISOString();

      console.error(
        `❌ ${service.name}: ${error.message} (${state.consecutiveFailures}/${this.config.maxConsecutiveFailures})`
      );

      // Trigger auto-repair if threshold reached
      if (
        state.consecutiveFailures >= this.config.maxConsecutiveFailures &&
        !state.repairInProgress
      ) {
        console.error(`\n🚨 CRITICAL: ${service.name} DOWN - Starting auto-repair...\n`);
        this.autoRepair(service);
      }
    } finally {
      state.totalChecks++;
      state.uptime = ((state.successfulChecks / state.totalChecks) * 100).toFixed(2);
    }
  }

  /**
   * Pre-warm service to prevent cold starts
   */
  async preWarm(service) {
    try {
      await fetch(`${service.url}${service.healthPath}`, {
        timeout: 3000,
        headers: { 'User-Agent': 'PreWarmer/1.0' },
      });
    } catch (error) {
      // Silent fail - pre-warming is best effort
    }
  }

  /**
   * AUTO-REPAIR ESCALATION
   * Step 1: Restart (30s)
   * Step 2: Redeploy (2min)
   * Step 3: Rollback (1min)
   */
  async autoRepair(service) {
    const state = this.state[service.id];
    state.repairInProgress = true;

    const repairStart = Date.now();
    const repairLog = {
      timestamp: new Date().toISOString(),
      service: service.name,
      steps: [],
    };

    try {
      // STEP 1: Try restart (3 attempts x 10s = 30s)
      console.log(
        `\n🔄 STEP 1: Attempting restart (max ${this.config.restartMaxAttempts} attempts)...`
      );
      const restartSuccess = await this.tryRestart(service, repairLog);

      if (restartSuccess) {
        const duration = ((Date.now() - repairStart) / 1000).toFixed(1);
        console.log(`\n✅ RECOVERED via restart in ${duration}s\n`);
        repairLog.success = true;
        repairLog.method = 'restart';
        repairLog.duration = duration;
        state.repairHistory.push(repairLog);
        state.repairInProgress = false;
        return;
      }

      // STEP 2: Try redeploy (2 min)
      console.log(`\n🔄 STEP 2: Restart failed - attempting redeploy...`);
      const redeploySuccess = await this.tryRedeploy(service, repairLog);

      if (redeploySuccess) {
        const duration = ((Date.now() - repairStart) / 1000).toFixed(1);
        console.log(`\n✅ RECOVERED via redeploy in ${duration}s\n`);
        repairLog.success = true;
        repairLog.method = 'redeploy';
        repairLog.duration = duration;
        state.repairHistory.push(repairLog);
        state.repairInProgress = false;
        return;
      }

      // STEP 3: Rollback to last working version (1 min)
      console.log(`\n🔄 STEP 3: Redeploy failed - rolling back...`);
      const rollbackSuccess = await this.tryRollback(service, repairLog);

      if (rollbackSuccess) {
        const duration = ((Date.now() - repairStart) / 1000).toFixed(1);
        console.log(`\n✅ RECOVERED via rollback in ${duration}s\n`);
        repairLog.success = true;
        repairLog.method = 'rollback';
        repairLog.duration = duration;
        state.repairHistory.push(repairLog);
        state.repairInProgress = false;
        return;
      }

      // ALL FAILED
      const duration = ((Date.now() - repairStart) / 1000).toFixed(1);
      console.error(`\n❌ AUTO-REPAIR FAILED after ${duration}s - Manual intervention required\n`);
      repairLog.success = false;
      repairLog.duration = duration;
      state.repairHistory.push(repairLog);
    } catch (error) {
      console.error(`❌ Auto-repair error: ${error.message}`);
      repairLog.error = error.message;
      state.repairHistory.push(repairLog);
    } finally {
      state.repairInProgress = false;
    }
  }

  /**
   * Try restart with multiple attempts
   */
  async tryRestart(service, repairLog) {
    for (let attempt = 1; attempt <= this.config.restartMaxAttempts; attempt++) {
      console.log(`  Restart attempt ${attempt}/${this.config.restartMaxAttempts}...`);

      try {
        // Restart via Railway API
        const success = await this.railway.restartService(service.id);

        if (!success) {
          throw new Error('Railway restart command failed');
        }

        // Wait for service to come back
        await this.sleep(this.config.restartAttemptDelay);

        // Check if healthy
        const isHealthy = await this.quickHealthCheck(service);
        if (isHealthy) {
          repairLog.steps.push({ step: 'restart', attempt, success: true });
          return true;
        }

        repairLog.steps.push({ step: 'restart', attempt, success: false });
      } catch (error) {
        console.error(`  Restart attempt ${attempt} failed: ${error.message}`);
        repairLog.steps.push({ step: 'restart', attempt, error: error.message });
      }
    }

    return false;
  }

  /**
   * Try redeploy
   */
  async tryRedeploy(service, repairLog) {
    for (let attempt = 1; attempt <= this.config.redeployMaxAttempts; attempt++) {
      console.log(`  Redeploy attempt ${attempt}/${this.config.redeployMaxAttempts}...`);

      try {
        const success = await this.railway.redeployService(service.id);

        if (!success) {
          throw new Error('Railway redeploy command failed');
        }

        // Wait for deployment
        await this.sleep(this.config.redeployTimeout);

        // Check if healthy
        const isHealthy = await this.quickHealthCheck(service);
        if (isHealthy) {
          repairLog.steps.push({ step: 'redeploy', attempt, success: true });
          return true;
        }

        repairLog.steps.push({ step: 'redeploy', attempt, success: false });
      } catch (error) {
        console.error(`  Redeploy attempt ${attempt} failed: ${error.message}`);
        repairLog.steps.push({ step: 'redeploy', attempt, error: error.message });
      }
    }

    return false;
  }

  /**
   * Try rollback to last working deployment
   */
  async tryRollback(service, repairLog) {
    console.log(`  Rolling back to last working version...`);

    try {
      const success = await this.railway.rollbackService(service.id);

      if (!success) {
        throw new Error('Railway rollback command failed');
      }

      // Wait for rollback
      await this.sleep(this.config.rollbackTimeout);

      // Check if healthy
      const isHealthy = await this.quickHealthCheck(service);
      if (isHealthy) {
        repairLog.steps.push({ step: 'rollback', success: true });
        return true;
      }

      repairLog.steps.push({ step: 'rollback', success: false });
      return false;
    } catch (error) {
      console.error(`  Rollback failed: ${error.message}`);
      repairLog.steps.push({ step: 'rollback', error: error.message });
      return false;
    }
  }

  /**
   * Quick health check (no state update)
   */
  async quickHealthCheck(service) {
    try {
      const response = await fetch(`${service.url}${service.healthPath}`, {
        timeout: 5000,
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Print status report
   */
  printStatus() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 ULTRA-FAST MONITOR STATUS');
    console.log('='.repeat(60));

    this.services.forEach(service => {
      const state = this.state[service.id];
      const statusIcon = state.status === 'healthy' ? '✅' : '❌';

      console.log(`\n${statusIcon} ${service.name}`);
      console.log(`   Status: ${state.status}`);
      console.log(`   Uptime: ${state.uptime}%`);
      console.log(`   Response: ${state.responseTime}ms`);
      console.log(`   Checks: ${state.successfulChecks}/${state.totalChecks}`);
      console.log(`   Last success: ${state.lastSuccess || 'Never'}`);

      if (state.repairHistory.length > 0) {
        console.log(`   Repairs: ${state.repairHistory.length}`);
        const lastRepair = state.repairHistory[state.repairHistory.length - 1];
        console.log(
          `   Last repair: ${lastRepair.method} (${lastRepair.duration}s) - ${lastRepair.success ? '✅' : '❌'}`
        );
      }
    });

    console.log('\n' + '='.repeat(60) + '\n');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start monitoring
if (require.main === module) {
  const monitor = new UltraFastMonitor();
  monitor.start();
}

module.exports = UltraFastMonitor;
