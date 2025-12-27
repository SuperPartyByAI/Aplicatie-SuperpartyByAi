/**
 * Advanced Health Checker
 * - Deep health checks
 * - Performance monitoring
 * - Predictive failure detection
 * - Pre-warming
 */

const https = require('https');
const http = require('http');

class HealthChecker {
  constructor() {
    this.services = new Map();
    this.performanceHistory = new Map();
    this.maxHistorySize = 100;
  }
  
  /**
   * Register service for monitoring
   */
  registerService(id, config) {
    this.services.set(id, {
      ...config,
      lastCheck: null,
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0
    });
    
    this.performanceHistory.set(id, []);
  }
  
  /**
   * Deep health check with performance metrics
   */
  async checkHealth(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service ${serviceId} not registered`);
    }
    
    const startTime = Date.now();
    
    try {
      const result = await this.performHealthCheck(service);
      const responseTime = Date.now() - startTime;
      
      // Record performance
      this.recordPerformance(serviceId, {
        timestamp: Date.now(),
        responseTime,
        success: result.healthy,
        statusCode: result.status
      });
      
      // Update service state
      service.lastCheck = new Date().toISOString();
      
      if (result.healthy) {
        service.lastSuccess = service.lastCheck;
        service.consecutiveSuccesses++;
        service.consecutiveFailures = 0;
      } else {
        service.lastFailure = service.lastCheck;
        service.consecutiveFailures++;
        service.consecutiveSuccesses = 0;
      }
      
      return {
        ...result,
        responseTime,
        consecutiveFailures: service.consecutiveFailures,
        prediction: this.predictFailure(serviceId)
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.recordPerformance(serviceId, {
        timestamp: Date.now(),
        responseTime,
        success: false,
        error: error.message
      });
      
      service.lastCheck = new Date().toISOString();
      service.lastFailure = service.lastCheck;
      service.consecutiveFailures++;
      service.consecutiveSuccesses = 0;
      
      return {
        healthy: false,
        error: error.message,
        responseTime,
        consecutiveFailures: service.consecutiveFailures,
        prediction: this.predictFailure(serviceId)
      };
    }
  }
  
  /**
   * Perform actual HTTP health check
   */
  performHealthCheck(service) {
    return new Promise((resolve) => {
      const url = new URL(service.url + service.healthPath);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;
      
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        timeout: 10000,
        headers: {
          'User-Agent': 'Railway-Monitor/2.0'
        }
      };
      
      const req = lib.request(options, (res) => {
        const healthy = res.statusCode >= 200 && res.statusCode < 400;
        
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({
            healthy,
            status: res.statusCode,
            service: service.name,
            body: body.substring(0, 200) // First 200 chars
          });
        });
      });
      
      req.on('error', (error) => {
        resolve({
          healthy: false,
          status: 0,
          service: service.name,
          error: error.message
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({
          healthy: false,
          status: 0,
          service: service.name,
          error: 'Timeout'
        });
      });
      
      req.end();
    });
  }
  
  /**
   * Record performance metrics
   */
  recordPerformance(serviceId, metrics) {
    const history = this.performanceHistory.get(serviceId) || [];
    history.push(metrics);
    
    // Keep only last N entries
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
    
    this.performanceHistory.set(serviceId, history);
  }
  
  /**
   * Predict potential failure based on trends
   */
  predictFailure(serviceId) {
    const history = this.performanceHistory.get(serviceId) || [];
    
    if (history.length < 10) {
      return { risk: 'unknown', reason: 'Insufficient data' };
    }
    
    const recent = history.slice(-10);
    const avgResponseTime = recent.reduce((sum, m) => sum + m.responseTime, 0) / recent.length;
    const failureRate = recent.filter(m => !m.success).length / recent.length;
    
    // Check for degrading performance
    const firstHalf = recent.slice(0, 5);
    const secondHalf = recent.slice(5);
    const firstAvg = firstHalf.reduce((sum, m) => sum + m.responseTime, 0) / 5;
    const secondAvg = secondHalf.reduce((sum, m) => sum + m.responseTime, 0) / 5;
    const degradation = (secondAvg - firstAvg) / firstAvg;
    
    // Risk assessment
    if (failureRate > 0.3) {
      return { risk: 'high', reason: `High failure rate: ${(failureRate * 100).toFixed(1)}%` };
    }
    
    if (degradation > 0.5) {
      return { risk: 'medium', reason: `Performance degrading: +${(degradation * 100).toFixed(1)}%` };
    }
    
    if (avgResponseTime > 5000) {
      return { risk: 'medium', reason: `Slow response: ${avgResponseTime.toFixed(0)}ms` };
    }
    
    return { risk: 'low', reason: 'Service healthy' };
  }
  
  /**
   * Pre-warm service (keep it ready)
   */
  async prewarmService(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) return;
    
    console.log(`🔥 [PreWarm] Warming up ${service.name}...`);
    
    try {
      await this.performHealthCheck(service);
      console.log(`✅ [PreWarm] ${service.name} is warm and ready`);
    } catch (error) {
      console.error(`❌ [PreWarm] Failed to warm ${service.name}:`, error.message);
    }
  }
  
  /**
   * Get service statistics
   */
  getStats(serviceId) {
    const history = this.performanceHistory.get(serviceId) || [];
    const service = this.services.get(serviceId);
    
    if (history.length === 0) {
      return { noData: true };
    }
    
    const successes = history.filter(m => m.success).length;
    const failures = history.filter(m => !m.success).length;
    const avgResponseTime = history.reduce((sum, m) => sum + m.responseTime, 0) / history.length;
    const uptime = (successes / history.length * 100).toFixed(2);
    
    return {
      uptime: `${uptime}%`,
      avgResponseTime: `${avgResponseTime.toFixed(0)}ms`,
      totalChecks: history.length,
      successes,
      failures,
      consecutiveFailures: service?.consecutiveFailures || 0,
      lastCheck: service?.lastCheck,
      lastSuccess: service?.lastSuccess,
      lastFailure: service?.lastFailure
    };
  }
}

module.exports = HealthChecker;
