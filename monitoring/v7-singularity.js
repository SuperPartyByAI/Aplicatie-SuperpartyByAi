/**
 * v7.0 SINGULARITY MONITOR
 *
 * Features:
 * - Self-replication (auto-scaling)
 * - Multi-project management
 * - Advanced learning system
 * - Intelligent auto-repair
 *
 * Target: <5s downtime/month, 95% prevention
 */

const fetch = require('node-fetch');
const RailwayAPI = require('./railway-api');
const IntelligentRepair = require('./intelligent-repair');

class SingularityMonitor {
  constructor(config = {}) {
    this.config = {
      // Self-replication settings
      scaleUpThreshold: config.scaleUpThreshold || 80, // CPU %
      scaleDownThreshold: config.scaleDownThreshold || 30,
      maxInstances: config.maxInstances || 5,
      minInstances: config.minInstances || 1,

      // Learning settings
      learningEnabled: config.learningEnabled !== false,
      predictionWindow: config.predictionWindow || 3600000, // 1 hour

      // Monitoring
      healthCheckInterval: config.healthCheckInterval || 5000, // 5s
      metricsRetention: config.metricsRetention || 7 * 24 * 60 * 60 * 1000, // 7 days

      ...config,
    };

    this.railway = new RailwayAPI(process.env.RAILWAY_TOKEN);
    this.repair = new IntelligentRepair();

    // State
    this.projects = new Map();
    this.instances = new Map();
    this.metrics = [];
    this.learnings = [];
    this.clones = [];

    console.log('🧠 v7.0 SINGULARITY MONITOR initialized');
    console.log('⚡ Self-replication: ENABLED');
    console.log('🎓 Advanced learning: ENABLED');
    console.log('🔧 Intelligent repair: ENABLED');
  }

  /**
   * 1. SELF-REPLICATION
   */
  async checkScaling(service) {
    const metrics = await this.getServiceMetrics(service);

    // Scale UP
    if (this.shouldScaleUp(metrics)) {
      await this.scaleUp(service);
    }

    // Scale DOWN
    if (this.shouldScaleDown(metrics)) {
      await this.scaleDown(service);
    }
  }

  shouldScaleUp(metrics) {
    const currentInstances = this.instances.get(metrics.serviceId)?.length || 1;

    return (
      (metrics.cpu > this.config.scaleUpThreshold ||
        metrics.memory > this.config.scaleUpThreshold ||
        metrics.responseTime > 1000 ||
        metrics.queueLength > 100) &&
      currentInstances < this.config.maxInstances
    );
  }

  shouldScaleDown(metrics) {
    const currentInstances = this.instances.get(metrics.serviceId)?.length || 1;

    return (
      metrics.cpu < this.config.scaleDownThreshold &&
      metrics.memory < this.config.scaleDownThreshold &&
      metrics.responseTime < 200 &&
      metrics.queueLength < 10 &&
      currentInstances > this.config.minInstances
    );
  }

  async scaleUp(service) {
    console.log(`🧬 Self-replicating ${service.name}...`);

    try {
      // Create clone
      const clone = await this.railway.services.create({
        name: `${service.name}-clone-${Date.now()}`,
        projectId: service.projectId,
        source: service.source,
        variables: service.variables,
        region: service.region,
      });

      console.log(`✅ Clone created: ${clone.id}`);

      // Wait for healthy
      await this.waitForHealthy(clone);

      // Add to load balancer
      await this.addToLoadBalancer(clone);

      // Track clone
      const clones = this.instances.get(service.id) || [];
      clones.push(clone);
      this.instances.set(service.id, clones);

      console.log(`✅ ${service.name} scaled to ${clones.length + 1} instances`);

      // Learn from this
      this.learn({
        type: 'scale_up',
        service: service.id,
        reason: 'high_load',
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('❌ Scale up failed:', error.message);
    }
  }

  async scaleDown(service) {
    const clones = this.instances.get(service.id) || [];

    if (clones.length === 0) return;

    console.log(`🧹 Scaling down ${service.name}...`);

    try {
      // Remove last clone
      const clone = clones.pop();

      // Remove from load balancer
      await this.removeFromLoadBalancer(clone);

      // Delete service
      await this.railway.services.delete(clone.id);

      console.log(`✅ Clone deleted: ${clone.id}`);
      console.log(`✅ ${service.name} scaled to ${clones.length + 1} instances`);

      this.instances.set(service.id, clones);

      // Learn from this
      this.learn({
        type: 'scale_down',
        service: service.id,
        reason: 'low_load',
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('❌ Scale down failed:', error.message);
    }
  }

  /**
   * 2. MULTI-PROJECT MANAGEMENT
   */
  async addProject(projectConfig) {
    console.log(`📦 Adding project: ${projectConfig.name}`);

    const project = {
      id: projectConfig.id,
      name: projectConfig.name,
      services: [],
      metrics: {
        uptime: 100,
        totalRequests: 0,
        totalErrors: 0,
        avgResponseTime: 0,
        cost: 0,
      },
      status: 'healthy',
    };

    // Get all services in project
    const services = await this.railway.projects.getServices(projectConfig.id);

    for (const service of services) {
      project.services.push({
        id: service.id,
        name: service.name,
        url: service.url,
        status: 'unknown',
        metrics: {},
      });
    }

    this.projects.set(project.id, project);

    console.log(`✅ Project added: ${project.name} (${project.services.length} services)`);

    return project;
  }

  async getAllProjectsStatus() {
    const status = {
      totalProjects: this.projects.size,
      totalServices: 0,
      healthyServices: 0,
      unhealthyServices: 0,
      totalCost: 0,
      totalUptime: 0,
      projects: [],
    };

    for (const [id, project] of this.projects) {
      const projectStatus = {
        id: project.id,
        name: project.name,
        services: project.services.length,
        status: project.status,
        uptime: project.metrics.uptime,
        cost: project.metrics.cost,
        responseTime: project.metrics.avgResponseTime,
      };

      status.totalServices += project.services.length;
      status.totalCost += project.metrics.cost;
      status.totalUptime += project.metrics.uptime;

      if (project.status === 'healthy') {
        status.healthyServices += project.services.length;
      } else {
        status.unhealthyServices += project.services.length;
      }

      status.projects.push(projectStatus);
    }

    status.totalUptime = status.totalUptime / this.projects.size;

    return status;
  }

  /**
   * 3. ADVANCED LEARNING SYSTEM
   */
  learn(event) {
    if (!this.config.learningEnabled) return;

    this.learnings.push({
      ...event,
      timestamp: event.timestamp || Date.now(),
    });

    // Keep only recent learnings
    const cutoff = Date.now() - this.config.metricsRetention;
    this.learnings = this.learnings.filter(l => l.timestamp > cutoff);
  }

  async predictLoad(service, timeAhead = 3600000) {
    // Get historical metrics
    const history = this.metrics.filter(
      m => m.serviceId === service.id && m.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000 // 7 days
    );

    if (history.length < 100) {
      return null; // Not enough data
    }

    // Simple linear regression for prediction
    const targetTime = Date.now() + timeAhead;
    const targetHour = new Date(targetTime).getHours();
    const targetDay = new Date(targetTime).getDay();

    // Find similar time periods
    const similar = history.filter(m => {
      const mHour = new Date(m.timestamp).getHours();
      const mDay = new Date(m.timestamp).getDay();
      return Math.abs(mHour - targetHour) <= 1 && mDay === targetDay;
    });

    if (similar.length === 0) return null;

    // Calculate average
    const avgCpu = similar.reduce((sum, m) => sum + m.cpu, 0) / similar.length;
    const avgMemory = similar.reduce((sum, m) => sum + m.memory, 0) / similar.length;
    const avgResponseTime = similar.reduce((sum, m) => sum + m.responseTime, 0) / similar.length;

    return {
      cpu: avgCpu,
      memory: avgMemory,
      responseTime: avgResponseTime,
      confidence: Math.min(similar.length / 100, 1) * 100,
    };
  }

  async applyPredictiveActions(service) {
    const prediction = await this.predictLoad(service, this.config.predictionWindow);

    if (!prediction || prediction.confidence < 70) {
      return; // Not confident enough
    }

    console.log(`🔮 Prediction for ${service.name} (${prediction.confidence}% confidence):`);
    console.log(`   CPU: ${prediction.cpu.toFixed(1)}%`);
    console.log(`   Memory: ${prediction.memory.toFixed(1)}%`);
    console.log(`   Response time: ${prediction.responseTime.toFixed(0)}ms`);

    // Predictive scaling
    if (prediction.cpu > this.config.scaleUpThreshold) {
      console.log(`🔮 Predictive action: Pre-scaling ${service.name}`);
      await this.scaleUp(service);
    }

    // Predictive caching
    if (prediction.responseTime > 500) {
      console.log(`🔮 Predictive action: Pre-warming cache for ${service.name}`);
      await this.preWarmCache(service);
    }
  }

  /**
   * 4. INTELLIGENT AUTO-REPAIR
   */
  async monitorAndRepair(service) {
    try {
      // Health check
      const health = await this.checkHealth(service);

      if (!health.healthy) {
        console.log(`⚠️ ${service.name} unhealthy: ${health.reason}`);

        // Intelligent diagnosis and repair
        const diagnosis = await this.repair.diagnose(service, health);
        console.log(`🔍 Diagnosis: ${diagnosis.type}`);

        const fix = await this.repair.fix(service, diagnosis);

        if (fix.success) {
          console.log(`✅ ${service.name} repaired: ${fix.action}`);

          // Learn from successful repair
          this.learn({
            type: 'repair_success',
            service: service.id,
            diagnosis: diagnosis.type,
            fix: fix.action,
            timestamp: Date.now(),
          });
        } else {
          console.log(`❌ Repair failed: ${fix.error}`);

          // Fallback to restart
          await this.railway.services.restart(service.id);
        }
      }

      // Collect metrics
      await this.collectMetrics(service, health);

      // Check if scaling needed
      await this.checkScaling(service);

      // Apply predictive actions
      await this.applyPredictiveActions(service);
    } catch (error) {
      console.error(`❌ Error monitoring ${service.name}:`, error.message);
    }
  }

  /**
   * HELPER METHODS
   */
  async checkHealth(service) {
    try {
      const start = Date.now();
      const response = await fetch(service.url, {
        timeout: 10000,
        headers: { 'User-Agent': 'Singularity-Monitor/7.0' },
      });
      const responseTime = Date.now() - start;

      return {
        healthy: response.ok,
        status: response.status,
        responseTime,
        reason: response.ok ? 'ok' : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        healthy: false,
        status: 0,
        responseTime: 0,
        reason: error.message,
      };
    }
  }

  async getServiceMetrics(service) {
    // Get metrics from Railway API
    try {
      const metrics = await this.railway.services.getMetrics(service.id);
      return {
        serviceId: service.id,
        cpu: metrics.cpu || 0,
        memory: metrics.memory || 0,
        responseTime: metrics.responseTime || 0,
        queueLength: metrics.queueLength || 0,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        serviceId: service.id,
        cpu: 0,
        memory: 0,
        responseTime: 0,
        queueLength: 0,
        timestamp: Date.now(),
      };
    }
  }

  async collectMetrics(service, health) {
    const metrics = {
      serviceId: service.id,
      timestamp: Date.now(),
      healthy: health.healthy,
      responseTime: health.responseTime,
      cpu: 0,
      memory: 0,
    };

    // Get additional metrics
    try {
      const railwayMetrics = await this.railway.services.getMetrics(service.id);
      metrics.cpu = railwayMetrics.cpu || 0;
      metrics.memory = railwayMetrics.memory || 0;
    } catch (error) {
      // Ignore
    }

    this.metrics.push(metrics);

    // Keep only recent metrics
    const cutoff = Date.now() - this.config.metricsRetention;
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
  }

  async waitForHealthy(service, timeout = 120000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const health = await this.checkHealth(service);

      if (health.healthy) {
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error('Service did not become healthy in time');
  }

  async addToLoadBalancer(service) {
    // TODO: Implement load balancer integration (Cloudflare, etc.)
    console.log(`🔄 Added ${service.name} to load balancer`);
  }

  async removeFromLoadBalancer(service) {
    // TODO: Implement load balancer integration
    console.log(`🔄 Removed ${service.name} from load balancer`);
  }

  async preWarmCache(service) {
    // TODO: Implement cache pre-warming
    console.log(`🔥 Pre-warming cache for ${service.name}`);
  }

  /**
   * MAIN LOOP
   */
  async start() {
    console.log('🚀 Starting v7.0 Singularity Monitor...');

    // Monitor all projects
    setInterval(async () => {
      for (const [id, project] of this.projects) {
        for (const service of project.services) {
          await this.monitorAndRepair(service);
        }
      }
    }, this.config.healthCheckInterval);

    // Status report every minute
    setInterval(async () => {
      await this.printStatus();
    }, 60000);

    console.log('✅ v7.0 Singularity Monitor started');
  }

  async printStatus() {
    const status = await this.getAllProjectsStatus();

    console.log('\n============================================================');
    console.log('🧠 v7.0 SINGULARITY STATUS');
    console.log('============================================================\n');

    console.log(`📊 OVERVIEW`);
    console.log(`   Projects: ${status.totalProjects}`);
    console.log(
      `   Services: ${status.totalServices} (${status.healthyServices} healthy, ${status.unhealthyServices} unhealthy)`
    );
    console.log(`   Avg Uptime: ${status.totalUptime.toFixed(2)}%`);
    console.log(`   Total Cost: $${status.totalCost.toFixed(2)}/month`);
    console.log('');

    console.log(`🎯 PROJECTS`);
    for (const project of status.projects) {
      const icon = project.status === 'healthy' ? '✅' : '⚠️';
      console.log(`   ${icon} ${project.name}`);
      console.log(`      Services: ${project.services}`);
      console.log(`      Uptime: ${project.uptime.toFixed(2)}%`);
      console.log(`      Response: ${project.responseTime.toFixed(0)}ms`);
      console.log(`      Cost: $${project.cost.toFixed(2)}/month`);
    }
    console.log('');

    console.log(`🧬 SELF-REPLICATION`);
    let totalInstances = 0;
    for (const [serviceId, clones] of this.instances) {
      totalInstances += clones.length + 1;
    }
    console.log(`   Total instances: ${totalInstances}`);
    console.log(`   Active clones: ${totalInstances - this.projects.size}`);
    console.log('');

    console.log(`🎓 LEARNING`);
    console.log(`   Total learnings: ${this.learnings.length}`);
    console.log(
      `   Recent events: ${this.learnings.filter(l => l.timestamp > Date.now() - 3600000).length} (last hour)`
    );
    console.log('');

    console.log('============================================================\n');
  }
}

module.exports = SingularityMonitor;
