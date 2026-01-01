/**
 * MULTI-REGION FAILOVER
 * Failover instant între regions (<100ms)
 * Zero downtime pentru users
 */

const fetch = require('node-fetch');

class MultiRegion {
  constructor() {
    // Define regions
    this.regions = [
      {
        name: 'us-west',
        url: process.env.BACKEND_URL_US_WEST || process.env.BACKEND_URL,
        priority: 1,
        status: 'unknown',
        latency: 0,
        lastCheck: null,
      },
      {
        name: 'us-east',
        url: process.env.BACKEND_URL_US_EAST || null,
        priority: 2,
        status: 'unknown',
        latency: 0,
        lastCheck: null,
      },
      {
        name: 'eu-west',
        url: process.env.BACKEND_URL_EU_WEST || null,
        priority: 3,
        status: 'unknown',
        latency: 0,
        lastCheck: null,
      },
    ].filter(r => r.url); // Only regions with URLs

    // Current active region
    this.activeRegion = this.regions[0];

    // Failover history
    this.failoverHistory = [];

    // Config
    this.config = {
      healthCheckInterval: 5000,
      failoverThreshold: 2, // Failover after 2 consecutive failures
      autoFailback: true, // Return to primary when healthy
      failbackDelay: 60000, // Wait 1 min before failing back
    };

    console.log(`🌍 Multi-Region Failover initialized`);
    console.log(`   Regions: ${this.regions.map(r => r.name).join(', ')}`);
    console.log(`   Active: ${this.activeRegion.name}`);
  }

  /**
   * Get active region
   */
  getActiveRegion() {
    return this.activeRegion;
  }

  /**
   * Get all regions status
   */
  getRegionsStatus() {
    return this.regions.map(r => ({
      name: r.name,
      url: r.url,
      status: r.status,
      latency: r.latency,
      active: r.name === this.activeRegion.name,
    }));
  }

  /**
   * Check health of all regions
   */
  async checkAllRegions() {
    const checks = this.regions.map(region => this.checkRegion(region));
    await Promise.all(checks);
  }

  /**
   * Check health of specific region
   */
  async checkRegion(region) {
    const startTime = Date.now();

    try {
      const response = await fetch(`${region.url}/health`, {
        timeout: 3000,
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        region.status = 'healthy';
        region.latency = latency;
        region.lastCheck = new Date().toISOString();
        region.consecutiveFailures = 0;
        return true;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      region.status = 'unhealthy';
      region.latency = 9999;
      region.lastCheck = new Date().toISOString();
      region.consecutiveFailures = (region.consecutiveFailures || 0) + 1;
      return false;
    }
  }

  /**
   * Instant failover to next healthy region
   */
  async failover(reason = 'manual') {
    console.log(`\n🌍 FAILOVER triggered: ${reason}`);
    console.log(`   Current: ${this.activeRegion.name} (${this.activeRegion.status})`);

    const startTime = Date.now();

    // Find next healthy region
    const healthyRegions = this.regions
      .filter(r => r.status === 'healthy' && r.name !== this.activeRegion.name)
      .sort((a, b) => a.priority - b.priority);

    if (healthyRegions.length === 0) {
      console.error(`❌ No healthy regions available for failover!`);
      return false;
    }

    const newRegion = healthyRegions[0];
    const oldRegion = this.activeRegion;

    // Switch active region (instant!)
    this.activeRegion = newRegion;

    const failoverTime = Date.now() - startTime;

    console.log(`✅ Failover complete in ${failoverTime}ms`);
    console.log(`   New active: ${newRegion.name} (latency: ${newRegion.latency}ms)`);

    // Log failover
    this.failoverHistory.push({
      timestamp: new Date().toISOString(),
      from: oldRegion.name,
      to: newRegion.name,
      reason: reason,
      duration: failoverTime,
    });

    // Schedule failback if enabled
    if (this.config.autoFailback && oldRegion.priority < newRegion.priority) {
      setTimeout(() => this.attemptFailback(oldRegion), this.config.failbackDelay);
    }

    return true;
  }

  /**
   * Attempt to fail back to primary region
   */
  async attemptFailback(primaryRegion) {
    console.log(`\n🔄 Attempting failback to ${primaryRegion.name}...`);

    // Check if primary is healthy
    const healthy = await this.checkRegion(primaryRegion);

    if (healthy && primaryRegion.priority < this.activeRegion.priority) {
      console.log(`✅ Primary region healthy - failing back...`);

      const oldRegion = this.activeRegion;
      this.activeRegion = primaryRegion;

      console.log(`✅ Failback complete: ${oldRegion.name} → ${primaryRegion.name}`);

      this.failoverHistory.push({
        timestamp: new Date().toISOString(),
        from: oldRegion.name,
        to: primaryRegion.name,
        reason: 'auto_failback',
        duration: 0,
      });
    } else {
      console.log(`⚠️ Primary region still unhealthy - staying on ${this.activeRegion.name}`);
    }
  }

  /**
   * Monitor and auto-failover
   */
  async monitor() {
    // Check all regions
    await this.checkAllRegions();

    // Check if active region is unhealthy
    if (this.activeRegion.status === 'unhealthy') {
      const failures = this.activeRegion.consecutiveFailures || 0;

      if (failures >= this.config.failoverThreshold) {
        await this.failover('auto_unhealthy');
      }
    }

    // Check if there's a better region (lower latency)
    const betterRegion = this.regions.find(
      r =>
        r.status === 'healthy' &&
        r.name !== this.activeRegion.name &&
        r.latency < this.activeRegion.latency - 100 && // 100ms improvement
        r.priority <= this.activeRegion.priority
    );

    if (betterRegion) {
      console.log(
        `⚡ Found better region: ${betterRegion.name} (${betterRegion.latency}ms vs ${this.activeRegion.latency}ms)`
      );
      await this.failover('auto_optimization');
    }
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring() {
    console.log(`🌍 Starting multi-region monitoring...`);

    // Initial check
    this.checkAllRegions();

    // Continuous monitoring
    setInterval(() => this.monitor(), this.config.healthCheckInterval);
  }

  /**
   * Get failover statistics
   */
  getStats() {
    const totalFailovers = this.failoverHistory.length;
    const avgFailoverTime =
      totalFailovers > 0
        ? this.failoverHistory.reduce((sum, f) => sum + f.duration, 0) / totalFailovers
        : 0;

    return {
      activeRegion: this.activeRegion.name,
      totalFailovers: totalFailovers,
      avgFailoverTime: Math.round(avgFailoverTime) + 'ms',
      regions: this.getRegionsStatus(),
      recentFailovers: this.failoverHistory.slice(-5),
    };
  }

  /**
   * Manual region switch
   */
  async switchToRegion(regionName) {
    const region = this.regions.find(r => r.name === regionName);

    if (!region) {
      console.error(`❌ Region ${regionName} not found`);
      return false;
    }

    if (region.name === this.activeRegion.name) {
      console.log(`ℹ️ Already on region ${regionName}`);
      return true;
    }

    // Check if region is healthy
    const healthy = await this.checkRegion(region);

    if (!healthy) {
      console.error(`❌ Region ${regionName} is unhealthy`);
      return false;
    }

    // Switch
    const oldRegion = this.activeRegion;
    this.activeRegion = region;

    console.log(`✅ Switched: ${oldRegion.name} → ${region.name}`);

    this.failoverHistory.push({
      timestamp: new Date().toISOString(),
      from: oldRegion.name,
      to: region.name,
      reason: 'manual',
      duration: 0,
    });

    return true;
  }
}

module.exports = MultiRegion;
