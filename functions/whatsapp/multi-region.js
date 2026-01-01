/**
 * TIER 3: Multi-Region Failover
 * Manages multiple Railway deployments for high availability
 */

class MultiRegionManager {
  constructor() {
    this.regions = [
      {
        name: 'primary',
        url: process.env.PRIMARY_REGION_URL || process.env.RAILWAY_PUBLIC_DOMAIN,
        active: true,
        healthCheckFails: 0,
      },
      {
        name: 'backup',
        url: process.env.BACKUP_REGION_URL,
        active: false,
        healthCheckFails: 0,
      },
    ];

    this.activeRegionIndex = 0;
    this.healthCheckInterval = null;

    // Start health checks if backup region is configured
    if (this.regions[1].url) {
      this.startHealthChecks();
    }
  }

  /**
   * Start health checks for all regions
   */
  startHealthChecks() {
    this.healthCheckInterval = setInterval(async () => {
      for (let i = 0; i < this.regions.length; i++) {
        const region = this.regions[i];
        const isHealthy = await this.checkRegionHealth(region);

        if (!isHealthy) {
          region.healthCheckFails++;
          console.log(
            `⚠️ Region ${region.name} health check failed (${region.healthCheckFails}/3)`
          );

          // Failover after 3 consecutive failures
          if (region.healthCheckFails >= 3 && region.active) {
            await this.failover();
          }
        } else {
          region.healthCheckFails = 0;
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Check if region is healthy
   */
  async checkRegionHealth(region) {
    if (!region.url) return false;

    try {
      const response = await fetch(`${region.url}/health`, {
        timeout: 5000,
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Failover to backup region
   */
  async failover() {
    const currentRegion = this.regions[this.activeRegionIndex];
    const nextIndex = (this.activeRegionIndex + 1) % this.regions.length;
    const nextRegion = this.regions[nextIndex];

    if (!nextRegion.url) {
      console.error('❌ No backup region configured, cannot failover');
      return false;
    }

    console.log(`🌍 Failing over from ${currentRegion.name} to ${nextRegion.name}`);

    // Mark regions
    currentRegion.active = false;
    nextRegion.active = true;
    this.activeRegionIndex = nextIndex;

    console.log(`✅ Failover complete, active region: ${nextRegion.name}`);
    return true;
  }

  /**
   * Get active region URL
   */
  getActiveRegionUrl() {
    return this.regions[this.activeRegionIndex].url;
  }

  /**
   * Get active region name
   */
  getActiveRegionName() {
    return this.regions[this.activeRegionIndex].name;
  }

  /**
   * Stop health checks
   */
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

module.exports = MultiRegionManager;
