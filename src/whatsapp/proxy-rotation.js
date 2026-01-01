/**
 * Proxy Rotation Module
 *
 * IP rotation per account to prevent mass bans:
 * - Proxy pool management
 * - Per-account proxy assignment
 * - Automatic rotation on failure
 * - Health checking for proxies
 * - Support for HTTP/HTTPS/SOCKS5
 * - Proxy authentication
 *
 * Truth: 70% - Proxy rotation helps, but not guaranteed
 *
 * Note: Requires proxy service (e.g., Bright Data, Oxylabs, SmartProxy)
 * Cost: $5-20 per proxy per month
 */

const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

class ProxyRotationManager {
  constructor() {
    // Proxy pool
    this.proxies = new Map(); // proxyId -> { url, type, username, password, enabled, health }

    // Account assignments
    this.assignments = new Map(); // accountId -> proxyId

    // Proxy health
    this.health = new Map(); // proxyId -> { lastCheck, status, latency, failures }

    // Configuration
    this.config = {
      healthCheckInterval: 300000, // 5 min
      healthCheckTimeout: 10000, // 10s
      maxFailures: 3, // Disable after 3 failures
      rotateOnFailure: true, // Auto-rotate on failure
      testUrl: 'https://api.ipify.org?format=json', // IP check service
    };

    // Stats
    this.stats = {
      rotations: 0,
      failures: 0,
      healthChecks: 0,
    };

    // Start health checker
    this.startHealthChecker();
  }

  /**
   * Add proxy to pool
   */
  addProxy(proxyId, config) {
    if (!config.url) {
      throw new Error('Proxy URL is required');
    }

    // Parse proxy URL
    const parsed = this.parseProxyUrl(config.url);

    this.proxies.set(proxyId, {
      url: config.url,
      type: config.type || parsed.type || 'http',
      username: config.username || parsed.username,
      password: config.password || parsed.password,
      host: parsed.host,
      port: parsed.port,
      enabled: config.enabled !== false,
      sticky: config.sticky || false, // Sticky = don't rotate
    });

    // Initialize health
    this.health.set(proxyId, {
      lastCheck: 0,
      status: 'unknown',
      latency: 0,
      failures: 0,
      lastFailure: 0,
    });

    console.log(`✅ Proxy added: ${proxyId} (${parsed.host}:${parsed.port})`);
  }

  /**
   * Parse proxy URL
   */
  parseProxyUrl(url) {
    try {
      const urlObj = new URL(url);

      return {
        type: urlObj.protocol.replace(':', ''),
        host: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        username: urlObj.username || null,
        password: urlObj.password || null,
      };
    } catch (error) {
      throw new Error(`Invalid proxy URL: ${url}`);
    }
  }

  /**
   * Remove proxy from pool
   */
  removeProxy(proxyId) {
    if (this.proxies.has(proxyId)) {
      this.proxies.delete(proxyId);
      this.health.delete(proxyId);

      // Remove assignments
      for (const [accountId, assignedProxyId] of this.assignments.entries()) {
        if (assignedProxyId === proxyId) {
          this.assignments.delete(accountId);
        }
      }

      console.log(`✅ Proxy removed: ${proxyId}`);
      return true;
    }
    return false;
  }

  /**
   * Assign proxy to account
   */
  assignProxy(accountId, proxyId) {
    if (!this.proxies.has(proxyId)) {
      throw new Error(`Proxy not found: ${proxyId}`);
    }

    const proxy = this.proxies.get(proxyId);
    if (!proxy.enabled) {
      throw new Error(`Proxy disabled: ${proxyId}`);
    }

    this.assignments.set(accountId, proxyId);
    console.log(`✅ Proxy assigned: ${accountId} -> ${proxyId}`);
  }

  /**
   * Auto-assign proxy to account (round-robin)
   */
  autoAssignProxy(accountId) {
    // Get available proxies
    const available = Array.from(this.proxies.entries())
      .filter(([id, proxy]) => proxy.enabled)
      .map(([id]) => id);

    if (available.length === 0) {
      throw new Error('No available proxies');
    }

    // Count assignments per proxy
    const counts = new Map();
    for (const proxyId of available) {
      counts.set(proxyId, 0);
    }

    for (const assignedProxyId of this.assignments.values()) {
      if (counts.has(assignedProxyId)) {
        counts.set(assignedProxyId, counts.get(assignedProxyId) + 1);
      }
    }

    // Find proxy with least assignments
    let minCount = Infinity;
    let selectedProxyId = null;

    for (const [proxyId, count] of counts.entries()) {
      if (count < minCount) {
        minCount = count;
        selectedProxyId = proxyId;
      }
    }

    this.assignProxy(accountId, selectedProxyId);
    return selectedProxyId;
  }

  /**
   * Rotate proxy for account
   */
  rotateProxy(accountId) {
    const currentProxyId = this.assignments.get(accountId);

    // Check if current proxy is sticky
    if (currentProxyId) {
      const currentProxy = this.proxies.get(currentProxyId);
      if (currentProxy && currentProxy.sticky) {
        console.log(`⏭️ Proxy is sticky, not rotating: ${accountId}`);
        return currentProxyId;
      }
    }

    // Get available proxies (excluding current)
    const available = Array.from(this.proxies.entries())
      .filter(([id, proxy]) => proxy.enabled && id !== currentProxyId)
      .map(([id]) => id);

    if (available.length === 0) {
      console.warn(`⚠️ No alternative proxies available for rotation: ${accountId}`);
      return currentProxyId;
    }

    // Select random proxy
    const newProxyId = available[Math.floor(Math.random() * available.length)];

    this.assignProxy(accountId, newProxyId);
    this.stats.rotations++;

    console.log(`🔄 Proxy rotated: ${accountId} (${currentProxyId} -> ${newProxyId})`);

    return newProxyId;
  }

  /**
   * Get proxy for account
   */
  getProxy(accountId) {
    const proxyId = this.assignments.get(accountId);
    if (!proxyId) {
      return null;
    }

    return this.proxies.get(proxyId);
  }

  /**
   * Get proxy agent for Baileys
   */
  getProxyAgent(accountId) {
    const proxy = this.getProxy(accountId);
    if (!proxy) {
      return null;
    }

    try {
      // Build proxy URL with auth
      let proxyUrl = `${proxy.type}://`;

      if (proxy.username && proxy.password) {
        proxyUrl += `${proxy.username}:${proxy.password}@`;
      }

      proxyUrl += `${proxy.host}:${proxy.port}`;

      // Create agent based on type
      if (proxy.type === 'socks' || proxy.type === 'socks5') {
        return new SocksProxyAgent(proxyUrl);
      } else {
        return new HttpsProxyAgent(proxyUrl);
      }
    } catch (error) {
      console.error(`❌ Failed to create proxy agent: ${error.message}`);
      return null;
    }
  }

  /**
   * Check proxy health
   */
  async checkProxyHealth(proxyId) {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) {
      return { status: 'not_found' };
    }

    const health = this.health.get(proxyId);
    const startTime = Date.now();

    try {
      // Build proxy URL
      let proxyUrl = `${proxy.type}://`;
      if (proxy.username && proxy.password) {
        proxyUrl += `${proxy.username}:${proxy.password}@`;
      }
      proxyUrl += `${proxy.host}:${proxy.port}`;

      // Create agent
      let agent;
      if (proxy.type === 'socks' || proxy.type === 'socks5') {
        agent = new SocksProxyAgent(proxyUrl);
      } else {
        agent = new HttpsProxyAgent(proxyUrl);
      }

      // Test request
      const response = await axios.get(this.config.testUrl, {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: this.config.healthCheckTimeout,
      });

      const latency = Date.now() - startTime;

      // Update health
      health.lastCheck = Date.now();
      health.status = 'healthy';
      health.latency = latency;
      health.failures = 0;

      this.stats.healthChecks++;

      console.log(
        `✅ Proxy health check passed: ${proxyId} (${latency}ms, IP: ${response.data.ip})`
      );

      return {
        status: 'healthy',
        latency,
        ip: response.data.ip,
      };
    } catch (error) {
      // Update health
      health.lastCheck = Date.now();
      health.status = 'unhealthy';
      health.failures++;
      health.lastFailure = Date.now();

      this.stats.failures++;

      console.error(`❌ Proxy health check failed: ${proxyId} - ${error.message}`);

      // Disable if too many failures
      if (health.failures >= this.config.maxFailures) {
        proxy.enabled = false;
        console.warn(`⚠️ Proxy disabled due to failures: ${proxyId}`);
      }

      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  /**
   * Start health checker
   */
  startHealthChecker() {
    const checkAll = async () => {
      for (const proxyId of this.proxies.keys()) {
        await this.checkProxyHealth(proxyId);

        // Small delay between checks
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setTimeout(checkAll, this.config.healthCheckInterval);
    };

    // Start after 10s
    setTimeout(checkAll, 10000);
  }

  /**
   * Handle proxy failure
   */
  handleProxyFailure(accountId, error) {
    const proxyId = this.assignments.get(accountId);
    if (!proxyId) {
      return;
    }

    const health = this.health.get(proxyId);
    if (health) {
      health.failures++;
      health.lastFailure = Date.now();

      // Check if should disable
      if (health.failures >= this.config.maxFailures) {
        const proxy = this.proxies.get(proxyId);
        if (proxy) {
          proxy.enabled = false;
          console.warn(`⚠️ Proxy disabled due to failures: ${proxyId}`);
        }
      }
    }

    // Rotate if enabled
    if (this.config.rotateOnFailure) {
      this.rotateProxy(accountId);
    }
  }

  /**
   * Get all proxies
   */
  getProxies() {
    const proxies = {};

    for (const [proxyId, proxy] of this.proxies.entries()) {
      const health = this.health.get(proxyId);

      proxies[proxyId] = {
        host: proxy.host,
        port: proxy.port,
        type: proxy.type,
        enabled: proxy.enabled,
        sticky: proxy.sticky,
        hasAuth: !!(proxy.username && proxy.password),
        health: health
          ? {
              status: health.status,
              latency: health.latency,
              failures: health.failures,
              lastCheck: health.lastCheck,
            }
          : null,
      };
    }

    return proxies;
  }

  /**
   * Get assignments
   */
  getAssignments() {
    const assignments = {};

    for (const [accountId, proxyId] of this.assignments.entries()) {
      assignments[accountId] = proxyId;
    }

    return assignments;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      totalProxies: this.proxies.size,
      enabledProxies: Array.from(this.proxies.values()).filter(p => p.enabled).length,
      assignments: this.assignments.size,
      healthyProxies: Array.from(this.health.values()).filter(h => h.status === 'healthy').length,
    };
  }

  /**
   * Cleanup
   */
  cleanup(accountId) {
    if (accountId) {
      this.assignments.delete(accountId);
    } else {
      this.proxies.clear();
      this.assignments.clear();
      this.health.clear();
    }
  }
}

// Singleton instance
const proxyRotationManager = new ProxyRotationManager();

module.exports = proxyRotationManager;
