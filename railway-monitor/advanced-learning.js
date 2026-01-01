/**
 * ADVANCED LEARNING SYSTEM
 * Pattern recognition și predictive actions
 */

class AdvancedLearning {
  constructor(config = {}) {
    this.config = {
      retentionPeriod: config.retentionPeriod || 30 * 24 * 60 * 60 * 1000, // 30 days
      minDataPoints: config.minDataPoints || 100,
      confidenceThreshold: config.confidenceThreshold || 70,
      ...config,
    };

    this.metrics = []; // Historical metrics
    this.events = []; // Historical events
    this.patterns = new Map(); // Learned patterns
    this.predictions = new Map(); // Active predictions

    console.log('🎓 Advanced Learning System initialized');
  }

  /**
   * Record metric
   */
  recordMetric(serviceId, metric) {
    this.metrics.push({
      serviceId,
      timestamp: Date.now(),
      ...metric,
    });

    // Cleanup old metrics
    const cutoff = Date.now() - this.config.retentionPeriod;
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
  }

  /**
   * Record event
   */
  recordEvent(serviceId, event) {
    this.events.push({
      serviceId,
      timestamp: Date.now(),
      ...event,
    });

    // Cleanup old events
    const cutoff = Date.now() - this.config.retentionPeriod;
    this.events = this.events.filter(e => e.timestamp > cutoff);

    // Learn from event
    this.learnFromEvent(serviceId, event);
  }

  /**
   * Learn from event
   */
  learnFromEvent(serviceId, event) {
    const patternKey = `${serviceId}:${event.type}`;

    if (!this.patterns.has(patternKey)) {
      this.patterns.set(patternKey, {
        type: event.type,
        occurrences: 0,
        successfulFixes: [],
        failedFixes: [],
        avgRecoveryTime: 0,
        lastOccurrence: null,
      });
    }

    const pattern = this.patterns.get(patternKey);
    pattern.occurrences++;
    pattern.lastOccurrence = Date.now();

    // Record fix success/failure
    if (event.fix) {
      if (event.fix.success) {
        pattern.successfulFixes.push({
          action: event.fix.action,
          recoveryTime: event.fix.recoveryTime,
          timestamp: Date.now(),
        });
      } else {
        pattern.failedFixes.push({
          action: event.fix.action,
          error: event.fix.error,
          timestamp: Date.now(),
        });
      }

      // Update avg recovery time
      if (pattern.successfulFixes.length > 0) {
        pattern.avgRecoveryTime =
          pattern.successfulFixes.reduce((sum, f) => sum + f.recoveryTime, 0) /
          pattern.successfulFixes.length;
      }
    }
  }

  /**
   * Get best fix for a problem
   */
  getBestFix(serviceId, problemType) {
    const patternKey = `${serviceId}:${problemType}`;
    const pattern = this.patterns.get(patternKey);

    if (!pattern || pattern.successfulFixes.length === 0) {
      return null;
    }

    // Count fix actions
    const fixCounts = {};
    for (const fix of pattern.successfulFixes) {
      fixCounts[fix.action] = (fixCounts[fix.action] || 0) + 1;
    }

    // Find most successful fix
    let bestFix = null;
    let maxCount = 0;
    for (const [action, count] of Object.entries(fixCounts)) {
      if (count > maxCount) {
        maxCount = count;
        bestFix = action;
      }
    }

    const successRate = (maxCount / pattern.successfulFixes.length) * 100;

    return {
      action: bestFix,
      successRate,
      occurrences: maxCount,
      avgRecoveryTime: pattern.avgRecoveryTime,
    };
  }

  /**
   * Predict future load
   */
  async predictLoad(serviceId, hoursAhead = 1) {
    const serviceMetrics = this.metrics.filter(m => m.serviceId === serviceId);

    if (serviceMetrics.length < this.config.minDataPoints) {
      return {
        prediction: null,
        confidence: 0,
        reason: 'Insufficient data',
      };
    }

    const targetTime = Date.now() + hoursAhead * 60 * 60 * 1000;
    const targetHour = new Date(targetTime).getHours();
    const targetDay = new Date(targetTime).getDay();

    // Find similar time periods (same hour, same day of week)
    const similar = serviceMetrics.filter(m => {
      const mHour = new Date(m.timestamp).getHours();
      const mDay = new Date(m.timestamp).getDay();
      return Math.abs(mHour - targetHour) <= 1 && mDay === targetDay;
    });

    if (similar.length < 10) {
      return {
        prediction: null,
        confidence: 0,
        reason: 'Insufficient similar data',
      };
    }

    // Calculate averages
    const avgCpu = similar.reduce((sum, m) => sum + (m.cpu || 0), 0) / similar.length;
    const avgMemory = similar.reduce((sum, m) => sum + (m.memory || 0), 0) / similar.length;
    const avgResponseTime =
      similar.reduce((sum, m) => sum + (m.responseTime || 0), 0) / similar.length;
    const avgRequests = similar.reduce((sum, m) => sum + (m.requests || 0), 0) / similar.length;

    // Calculate confidence (based on data consistency)
    const cpuStdDev = this.calculateStdDev(similar.map(m => m.cpu || 0));
    const confidence = Math.max(0, Math.min(100, 100 - (cpuStdDev / avgCpu) * 100));

    return {
      prediction: {
        cpu: avgCpu,
        memory: avgMemory,
        responseTime: avgResponseTime,
        requests: avgRequests,
        targetTime,
        targetHour,
        targetDay,
      },
      confidence,
      dataPoints: similar.length,
      reason: 'success',
    };
  }

  /**
   * Detect patterns
   */
  detectPatterns(serviceId) {
    const serviceMetrics = this.metrics.filter(m => m.serviceId === serviceId);

    if (serviceMetrics.length < this.config.minDataPoints) {
      return [];
    }

    const patterns = [];

    // Pattern 1: Daily spike
    const dailySpike = this.detectDailySpike(serviceMetrics);
    if (dailySpike) patterns.push(dailySpike);

    // Pattern 2: Weekly pattern
    const weeklyPattern = this.detectWeeklyPattern(serviceMetrics);
    if (weeklyPattern) patterns.push(weeklyPattern);

    // Pattern 3: Memory leak
    const memoryLeak = this.detectMemoryLeak(serviceMetrics);
    if (memoryLeak) patterns.push(memoryLeak);

    // Pattern 4: Gradual degradation
    const degradation = this.detectDegradation(serviceMetrics);
    if (degradation) patterns.push(degradation);

    return patterns;
  }

  /**
   * Detect daily spike pattern
   */
  detectDailySpike(metrics) {
    // Group by hour
    const hourlyAvg = new Array(24).fill(0);
    const hourlyCounts = new Array(24).fill(0);

    for (const m of metrics) {
      const hour = new Date(m.timestamp).getHours();
      hourlyAvg[hour] += m.cpu || 0;
      hourlyCounts[hour]++;
    }

    for (let i = 0; i < 24; i++) {
      if (hourlyCounts[i] > 0) {
        hourlyAvg[i] /= hourlyCounts[i];
      }
    }

    // Find peak hour
    let peakHour = 0;
    let peakValue = 0;
    for (let i = 0; i < 24; i++) {
      if (hourlyAvg[i] > peakValue) {
        peakValue = hourlyAvg[i];
        peakHour = i;
      }
    }

    // Check if peak is significant
    const avgValue = hourlyAvg.reduce((sum, v) => sum + v, 0) / 24;
    if (peakValue > avgValue * 1.5) {
      return {
        type: 'daily_spike',
        peakHour,
        peakValue,
        avgValue,
        increase: ((peakValue - avgValue) / avgValue) * 100,
        recommendation: `Pre-scale at ${peakHour - 1}:00 to handle spike at ${peakHour}:00`,
      };
    }

    return null;
  }

  /**
   * Detect weekly pattern
   */
  detectWeeklyPattern(metrics) {
    // Group by day of week
    const dailyAvg = new Array(7).fill(0);
    const dailyCounts = new Array(7).fill(0);

    for (const m of metrics) {
      const day = new Date(m.timestamp).getDay();
      dailyAvg[day] += m.cpu || 0;
      dailyCounts[day]++;
    }

    for (let i = 0; i < 7; i++) {
      if (dailyCounts[i] > 0) {
        dailyAvg[i] /= dailyCounts[i];
      }
    }

    // Find peak day
    let peakDay = 0;
    let peakValue = 0;
    for (let i = 0; i < 7; i++) {
      if (dailyAvg[i] > peakValue) {
        peakValue = dailyAvg[i];
        peakDay = i;
      }
    }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const avgValue = dailyAvg.reduce((sum, v) => sum + v, 0) / 7;

    if (peakValue > avgValue * 1.3) {
      return {
        type: 'weekly_pattern',
        peakDay: days[peakDay],
        peakValue,
        avgValue,
        increase: ((peakValue - avgValue) / avgValue) * 100,
        recommendation: `Expect higher load on ${days[peakDay]}`,
      };
    }

    return null;
  }

  /**
   * Detect memory leak
   */
  detectMemoryLeak(metrics) {
    if (metrics.length < 50) return null;

    // Get recent memory values
    const recent = metrics.slice(-50);
    const memoryValues = recent.map(m => m.memory || 0).filter(v => v > 0);

    if (memoryValues.length < 20) return null;

    // Calculate trend (simple linear regression)
    const trend = this.calculateTrend(memoryValues);

    // If memory is consistently increasing
    if (trend > 0.5) {
      // 0.5% increase per data point
      const currentMemory = memoryValues[memoryValues.length - 1];
      const projectedMemory = currentMemory + trend * 100;

      return {
        type: 'memory_leak',
        currentMemory,
        trend,
        projectedMemory,
        recommendation: 'Schedule periodic cache clearing or restart',
      };
    }

    return null;
  }

  /**
   * Detect gradual degradation
   */
  detectDegradation(metrics) {
    if (metrics.length < 50) return null;

    const recent = metrics.slice(-50);
    const responseTimes = recent.map(m => m.responseTime || 0).filter(v => v > 0);

    if (responseTimes.length < 20) return null;

    // Calculate trend
    const trend = this.calculateTrend(responseTimes);

    // If response time is consistently increasing
    if (trend > 2) {
      // 2ms increase per data point
      const currentResponseTime = responseTimes[responseTimes.length - 1];
      const projectedResponseTime = currentResponseTime + trend * 100;

      return {
        type: 'gradual_degradation',
        currentResponseTime,
        trend,
        projectedResponseTime,
        recommendation: 'Investigate performance bottlenecks',
      };
    }

    return null;
  }

  /**
   * Calculate standard deviation
   */
  calculateStdDev(values) {
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((sum, v) => sum + v, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
  }

  /**
   * Calculate trend (simple linear regression slope)
   */
  calculateTrend(values) {
    const n = values.length;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  /**
   * Get learning statistics
   */
  getStats() {
    return {
      totalMetrics: this.metrics.length,
      totalEvents: this.events.length,
      learnedPatterns: this.patterns.size,
      activePredictions: this.predictions.size,
      patterns: Array.from(this.patterns.entries()).map(([key, pattern]) => ({
        key,
        type: pattern.type,
        occurrences: pattern.occurrences,
        successfulFixes: pattern.successfulFixes.length,
        failedFixes: pattern.failedFixes.length,
        avgRecoveryTime: pattern.avgRecoveryTime,
        lastOccurrence: pattern.lastOccurrence,
      })),
    };
  }
}

module.exports = AdvancedLearning;
