/**
 * PREDICTIVE SCALING
 * Anticipates future needs and prepares infrastructure
 */

class PredictiveScaling {
  constructor() {
    this.history = {
      traffic: [],
      resources: [],
      events: [],
    };

    this.predictions = [];
    this.confidence = 0.5;

    console.log('🔮 Predictive Scaling initialized');
  }

  /**
   * Predict future needs based on analysis
   */
  async predictFutureNeeds(analysis) {
    const predictions = {
      needsNewService: false,
      needsScaling: false,
      serviceName: null,
      serviceType: null,
      reason: null,
      confidence: 0,
      timeframe: null,
    };

    // Analyze trends
    const trends = this.analyzeTrends();

    // Predict traffic spikes
    const trafficPrediction = this.predictTraffic(trends);
    if (trafficPrediction.spike) {
      predictions.needsScaling = true;
      predictions.serviceToScale = trafficPrediction.service;
      predictions.scaleDirection = 'up';
      predictions.scaleAmount = trafficPrediction.amount;
      predictions.confidence = trafficPrediction.confidence;
      predictions.timeframe = trafficPrediction.when;
    }

    // Predict resource needs
    const resourcePrediction = this.predictResources(trends);
    if (resourcePrediction.needsMore) {
      predictions.needsNewService = true;
      predictions.serviceName = resourcePrediction.serviceName;
      predictions.serviceType = resourcePrediction.serviceType;
      predictions.reason = resourcePrediction.reason;
      predictions.confidence = resourcePrediction.confidence;
    }

    // Store predictions
    this.predictions.push({
      ...predictions,
      timestamp: new Date().toISOString(),
    });

    return predictions;
  }

  /**
   * Analyze trends
   */
  async analyzeTrends() {
    const alerts = [];

    // Traffic trend
    if (this.history.traffic.length > 10) {
      const recent = this.history.traffic.slice(-10);
      const avg = recent.reduce((sum, t) => sum + t.value, 0) / recent.length;
      const trend = this.calculateTrend(recent);

      if (trend > 0.2) {
        alerts.push({
          type: 'traffic_increasing',
          message: `Traffic increasing by ${(trend * 100).toFixed(0)}%`,
          severity: 'medium',
        });
      }
    }

    // Resource trend
    if (this.history.resources.length > 10) {
      const recent = this.history.resources.slice(-10);
      const trend = this.calculateTrend(recent);

      if (trend > 0.3) {
        alerts.push({
          type: 'resources_increasing',
          message: `Resource usage increasing by ${(trend * 100).toFixed(0)}%`,
          severity: 'high',
        });
      }
    }

    return { alerts };
  }

  /**
   * Predict traffic patterns
   */
  predictTraffic(trends) {
    // Simple prediction based on historical data
    if (this.history.traffic.length < 20) {
      return { spike: false };
    }

    const recent = this.history.traffic.slice(-20);
    const avg = recent.reduce((sum, t) => sum + t.value, 0) / recent.length;
    const max = Math.max(...recent.map(t => t.value));

    // Detect pattern
    const pattern = this.detectPattern(recent);

    if (pattern.type === 'increasing' && pattern.rate > 0.3) {
      return {
        spike: true,
        service: 'main',
        amount: Math.ceil(pattern.rate * 100),
        confidence: 0.8,
        when: '2 hours',
      };
    }

    return { spike: false };
  }

  /**
   * Predict resource needs
   */
  predictResources(trends) {
    // Check if we need new services
    const needsCache = this.shouldAddCache();
    const needsDatabase = this.shouldAddDatabase();
    const needsQueue = this.shouldAddQueue();

    if (needsCache) {
      return {
        needsMore: true,
        serviceName: 'Redis Cache',
        serviceType: 'redis',
        reason: 'High response times detected, caching will improve performance',
        confidence: 0.85,
      };
    }

    if (needsDatabase) {
      return {
        needsMore: true,
        serviceName: 'Read Replica',
        serviceType: 'database',
        reason: 'High database load, read replica will distribute queries',
        confidence: 0.9,
      };
    }

    if (needsQueue) {
      return {
        needsMore: true,
        serviceName: 'Job Queue',
        serviceType: 'nodejs-api',
        reason: 'Long-running tasks detected, queue will improve responsiveness',
        confidence: 0.8,
      };
    }

    return { needsMore: false };
  }

  /**
   * Calculate trend from data points
   */
  calculateTrend(data) {
    if (data.length < 2) return 0;

    const first = data[0].value;
    const last = data[data.length - 1].value;

    return (last - first) / first;
  }

  /**
   * Detect pattern in data
   */
  detectPattern(data) {
    const trend = this.calculateTrend(data);

    if (trend > 0.2) {
      return { type: 'increasing', rate: trend };
    } else if (trend < -0.2) {
      return { type: 'decreasing', rate: Math.abs(trend) };
    } else {
      return { type: 'stable', rate: 0 };
    }
  }

  /**
   * Check if should add cache
   */
  shouldAddCache() {
    // Check if response times are consistently high
    if (this.history.resources.length < 10) return false;

    const recent = this.history.resources.slice(-10);
    const highResponseTimes = recent.filter(r => r.responseTime > 500).length;

    return highResponseTimes > 7; // 70% of requests are slow
  }

  /**
   * Check if should add database replica
   */
  shouldAddDatabase() {
    // Check if database load is high
    if (this.history.resources.length < 10) return false;

    const recent = this.history.resources.slice(-10);
    const highDbLoad = recent.filter(r => r.dbLoad > 80).length;

    return highDbLoad > 7;
  }

  /**
   * Check if should add job queue
   */
  shouldAddQueue() {
    // Check if there are long-running requests
    if (this.history.resources.length < 10) return false;

    const recent = this.history.resources.slice(-10);
    const longRequests = recent.filter(r => r.responseTime > 3000).length;

    return longRequests > 5;
  }

  /**
   * Record traffic data
   */
  recordTraffic(value) {
    this.history.traffic.push({
      value,
      timestamp: new Date().toISOString(),
    });

    // Keep last 100 data points
    if (this.history.traffic.length > 100) {
      this.history.traffic.shift();
    }
  }

  /**
   * Record resource data
   */
  recordResources(data) {
    this.history.resources.push({
      ...data,
      timestamp: new Date().toISOString(),
    });

    // Keep last 100 data points
    if (this.history.resources.length > 100) {
      this.history.resources.shift();
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      predictions: this.predictions.length,
      confidence: (this.confidence * 100).toFixed(1) + '%',
      dataPoints: {
        traffic: this.history.traffic.length,
        resources: this.history.resources.length,
      },
    };
  }
}

module.exports = PredictiveScaling;
