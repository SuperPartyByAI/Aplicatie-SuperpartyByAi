/**
 * AI PREDICTION SYSTEM
 * Prevede failures cu 2 ore înainte
 * Analizează pattern-uri și trend-uri
 */

class AIPrediction {
  constructor() {
    // Historical data pentru pattern recognition
    this.history = {
      memory: [],
      cpu: [],
      responseTime: [],
      errorRate: [],
      traffic: [],
    };

    // Prediction models
    this.models = {
      memory: { slope: 0, intercept: 0, confidence: 0 },
      cpu: { slope: 0, intercept: 0, confidence: 0 },
      traffic: { patterns: {}, confidence: 0 },
    };

    // Prediction thresholds
    this.thresholds = {
      memory: 90,
      cpu: 90,
      responseTime: 2000,
      errorRate: 5,
    };

    // Time windows
    this.windows = {
      shortTerm: 5 * 60 * 1000, // 5 min
      mediumTerm: 30 * 60 * 1000, // 30 min
      longTerm: 2 * 60 * 60 * 1000, // 2 hours
    };

    console.log('🔮 AI Prediction System initialized');
  }

  /**
   * Record metric data point
   */
  recordMetric(type, value, timestamp = Date.now()) {
    if (!this.history[type]) {
      this.history[type] = [];
    }

    this.history[type].push({ value, timestamp });

    // Keep only last 24 hours
    const cutoff = timestamp - 24 * 60 * 60 * 1000;
    this.history[type] = this.history[type].filter(d => d.timestamp > cutoff);

    // Update model if enough data
    if (this.history[type].length > 10) {
      this.updateModel(type);
    }
  }

  /**
   * Update prediction model using linear regression
   */
  updateModel(type) {
    const data = this.history[type];

    if (data.length < 2) return;

    // Get recent data (last 2 hours)
    const cutoff = Date.now() - this.windows.longTerm;
    const recentData = data.filter(d => d.timestamp > cutoff);

    if (recentData.length < 2) return;

    // Linear regression
    const n = recentData.length;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;

    recentData.forEach((point, i) => {
      const x = i;
      const y = point.value;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate confidence (R²)
    const yMean = sumY / n;
    let ssTotal = 0,
      ssResidual = 0;

    recentData.forEach((point, i) => {
      const predicted = slope * i + intercept;
      ssTotal += Math.pow(point.value - yMean, 2);
      ssResidual += Math.pow(point.value - predicted, 2);
    });

    const rSquared = 1 - ssResidual / ssTotal;
    const confidence = Math.max(0, Math.min(100, rSquared * 100));

    this.models[type] = { slope, intercept, confidence };
  }

  /**
   * Predict future value
   */
  predictValue(type, minutesAhead) {
    const model = this.models[type];

    if (!model || model.confidence < 50) {
      return null; // Not enough confidence
    }

    const data = this.history[type];
    if (data.length === 0) return null;

    // Predict based on linear trend
    const stepsAhead = minutesAhead / 5; // Assuming 5 min intervals
    const currentIndex = data.length - 1;
    const predictedValue = model.slope * (currentIndex + stepsAhead) + model.intercept;

    return {
      value: Math.max(0, predictedValue),
      confidence: model.confidence,
      trend: model.slope > 0 ? 'increasing' : 'decreasing',
    };
  }

  /**
   * Predict failures
   */
  async predictFailures(service, healthData) {
    const predictions = [];
    const now = Date.now();

    // Record current metrics
    if (healthData.memory) {
      this.recordMetric('memory', healthData.memory.percentage, now);
    }
    if (healthData.cpu) {
      this.recordMetric('cpu', healthData.cpu.usage, now);
    }
    if (healthData.responseTime) {
      this.recordMetric('responseTime', healthData.responseTime, now);
    }
    if (healthData.errorRate) {
      this.recordMetric('errorRate', healthData.errorRate, now);
    }

    // Predict memory issues
    const memoryPrediction = this.predictValue('memory', 120); // 2 hours
    if (memoryPrediction && memoryPrediction.value > this.thresholds.memory) {
      const timeToThreshold = this.calculateTimeToThreshold('memory', this.thresholds.memory);

      predictions.push({
        type: 'memory_leak',
        severity: 'high',
        confidence: memoryPrediction.confidence,
        timeToFailure: timeToThreshold,
        currentValue: healthData.memory?.percentage || 0,
        predictedValue: memoryPrediction.value,
        recommendation: 'Clear cache now to prevent memory leak',
        preventiveAction: 'clear_cache',
      });
    }

    // Predict CPU issues
    const cpuPrediction = this.predictValue('cpu', 120);
    if (cpuPrediction && cpuPrediction.value > this.thresholds.cpu) {
      const timeToThreshold = this.calculateTimeToThreshold('cpu', this.thresholds.cpu);

      predictions.push({
        type: 'cpu_overload',
        severity: 'high',
        confidence: cpuPrediction.confidence,
        timeToFailure: timeToThreshold,
        currentValue: healthData.cpu?.usage || 0,
        predictedValue: cpuPrediction.value,
        recommendation: 'Scale up or optimize code',
        preventiveAction: 'scale_up',
      });
    }

    // Predict response time degradation
    const rtPrediction = this.predictValue('responseTime', 120);
    if (rtPrediction && rtPrediction.value > this.thresholds.responseTime) {
      const timeToThreshold = this.calculateTimeToThreshold(
        'responseTime',
        this.thresholds.responseTime
      );

      predictions.push({
        type: 'performance_degradation',
        severity: 'medium',
        confidence: rtPrediction.confidence,
        timeToFailure: timeToThreshold,
        currentValue: healthData.responseTime || 0,
        predictedValue: rtPrediction.value,
        recommendation: 'Optimize database queries or add caching',
        preventiveAction: 'optimize_performance',
      });
    }

    // Detect traffic patterns
    const trafficPattern = this.detectTrafficPattern(now);
    if (trafficPattern) {
      predictions.push(trafficPattern);
    }

    return predictions;
  }

  /**
   * Calculate time until threshold is reached
   */
  calculateTimeToThreshold(type, threshold) {
    const model = this.models[type];
    const data = this.history[type];

    if (!model || !data || data.length === 0) return null;

    const currentValue = data[data.length - 1].value;

    if (model.slope <= 0) return null; // Not increasing

    // Calculate steps to threshold
    const currentIndex = data.length - 1;
    const stepsToThreshold =
      (threshold - model.intercept - model.slope * currentIndex) / model.slope;

    if (stepsToThreshold <= 0) return 0; // Already at threshold

    // Convert steps to minutes (assuming 5 min intervals)
    const minutesToThreshold = stepsToThreshold * 5;

    return Math.round(minutesToThreshold);
  }

  /**
   * Detect traffic patterns (e.g., Friday evening spike)
   */
  detectTrafficPattern(timestamp) {
    const date = new Date(timestamp);
    const hour = date.getHours();
    const dayOfWeek = date.getDay();

    // Friday evening (18:00-22:00)
    if (dayOfWeek === 5 && hour >= 18 && hour <= 22) {
      return {
        type: 'traffic_spike',
        severity: 'medium',
        confidence: 80,
        timeToFailure: 0,
        currentValue: 0,
        predictedValue: 0,
        recommendation: 'Scale up before traffic spike',
        preventiveAction: 'scale_up_preemptive',
        pattern: 'Friday evening spike',
      };
    }

    // Weekend traffic
    if (dayOfWeek === 6 || dayOfWeek === 0) {
      return {
        type: 'traffic_pattern',
        severity: 'low',
        confidence: 70,
        timeToFailure: 0,
        currentValue: 0,
        predictedValue: 0,
        recommendation: 'Monitor closely during weekend',
        preventiveAction: 'monitor',
        pattern: 'Weekend traffic',
      };
    }

    return null;
  }

  /**
   * Get prediction summary
   */
  getSummary() {
    const summary = {
      models: {},
      predictions: [],
      confidence: 0,
    };

    Object.keys(this.models).forEach(type => {
      const model = this.models[type];
      summary.models[type] = {
        trend: model.slope > 0 ? 'increasing' : 'decreasing',
        confidence: model.confidence.toFixed(1) + '%',
        dataPoints: this.history[type]?.length || 0,
      };
    });

    // Calculate overall confidence
    const confidences = Object.values(this.models).map(m => m.confidence);
    summary.confidence =
      confidences.length > 0
        ? (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(1) + '%'
        : '0%';

    return summary;
  }
}

module.exports = AIPrediction;
