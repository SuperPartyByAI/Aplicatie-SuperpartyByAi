/**
 * SELF-REPLICATION SYSTEM
 * Auto-scaling inteligent pentru Railway services
 */

const RailwayAPI = require('./railway-api');

class SelfReplication {
  constructor(config = {}) {
    this.config = {
      scaleUpThreshold: config.scaleUpThreshold || 80,
      scaleDownThreshold: config.scaleDownThreshold || 30,
      maxInstances: config.maxInstances || 5,
      minInstances: config.minInstances || 1,
      cooldownPeriod: config.cooldownPeriod || 300000, // 5 min
      ...config,
    };

    this.railway = new RailwayAPI(process.env.RAILWAY_TOKEN);
    this.instances = new Map(); // serviceId -> [clones]
    this.lastScaleAction = new Map(); // serviceId -> timestamp

    console.log('🧬 Self-Replication System initialized');
  }

  /**
   * Check if service needs scaling
   */
  async checkAndScale(service, metrics) {
    const now = Date.now();
    const lastAction = this.lastScaleAction.get(service.id) || 0;

    // Cooldown period
    if (now - lastAction < this.config.cooldownPeriod) {
      return { action: 'cooldown', reason: 'Too soon since last action' };
    }

    const currentInstances = this.getCurrentInstanceCount(service.id);

    // Scale UP
    if (this.shouldScaleUp(metrics, currentInstances)) {
      const result = await this.scaleUp(service);
      this.lastScaleAction.set(service.id, now);
      return result;
    }

    // Scale DOWN
    if (this.shouldScaleDown(metrics, currentInstances)) {
      const result = await this.scaleDown(service);
      this.lastScaleAction.set(service.id, now);
      return result;
    }

    return { action: 'none', reason: 'Metrics within normal range' };
  }

  shouldScaleUp(metrics, currentInstances) {
    if (currentInstances >= this.config.maxInstances) {
      return false;
    }

    return (
      metrics.cpu > this.config.scaleUpThreshold ||
      metrics.memory > this.config.scaleUpThreshold ||
      metrics.responseTime > 1000 ||
      metrics.errorRate > 5 ||
      (metrics.queueLength && metrics.queueLength > 100)
    );
  }

  shouldScaleDown(metrics, currentInstances) {
    if (currentInstances <= this.config.minInstances) {
      return false;
    }

    return (
      metrics.cpu < this.config.scaleDownThreshold &&
      metrics.memory < this.config.scaleDownThreshold &&
      metrics.responseTime < 200 &&
      metrics.errorRate < 1 &&
      (!metrics.queueLength || metrics.queueLength < 10)
    );
  }

  /**
   * Scale UP - Create clone
   */
  async scaleUp(service) {
    console.log(`🧬 Scaling UP ${service.name}...`);

    try {
      const cloneName = `${service.name}-clone-${Date.now()}`;

      // Create clone via Railway API
      const clone = await this.railway.services.create({
        projectId: service.projectId,
        name: cloneName,
        source: {
          type: service.source.type,
          repo: service.source.repo,
          branch: service.source.branch,
        },
        variables: service.variables,
        region: service.region,
      });

      console.log(`   ✅ Clone created: ${clone.id}`);

      // Wait for deployment
      await this.waitForDeployment(clone.id);
      console.log(`   ✅ Clone deployed successfully`);

      // Add to instances
      const clones = this.instances.get(service.id) || [];
      clones.push({
        id: clone.id,
        name: cloneName,
        createdAt: Date.now(),
      });
      this.instances.set(service.id, clones);

      const newCount = clones.length + 1;
      console.log(`✅ ${service.name} scaled to ${newCount} instances`);

      return {
        action: 'scale_up',
        success: true,
        instanceCount: newCount,
        cloneId: clone.id,
      };
    } catch (error) {
      console.error(`❌ Scale UP failed:`, error.message);
      return {
        action: 'scale_up',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Scale DOWN - Remove clone
   */
  async scaleDown(service) {
    const clones = this.instances.get(service.id) || [];

    if (clones.length === 0) {
      return {
        action: 'scale_down',
        success: false,
        reason: 'No clones to remove',
      };
    }

    console.log(`🧹 Scaling DOWN ${service.name}...`);

    try {
      // Remove oldest clone
      const clone = clones.shift();

      // Delete via Railway API
      await this.railway.services.delete(clone.id);

      console.log(`   ✅ Clone deleted: ${clone.id}`);

      this.instances.set(service.id, clones);

      const newCount = clones.length + 1;
      console.log(`✅ ${service.name} scaled to ${newCount} instances`);

      return {
        action: 'scale_down',
        success: true,
        instanceCount: newCount,
        cloneId: clone.id,
      };
    } catch (error) {
      console.error(`❌ Scale DOWN failed:`, error.message);
      return {
        action: 'scale_down',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get current instance count
   */
  getCurrentInstanceCount(serviceId) {
    const clones = this.instances.get(serviceId) || [];
    return clones.length + 1; // +1 for original
  }

  /**
   * Get all instances for a service
   */
  getInstances(serviceId) {
    return {
      original: serviceId,
      clones: this.instances.get(serviceId) || [],
      total: this.getCurrentInstanceCount(serviceId),
    };
  }

  /**
   * Wait for deployment to complete
   */
  async waitForDeployment(serviceId, timeout = 300000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const deployment = await this.railway.services.getLatestDeployment(serviceId);

        if (deployment.status === 'SUCCESS') {
          return true;
        }

        if (deployment.status === 'FAILED') {
          throw new Error('Deployment failed');
        }

        // Wait 10s before checking again
        await new Promise(resolve => setTimeout(resolve, 10000));
      } catch (error) {
        console.error(`   ⚠️ Error checking deployment:`, error.message);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    throw new Error('Deployment timeout');
  }

  /**
   * Get scaling statistics
   */
  getStats() {
    const stats = {
      totalServices: this.instances.size,
      totalClones: 0,
      totalInstances: 0,
      services: [],
    };

    for (const [serviceId, clones] of this.instances) {
      const instanceCount = clones.length + 1;
      stats.totalClones += clones.length;
      stats.totalInstances += instanceCount;

      stats.services.push({
        serviceId,
        instances: instanceCount,
        clones: clones.length,
        oldestClone: clones.length > 0 ? clones[0].createdAt : null,
      });
    }

    return stats;
  }

  /**
   * Cleanup old clones (safety mechanism)
   */
  async cleanupOldClones(maxAge = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [serviceId, clones] of this.instances) {
      const oldClones = clones.filter(c => now - c.createdAt > maxAge);

      for (const clone of oldClones) {
        try {
          await this.railway.services.delete(clone.id);
          console.log(`🧹 Cleaned up old clone: ${clone.name}`);
          cleaned++;
        } catch (error) {
          console.error(`❌ Failed to cleanup clone ${clone.id}:`, error.message);
        }
      }

      // Update instances
      const remaining = clones.filter(c => now - c.createdAt <= maxAge);
      this.instances.set(serviceId, remaining);
    }

    if (cleaned > 0) {
      console.log(`✅ Cleaned up ${cleaned} old clones`);
    }

    return cleaned;
  }
}

module.exports = SelfReplication;
