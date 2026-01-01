/**
 * Advanced Health Checks Module
 *
 * Predictive failure detection:
 * - Pattern analysis (disconnect frequency, timing)
 * - Connection quality scoring
 * - Predictive alerts before failure
 * - Historical data tracking
 * - Anomaly detection
 * - Proactive intervention
 *
 * Truth: 75% - Pattern detection works, but prediction is limited
 */

class AdvancedHealthChecker {
  constructor() {
    // Health history per account
    this.history = {}; // accountId -> events[]

    // Configuration
    this.config = {
      historySize: 100, // Keep last 100 events
      checkInterval: 30000, // Check every 30s
      predictionWindow: 300000, // 5 min prediction window

      // Thresholds
      disconnectThreshold: 3, // 3 disconnects in window = warning
      latencyThreshold: 2000, // 2s latency = warning
      errorRateThreshold: 0.1, // 10% error rate = warning

      // Scoring weights
      weights: {
        disconnects: 0.3,
        latency: 0.2,
        errorRate: 0.2,
        messageSuccess: 0.15,
        uptime: 0.15,
      },
    };

    // Current health scores
    this.scores = {}; // accountId -> score (0-100)

    // Predictions
    this.predictions = {}; // accountId -> { risk, reason, confidence }

    // Anomalies detected
    this.anomalies = [];
  }

  /**
   * Initialize account tracking
   */
  initAccount(accountId) {
    if (!this.history[accountId]) {
      this.history[accountId] = {
        events: [],
        disconnects: [],
        latencies: [],
        errors: [],
        messages: { sent: 0, failed: 0 },
        connectedAt: Date.now(),
        lastDisconnect: 0,
        totalUptime: 0,
        totalDowntime: 0,
      };
    }

    if (!this.scores[accountId]) {
      this.scores[accountId] = 100; // Start with perfect score
    }
  }

  /**
   * Record event
   */
  recordEvent(accountId, eventType, data = {}) {
    this.initAccount(accountId);
    const history = this.history[accountId];
    const now = Date.now();

    const event = {
      type: eventType,
      timestamp: now,
      data,
    };

    // Add to events
    history.events.push(event);

    // Limit history size
    if (history.events.length > this.config.historySize) {
      history.events.shift();
    }

    // Process specific events
    switch (eventType) {
      case 'disconnect':
        history.disconnects.push(now);
        history.lastDisconnect = now;

        // Calculate downtime
        if (history.connectedAt) {
          const uptime = now - history.connectedAt;
          history.totalUptime += uptime;
        }
        break;

      case 'connect':
        history.connectedAt = now;

        // Calculate downtime
        if (history.lastDisconnect) {
          const downtime = now - history.lastDisconnect;
          history.totalDowntime += downtime;
        }
        break;

      case 'latency':
        history.latencies.push({ timestamp: now, value: data.latency });
        break;

      case 'error':
        history.errors.push({ timestamp: now, error: data.error });
        break;

      case 'message_sent':
        history.messages.sent++;
        break;

      case 'message_failed':
        history.messages.failed++;
        break;
    }

    // Clean old data
    this.cleanOldData(accountId);

    // Update health score
    this.updateHealthScore(accountId);

    // Check for anomalies
    this.detectAnomalies(accountId);

    // Make prediction
    this.predictFailure(accountId);
  }

  /**
   * Clean old data outside prediction window
   */
  cleanOldData(accountId) {
    const history = this.history[accountId];
    const now = Date.now();
    const window = this.config.predictionWindow;

    // Clean disconnects
    history.disconnects = history.disconnects.filter(time => now - time < window);

    // Clean latencies
    history.latencies = history.latencies.filter(item => now - item.timestamp < window);

    // Clean errors
    history.errors = history.errors.filter(item => now - item.timestamp < window);
  }

  /**
   * Calculate health score (0-100)
   */
  updateHealthScore(accountId) {
    const history = this.history[accountId];
    const now = Date.now();
    const window = this.config.predictionWindow;

    let score = 100;
    const weights = this.config.weights;

    // 1. Disconnect frequency (30%)
    const recentDisconnects = history.disconnects.filter(time => now - time < window).length;
    const disconnectScore = Math.max(0, 100 - recentDisconnects * 20);
    score -= (100 - disconnectScore) * weights.disconnects;

    // 2. Average latency (20%)
    const recentLatencies = history.latencies.filter(item => now - item.timestamp < window);
    if (recentLatencies.length > 0) {
      const avgLatency =
        recentLatencies.reduce((sum, item) => sum + item.value, 0) / recentLatencies.length;
      const latencyScore = Math.max(0, 100 - avgLatency / 20); // 2000ms = 0 score
      score -= (100 - latencyScore) * weights.latency;
    }

    // 3. Error rate (20%)
    const recentErrors = history.errors.filter(item => now - item.timestamp < window).length;
    const errorScore = Math.max(0, 100 - recentErrors * 10);
    score -= (100 - errorScore) * weights.errorRate;

    // 4. Message success rate (15%)
    const totalMessages = history.messages.sent + history.messages.failed;
    if (totalMessages > 0) {
      const successRate = history.messages.sent / totalMessages;
      const messageScore = successRate * 100;
      score -= (100 - messageScore) * weights.messageSuccess;
    }

    // 5. Uptime percentage (15%)
    const totalTime = history.totalUptime + history.totalDowntime;
    if (totalTime > 0) {
      const uptimePercent = (history.totalUptime / totalTime) * 100;
      score -= (100 - uptimePercent) * weights.uptime;
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    this.scores[accountId] = Math.round(score);
  }

  /**
   * Detect anomalies
   */
  detectAnomalies(accountId) {
    const history = this.history[accountId];
    const now = Date.now();
    const window = this.config.predictionWindow;

    // Check disconnect frequency
    const recentDisconnects = history.disconnects.filter(time => now - time < window).length;

    if (recentDisconnects >= this.config.disconnectThreshold) {
      this.addAnomaly(accountId, 'high_disconnect_rate', {
        count: recentDisconnects,
        threshold: this.config.disconnectThreshold,
      });
    }

    // Check latency spikes
    const recentLatencies = history.latencies.filter(item => now - item.timestamp < window);

    if (recentLatencies.length > 0) {
      const avgLatency =
        recentLatencies.reduce((sum, item) => sum + item.value, 0) / recentLatencies.length;

      if (avgLatency > this.config.latencyThreshold) {
        this.addAnomaly(accountId, 'high_latency', {
          average: Math.round(avgLatency),
          threshold: this.config.latencyThreshold,
        });
      }
    }

    // Check error rate
    const totalMessages = history.messages.sent + history.messages.failed;
    if (totalMessages > 10) {
      // Only if enough data
      const errorRate = history.messages.failed / totalMessages;

      if (errorRate > this.config.errorRateThreshold) {
        this.addAnomaly(accountId, 'high_error_rate', {
          rate: Math.round(errorRate * 100),
          threshold: Math.round(this.config.errorRateThreshold * 100),
        });
      }
    }
  }

  /**
   * Add anomaly
   */
  addAnomaly(accountId, type, data) {
    const anomaly = {
      accountId,
      type,
      timestamp: Date.now(),
      data,
    };

    // Check if already exists (avoid duplicates)
    const exists = this.anomalies.some(
      a => a.accountId === accountId && a.type === type && Date.now() - a.timestamp < 60000 // Within last minute
    );

    if (!exists) {
      this.anomalies.push(anomaly);

      // Limit anomalies size
      if (this.anomalies.length > 100) {
        this.anomalies.shift();
      }

      console.warn(`⚠️ Anomaly detected [${accountId}]: ${type}`, data);
    }
  }

  /**
   * Predict failure (simple pattern-based)
   */
  predictFailure(accountId) {
    const history = this.history[accountId];
    const score = this.scores[accountId];
    const now = Date.now();

    let risk = 'low';
    const reason = [];
    let confidence = 0;

    // Check health score
    if (score < 50) {
      risk = 'high';
      reason.push('Health score below 50%');
      confidence += 30;
    } else if (score < 70) {
      risk = 'medium';
      reason.push('Health score below 70%');
      confidence += 20;
    }

    // Check disconnect pattern
    const recentDisconnects = history.disconnects.filter(
      time => now - time < this.config.predictionWindow
    );

    if (recentDisconnects.length >= 3) {
      risk = 'high';
      reason.push(`${recentDisconnects.length} disconnects in 5 min`);
      confidence += 25;
    } else if (recentDisconnects.length >= 2) {
      if (risk === 'low') risk = 'medium';
      reason.push(`${recentDisconnects.length} disconnects in 5 min`);
      confidence += 15;
    }

    // Check disconnect timing pattern (getting more frequent?)
    if (recentDisconnects.length >= 2) {
      const intervals = [];
      for (let i = 1; i < recentDisconnects.length; i++) {
        intervals.push(recentDisconnects[i] - recentDisconnects[i - 1]);
      }

      // Check if intervals are decreasing (more frequent)
      let decreasing = true;
      for (let i = 1; i < intervals.length; i++) {
        if (intervals[i] >= intervals[i - 1]) {
          decreasing = false;
          break;
        }
      }

      if (decreasing) {
        risk = 'high';
        reason.push('Disconnect frequency increasing');
        confidence += 20;
      }
    }

    // Check error rate trend
    const totalMessages = history.messages.sent + history.messages.failed;
    if (totalMessages > 10) {
      const errorRate = history.messages.failed / totalMessages;

      if (errorRate > 0.2) {
        risk = 'high';
        reason.push(`Error rate ${Math.round(errorRate * 100)}%`);
        confidence += 15;
      } else if (errorRate > 0.1) {
        if (risk === 'low') risk = 'medium';
        reason.push(`Error rate ${Math.round(errorRate * 100)}%`);
        confidence += 10;
      }
    }

    // Store prediction
    this.predictions[accountId] = {
      risk,
      reason: reason.length > 0 ? reason : ['No issues detected'],
      confidence: Math.min(100, confidence),
      timestamp: now,
    };

    // Alert if high risk
    if (risk === 'high' && confidence > 50) {
      console.warn(`🚨 High failure risk predicted [${accountId}]:`, reason.join(', '));
    }
  }

  /**
   * Get health score
   */
  getHealthScore(accountId) {
    return this.scores[accountId] || 100;
  }

  /**
   * Get prediction
   */
  getPrediction(accountId) {
    return (
      this.predictions[accountId] || {
        risk: 'low',
        reason: ['No data'],
        confidence: 0,
        timestamp: Date.now(),
      }
    );
  }

  /**
   * Get all health data
   */
  getHealthData(accountId) {
    this.initAccount(accountId);

    const history = this.history[accountId];
    const now = Date.now();
    const window = this.config.predictionWindow;

    return {
      score: this.scores[accountId] || 100,
      prediction: this.getPrediction(accountId),
      stats: {
        disconnects: history.disconnects.filter(time => now - time < window).length,
        errors: history.errors.filter(item => now - item.timestamp < window).length,
        messagesSent: history.messages.sent,
        messagesFailed: history.messages.failed,
        uptime: history.totalUptime,
        downtime: history.totalDowntime,
      },
      recentAnomalies: this.anomalies.filter(
        a => a.accountId === accountId && now - a.timestamp < window
      ),
    };
  }

  /**
   * Get all accounts health
   */
  getAllHealth() {
    const health = {};

    for (const accountId of Object.keys(this.history)) {
      health[accountId] = this.getHealthData(accountId);
    }

    return health;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      accounts: Object.keys(this.history).length,
      totalAnomalies: this.anomalies.length,
      highRiskAccounts: Object.values(this.predictions).filter(p => p.risk === 'high').length,
      mediumRiskAccounts: Object.values(this.predictions).filter(p => p.risk === 'medium').length,
      lowRiskAccounts: Object.values(this.predictions).filter(p => p.risk === 'low').length,
    };
  }

  /**
   * Cleanup
   */
  cleanup(accountId) {
    if (accountId) {
      delete this.history[accountId];
      delete this.scores[accountId];
      delete this.predictions[accountId];
      this.anomalies = this.anomalies.filter(a => a.accountId !== accountId);
    } else {
      this.history = {};
      this.scores = {};
      this.predictions = {};
      this.anomalies = [];
    }
  }
}

// Singleton instance
const advancedHealthChecker = new AdvancedHealthChecker();

module.exports = advancedHealthChecker;
