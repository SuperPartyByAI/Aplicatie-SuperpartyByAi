/**
 * INTELLIGENT AUTO-REPAIR SYSTEM
 *
 * Features:
 * 1. Intelligent Diagnosis - detectează CAUZA
 * 2. Self-Healing - previne failures
 * 3. Learning - învață din erori
 * 4. Gradual Degradation - zero downtime
 * 5. Smart Rollback - rollback la versiune working
 * 6. Deep Health Checks - verifică toate componentele
 *
 * Target: 99% success rate, 30s recovery, 70% prevention
 */

const fetch = require('node-fetch');
const RailwayAPI = require('./railway-api');

class IntelligentRepair {
  constructor() {
    this.railway = new RailwayAPI(process.env.RAILWAY_TOKEN);

    // Failure history pentru learning
    this.failureHistory = {};

    // Deployment history pentru smart rollback
    this.deploymentHistory = [];

    // Service states pentru gradual degradation
    this.serviceStates = {
      HEALTHY: 100,
      DEGRADED: 75,
      CRITICAL: 50,
      EMERGENCY: 25,
      DOWN: 0,
    };

    console.log('🧠 Intelligent Repair System initialized');
  }

  /**
   * 1. INTELLIGENT DIAGNOSIS
   * Detectează CAUZA failure-ului
   */
  async diagnoseFailure(service, healthData) {
    console.log(`🔍 Diagnosing failure for ${service.name}...`);

    const diagnosis = {
      service: service.name,
      timestamp: new Date().toISOString(),
      cause: 'unknown',
      confidence: 0,
      symptoms: [],
      recommendedFix: null,
    };

    // Analizează health data
    if (!healthData) {
      diagnosis.cause = 'service_unreachable';
      diagnosis.confidence = 90;
      diagnosis.symptoms.push('No response from service');
      diagnosis.recommendedFix = 'restart';
      return diagnosis;
    }

    // Check memory issues
    if (healthData.memory && healthData.memory.percentage > 90) {
      diagnosis.cause = 'memory_leak';
      diagnosis.confidence = 95;
      diagnosis.symptoms.push(`Memory usage: ${healthData.memory.percentage}%`);
      diagnosis.recommendedFix = 'clear_cache_and_restart';
      return diagnosis;
    }

    // Check CPU issues
    if (healthData.cpu && healthData.cpu.usage > 95) {
      diagnosis.cause = 'cpu_overload';
      diagnosis.confidence = 90;
      diagnosis.symptoms.push(`CPU usage: ${healthData.cpu.usage}%`);
      diagnosis.recommendedFix = 'scale_up';
      return diagnosis;
    }

    // Check database issues
    if (healthData.database && healthData.database.status === 'unhealthy') {
      diagnosis.cause = 'database_connection';
      diagnosis.confidence = 95;
      diagnosis.symptoms.push('Database connection failed');
      diagnosis.recommendedFix = 'reconnect_database';
      return diagnosis;
    }

    // Check external API issues
    if (healthData.externalAPIs) {
      const failedAPIs = Object.entries(healthData.externalAPIs).filter(
        ([name, data]) => data.status === 'unhealthy'
      );

      if (failedAPIs.length > 0) {
        diagnosis.cause = 'external_api_failure';
        diagnosis.confidence = 85;
        diagnosis.symptoms.push(`Failed APIs: ${failedAPIs.map(([name]) => name).join(', ')}`);
        diagnosis.recommendedFix = 'enable_circuit_breaker';
        return diagnosis;
      }
    }

    // Check error rate
    if (healthData.errorRate && healthData.errorRate > 10) {
      diagnosis.cause = 'code_bug';
      diagnosis.confidence = 80;
      diagnosis.symptoms.push(`Error rate: ${healthData.errorRate}%`);
      diagnosis.recommendedFix = 'rollback';
      return diagnosis;
    }

    // Unknown cause
    diagnosis.cause = 'unknown';
    diagnosis.confidence = 50;
    diagnosis.recommendedFix = 'restart';

    return diagnosis;
  }

  /**
   * 2. SELF-HEALING PATTERNS
   * Previne failures înainte să apară
   */
  async selfHeal(service, healthData) {
    console.log(`🔧 Self-healing check for ${service.name}...`);

    let healed = false;

    // Prevent memory leak
    if (healthData.memory && healthData.memory.percentage > 80) {
      console.log(`⚠️ High memory usage (${healthData.memory.percentage}%) - clearing cache...`);
      await this.clearCache(service);
      healed = true;
    }

    // Prevent CPU overload
    if (healthData.cpu && healthData.cpu.usage > 80) {
      console.log(`⚠️ High CPU usage (${healthData.cpu.usage}%) - restarting workers...`);
      await this.restartWorkers(service);
      healed = true;
    }

    // Prevent database timeout
    if (healthData.database && healthData.database.latency > 1000) {
      console.log(
        `⚠️ Slow database (${healthData.database.latency}ms) - optimizing connections...`
      );
      await this.optimizeDatabaseConnections(service);
      healed = true;
    }

    // Prevent cascade failure
    if (healthData.errorRate && healthData.errorRate > 5) {
      console.log(`⚠️ High error rate (${healthData.errorRate}%) - enabling circuit breaker...`);
      await this.enableCircuitBreaker(service);
      healed = true;
    }

    if (healed) {
      console.log(`✅ Self-healing applied - failure prevented!`);
    }

    return healed;
  }

  /**
   * 3. LEARNING FROM FAILURES
   * Învață din fiecare failure
   */
  async learnFromFailure(diagnosis, fixApplied, success) {
    const failureType = diagnosis.cause;

    if (!this.failureHistory[failureType]) {
      this.failureHistory[failureType] = {
        occurrences: 0,
        lastSeen: null,
        successfulFixes: {},
        preventionStrategies: [],
      };
    }

    const history = this.failureHistory[failureType];
    history.occurrences++;
    history.lastSeen = new Date().toISOString();

    // Track successful fix
    if (success) {
      if (!history.successfulFixes[fixApplied]) {
        history.successfulFixes[fixApplied] = 0;
      }
      history.successfulFixes[fixApplied]++;

      console.log(`📚 Learned: ${fixApplied} works for ${failureType}`);
    }

    // Save to persistent storage (Firestore)
    await this.saveFailureHistory();
  }

  /**
   * Get best fix based on history
   */
  getBestFix(failureType) {
    const history = this.failureHistory[failureType];

    if (!history || Object.keys(history.successfulFixes).length === 0) {
      return null;
    }

    // Find fix with highest success rate
    const bestFix = Object.entries(history.successfulFixes).sort(([, a], [, b]) => b - a)[0];

    return bestFix ? bestFix[0] : null;
  }

  /**
   * 4. GRADUAL DEGRADATION
   * Degradează treptat în loc să pice complet
   */
  async degradeGracefully(service, healthData) {
    console.log(`📉 Checking degradation level for ${service.name}...`);

    let currentState = this.serviceStates.HEALTHY;

    // Calculate degradation level
    if (healthData.memory && healthData.memory.percentage > 90) {
      currentState = Math.min(currentState, this.serviceStates.CRITICAL);
    } else if (healthData.memory && healthData.memory.percentage > 80) {
      currentState = Math.min(currentState, this.serviceStates.DEGRADED);
    }

    if (healthData.cpu && healthData.cpu.usage > 90) {
      currentState = Math.min(currentState, this.serviceStates.CRITICAL);
    } else if (healthData.cpu && healthData.cpu.usage > 80) {
      currentState = Math.min(currentState, this.serviceStates.DEGRADED);
    }

    // Apply degradation
    if (currentState === this.serviceStates.DEGRADED) {
      console.log(`⚠️ Service degraded - disabling non-essential features...`);
      await this.disableNonEssentialFeatures(service);
    } else if (currentState === this.serviceStates.CRITICAL) {
      console.log(`🚨 Service critical - only essential features enabled...`);
      await this.enableOnlyEssentialFeatures(service);
    }

    return currentState;
  }

  /**
   * 5. SMART ROLLBACK
   * Rollback la ultima versiune WORKING
   */
  async smartRollback(service) {
    console.log(`⏮️ Smart rollback for ${service.name}...`);

    // Find last working version
    const lastGoodVersion = this.deploymentHistory
      .filter(d => d.service === service.name)
      .filter(d => d.status === 'success' && d.uptime > 99)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

    if (!lastGoodVersion) {
      console.error(`❌ No working version found for rollback`);
      return false;
    }

    console.log(
      `  Rolling back to ${lastGoodVersion.version} (uptime: ${lastGoodVersion.uptime}%)`
    );

    try {
      await this.railway.rollbackService(service.id, lastGoodVersion.deploymentId);
      console.log(`✅ Rolled back successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Rollback failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 6. DEEP HEALTH CHECKS
   * Verifică toate componentele
   */
  async deepHealthCheck(service) {
    try {
      const response = await fetch(`${service.url}/health`, {
        timeout: 5000,
      });

      if (!response.ok) {
        return null;
      }

      const health = await response.json();

      // Enhanced health data
      return {
        status: health.status || 'unknown',
        timestamp: new Date().toISOString(),
        components: health.components || {},
        memory: health.memory || null,
        cpu: health.cpu || null,
        database: health.database || null,
        externalAPIs: health.externalAPIs || null,
        errorRate: health.errorRate || 0,
        responseTime: health.responseTime || 0,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * INTELLIGENT REPAIR WORKFLOW
   * Combină toate features
   */
  async repair(service) {
    console.log(`\n🧠 Starting intelligent repair for ${service.name}...`);

    const startTime = Date.now();

    // Step 1: Deep health check
    console.log(`\n📊 Step 1: Deep health check...`);
    const healthData = await this.deepHealthCheck(service);

    // Step 2: Try self-healing first
    console.log(`\n🔧 Step 2: Attempting self-healing...`);
    const healed = await this.selfHeal(service, healthData);

    if (healed) {
      // Wait and verify
      await this.sleep(5000);
      const newHealth = await this.deepHealthCheck(service);

      if (newHealth && newHealth.status === 'healthy') {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ Self-healing successful in ${duration}s!`);
        return { success: true, method: 'self-healing', duration };
      }
    }

    // Step 3: Diagnose failure
    console.log(`\n🔍 Step 3: Diagnosing failure...`);
    const diagnosis = await this.diagnoseFailure(service, healthData);
    console.log(`  Cause: ${diagnosis.cause} (confidence: ${diagnosis.confidence}%)`);
    console.log(`  Recommended fix: ${diagnosis.recommendedFix}`);

    // Step 4: Check if we learned this before
    console.log(`\n📚 Step 4: Checking failure history...`);
    const bestFix = this.getBestFix(diagnosis.cause);
    const fixToApply = bestFix || diagnosis.recommendedFix;
    console.log(`  Applying fix: ${fixToApply}`);

    // Step 5: Apply fix
    console.log(`\n🔧 Step 5: Applying fix...`);
    let success = false;

    switch (fixToApply) {
      case 'clear_cache_and_restart':
        await this.clearCache(service);
        success = await this.railway.restartService(service.id);
        break;

      case 'reconnect_database':
        success = await this.reconnectDatabase(service);
        break;

      case 'enable_circuit_breaker':
        success = await this.enableCircuitBreaker(service);
        break;

      case 'rollback':
        success = await this.smartRollback(service);
        break;

      case 'restart':
      default:
        success = await this.railway.restartService(service.id);
        break;
    }

    // Step 6: Verify fix
    console.log(`\n✅ Step 6: Verifying fix...`);
    await this.sleep(10000);
    const finalHealth = await this.deepHealthCheck(service);

    const recovered = finalHealth && finalHealth.status === 'healthy';

    // Step 7: Learn from this failure
    console.log(`\n📚 Step 7: Learning from failure...`);
    await this.learnFromFailure(diagnosis, fixToApply, recovered);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (recovered) {
      console.log(`\n✅ Intelligent repair successful in ${duration}s!`);
      return { success: true, method: fixToApply, duration, diagnosis };
    } else {
      console.log(`\n❌ Intelligent repair failed after ${duration}s`);
      return { success: false, method: fixToApply, duration, diagnosis };
    }
  }

  // Helper methods
  async clearCache(service) {
    console.log(`  Clearing cache...`);
    // Implementation depends on service
    return true;
  }

  async restartWorkers(service) {
    console.log(`  Restarting workers...`);
    // Implementation depends on service
    return true;
  }

  async optimizeDatabaseConnections(service) {
    console.log(`  Optimizing database connections...`);
    // Implementation depends on service
    return true;
  }

  async enableCircuitBreaker(service) {
    console.log(`  Enabling circuit breaker...`);
    // Implementation depends on service
    return true;
  }

  async reconnectDatabase(service) {
    console.log(`  Reconnecting database...`);
    // Implementation depends on service
    return true;
  }

  async disableNonEssentialFeatures(service) {
    console.log(`  Disabling non-essential features...`);
    // Implementation depends on service
    return true;
  }

  async enableOnlyEssentialFeatures(service) {
    console.log(`  Enabling only essential features...`);
    // Implementation depends on service
    return true;
  }

  async saveFailureHistory() {
    // Save to Firestore
    // Implementation depends on Firestore setup
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = IntelligentRepair;
