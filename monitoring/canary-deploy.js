/**
 * CANARY DEPLOYMENTS
 * Deploy treptat cu verificare automată
 * Rollback automat dacă apar probleme
 */

const RailwayAPI = require('./railway-api');

class CanaryDeploy {
  constructor() {
    this.railway = new RailwayAPI(process.env.RAILWAY_TOKEN);

    // Canary stages
    this.stages = [
      { name: 'canary', percentage: 10, waitTime: 5 * 60 * 1000 }, // 10%, 5 min
      { name: 'half', percentage: 50, waitTime: 5 * 60 * 1000 }, // 50%, 5 min
      { name: 'full', percentage: 100, waitTime: 0 }, // 100%
    ];

    // Health thresholds
    this.thresholds = {
      errorRate: 1, // Max 1% error rate
      responseTime: 1000, // Max 1s response time
      availability: 99, // Min 99% availability
    };

    console.log('🐤 Canary Deploy System initialized');
  }

  /**
   * Deploy with canary strategy
   */
  async deploy(service, newVersion) {
    console.log('\n' + '='.repeat(70));
    console.log(`🐤 CANARY DEPLOYMENT: ${service.name} → ${newVersion}`);
    console.log('='.repeat(70));

    const deploymentLog = {
      service: service.name,
      version: newVersion,
      startTime: new Date().toISOString(),
      stages: [],
      success: false,
    };

    try {
      // Deploy to each stage
      for (const stage of this.stages) {
        console.log(`\n📍 Stage: ${stage.name} (${stage.percentage}%)`);

        const stageResult = await this.deployStage(service, newVersion, stage);
        deploymentLog.stages.push(stageResult);

        if (!stageResult.success) {
          console.log(`\n❌ Stage ${stage.name} FAILED - Rolling back...`);
          await this.rollback(service);
          deploymentLog.success = false;
          return deploymentLog;
        }

        console.log(`\n✅ Stage ${stage.name} PASSED`);
      }

      console.log(`\n🎉 CANARY DEPLOYMENT SUCCESSFUL`);
      deploymentLog.success = true;
      deploymentLog.endTime = new Date().toISOString();

      return deploymentLog;
    } catch (error) {
      console.error(`\n❌ DEPLOYMENT ERROR: ${error.message}`);
      await this.rollback(service);
      deploymentLog.success = false;
      deploymentLog.error = error.message;
      return deploymentLog;
    }
  }

  /**
   * Deploy to specific stage
   */
  async deployStage(service, version, stage) {
    const stageLog = {
      name: stage.name,
      percentage: stage.percentage,
      startTime: new Date().toISOString(),
      success: false,
      metrics: {},
    };

    try {
      // Deploy to percentage of instances
      console.log(`  Deploying to ${stage.percentage}% of instances...`);
      await this.deployToPercentage(service, version, stage.percentage);

      // Wait for stabilization
      if (stage.waitTime > 0) {
        console.log(`  Waiting ${stage.waitTime / 1000 / 60} minutes for stabilization...`);
        await this.sleep(stage.waitTime);
      }

      // Collect metrics
      console.log(`  Collecting metrics...`);
      const metrics = await this.collectMetrics(service);
      stageLog.metrics = metrics;

      // Verify health
      console.log(`  Verifying health...`);
      const healthy = this.verifyHealth(metrics);

      if (!healthy) {
        console.log(`  ⚠️ Health check FAILED`);
        this.printMetrics(metrics);
        stageLog.success = false;
        return stageLog;
      }

      console.log(`  ✅ Health check PASSED`);
      this.printMetrics(metrics);
      stageLog.success = true;
      stageLog.endTime = new Date().toISOString();

      return stageLog;
    } catch (error) {
      console.error(`  ❌ Stage error: ${error.message}`);
      stageLog.success = false;
      stageLog.error = error.message;
      return stageLog;
    }
  }

  /**
   * Deploy to percentage of instances
   */
  async deployToPercentage(service, version, percentage) {
    // Implementation depends on Railway API
    // For now, simulate
    console.log(`    Deploying ${version} to ${percentage}% of instances...`);
    await this.sleep(2000);
  }

  /**
   * Collect metrics from service
   */
  async collectMetrics(service) {
    try {
      const response = await fetch(`${service.url}/metrics`, {
        timeout: 5000,
      });

      if (response.ok) {
        return await response.json();
      }

      // Fallback: basic health check
      const healthResponse = await fetch(`${service.url}/health`, {
        timeout: 5000,
      });

      if (healthResponse.ok) {
        const health = await healthResponse.json();
        return {
          errorRate: health.errorRate || 0,
          responseTime: health.responseTime || 0,
          availability: 100,
        };
      }

      return {
        errorRate: 100,
        responseTime: 9999,
        availability: 0,
      };
    } catch (error) {
      return {
        errorRate: 100,
        responseTime: 9999,
        availability: 0,
      };
    }
  }

  /**
   * Verify health against thresholds
   */
  verifyHealth(metrics) {
    if (metrics.errorRate > this.thresholds.errorRate) {
      console.log(
        `    ❌ Error rate too high: ${metrics.errorRate}% (max: ${this.thresholds.errorRate}%)`
      );
      return false;
    }

    if (metrics.responseTime > this.thresholds.responseTime) {
      console.log(
        `    ❌ Response time too slow: ${metrics.responseTime}ms (max: ${this.thresholds.responseTime}ms)`
      );
      return false;
    }

    if (metrics.availability < this.thresholds.availability) {
      console.log(
        `    ❌ Availability too low: ${metrics.availability}% (min: ${this.thresholds.availability}%)`
      );
      return false;
    }

    return true;
  }

  /**
   * Print metrics
   */
  printMetrics(metrics) {
    console.log(`    Metrics:`);
    console.log(`      Error rate: ${metrics.errorRate}%`);
    console.log(`      Response time: ${metrics.responseTime}ms`);
    console.log(`      Availability: ${metrics.availability}%`);
  }

  /**
   * Rollback deployment
   */
  async rollback(service) {
    console.log(`\n⏮️ Rolling back ${service.name}...`);

    try {
      await this.railway.rollbackService(service.id);
      console.log(`✅ Rollback successful`);
    } catch (error) {
      console.error(`❌ Rollback failed: ${error.message}`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CanaryDeploy;
