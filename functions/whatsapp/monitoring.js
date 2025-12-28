/**
 * TIER 3: Monitoring & Alerting System
 * Tracks metrics, generates reports, sends alerts
 */

const firestore = require('../firebase/firestore');

class MonitoringService {
  constructor(whatsappManager) {
    this.manager = whatsappManager;
    this.alertThresholds = {
      disconnectsPerHour: 10,
      messageLossRate: 0.01, // 1%
      rateLimitsPerHour: 5,
      reconnectFailRate: 0.2 // 20%
    };
    
    this.hourlyMetrics = {
      disconnects: 0,
      reconnects: 0,
      reconnectFails: 0,
      messageLoss: 0,
      rateLimits: 0,
      messagesProcessed: 0
    };
    
    this.startMonitoring();
  }

  /**
   * Start monitoring
   */
  startMonitoring() {
    // Reset hourly metrics every hour
    setInterval(() => {
      this.checkThresholds();
      this.resetHourlyMetrics();
    }, 3600000); // 1 hour

    // Generate daily report at midnight
    this.scheduleDailyReport();
  }

  /**
   * Log event
   */
  async logEvent(type, data) {
    try {
      await firestore.logEvent({
        type,
        data,
        timestamp: Date.now()
      });

      // Update hourly metrics
      this.updateHourlyMetrics(type);
    } catch (error) {
      console.error('❌ Failed to log event:', error.message);
    }
  }

  /**
   * Update hourly metrics
   */
  updateHourlyMetrics(type) {
    switch (type) {
      case 'disconnect':
        this.hourlyMetrics.disconnects++;
        break;
      case 'reconnect_success':
        this.hourlyMetrics.reconnects++;
        break;
      case 'reconnect_fail':
        this.hourlyMetrics.reconnectFails++;
        break;
      case 'message_lost':
        this.hourlyMetrics.messageLoss++;
        break;
      case 'rate_limit_detected':
        this.hourlyMetrics.rateLimits++;
        break;
      case 'message_saved':
        this.hourlyMetrics.messagesProcessed++;
        break;
    }
  }

  /**
   * Check thresholds and send alerts
   */
  async checkThresholds() {
    const alerts = [];

    // Check disconnects
    if (this.hourlyMetrics.disconnects > this.alertThresholds.disconnectsPerHour) {
      alerts.push({
        level: 'warning',
        message: `⚠️ High disconnect rate: ${this.hourlyMetrics.disconnects} disconnects in last hour (threshold: ${this.alertThresholds.disconnectsPerHour})`
      });
    }

    // Check message loss
    const messageLossRate = this.hourlyMetrics.messagesProcessed > 0
      ? this.hourlyMetrics.messageLoss / this.hourlyMetrics.messagesProcessed
      : 0;
    
    if (messageLossRate > this.alertThresholds.messageLossRate) {
      alerts.push({
        level: 'critical',
        message: `🚨 High message loss rate: ${(messageLossRate * 100).toFixed(2)}% (threshold: ${(this.alertThresholds.messageLossRate * 100).toFixed(2)}%)`
      });
    }

    // Check rate limits
    if (this.hourlyMetrics.rateLimits > this.alertThresholds.rateLimitsPerHour) {
      alerts.push({
        level: 'warning',
        message: `⚠️ High rate limit hits: ${this.hourlyMetrics.rateLimits} in last hour (threshold: ${this.alertThresholds.rateLimitsPerHour})`
      });
    }

    // Check reconnect fail rate
    const totalReconnects = this.hourlyMetrics.reconnects + this.hourlyMetrics.reconnectFails;
    const reconnectFailRate = totalReconnects > 0
      ? this.hourlyMetrics.reconnectFails / totalReconnects
      : 0;
    
    if (reconnectFailRate > this.alertThresholds.reconnectFailRate) {
      alerts.push({
        level: 'critical',
        message: `🚨 High reconnect fail rate: ${(reconnectFailRate * 100).toFixed(2)}% (threshold: ${(this.alertThresholds.reconnectFailRate * 100).toFixed(2)}%)`
      });
    }

    // Send alerts
    for (const alert of alerts) {
      await this.sendAlert(alert);
    }
  }

  /**
   * Send alert
   */
  async sendAlert(alert) {
    console.error(`🚨 ALERT [${alert.level}]:`, alert.message);
    
    // Log to Firestore
    await firestore.logEvent({
      type: 'alert',
      data: alert,
      timestamp: Date.now()
    });

    // TODO: Send email/SMS/Slack notification
    // For now, just console log
  }

  /**
   * Reset hourly metrics
   */
  resetHourlyMetrics() {
    this.hourlyMetrics = {
      disconnects: 0,
      reconnects: 0,
      reconnectFails: 0,
      messageLoss: 0,
      rateLimits: 0,
      messagesProcessed: 0
    };
  }

  /**
   * Schedule daily report
   */
  scheduleDailyReport() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow - now;
    
    setTimeout(() => {
      this.generateDailyReport();
      // Schedule next report
      setInterval(() => {
        this.generateDailyReport();
      }, 86400000); // 24 hours
    }, msUntilMidnight);
  }

  /**
   * Generate daily report
   */
  async generateDailyReport() {
    try {
      const report = await this.manager.generateDailyReport();
      
      console.log('📊 Daily Report Generated:', report);
      
      // Log to Firestore
      await firestore.logEvent({
        type: 'daily_report',
        data: report,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('❌ Failed to generate daily report:', error.message);
    }
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    return {
      hourly: this.hourlyMetrics,
      total: this.manager.metrics,
      accounts: this.manager.accounts.size,
      activeConnections: this.manager.clients.size,
      backupConnections: this.manager.backupClients.size,
      queueSize: this.manager.messageQueue.length,
      batchSize: this.manager.messageBatch.length
    };
  }
}

module.exports = MonitoringService;
