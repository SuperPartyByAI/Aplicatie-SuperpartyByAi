/**
 * TELEGRAM ALERTS - PRODUCTION GRADE
 * 
 * Sends alerts for:
 * - Missed heartbeats (>3/hour)
 * - Consecutive probe fails (>2)
 * - Queue depth threshold (>100)
 * - Reconnect loop (>5 reconnects/hour)
 * - Insufficient data (coverage <80%)
 */

const https = require('https');

class TelegramAlerts {
  constructor(botToken, chatId) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.enabled = !!(botToken && chatId);
    
    // Alert throttling (prevent spam)
    this.lastAlerts = new Map(); // alertKey -> timestamp
    this.throttleMs = 3600000; // 1 hour
    
    if (this.enabled) {
      console.log('[TelegramAlerts] Enabled');
    } else {
      console.log('[TelegramAlerts] Disabled (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
    }
  }

  /**
   * Send Telegram message
   */
  async sendMessage(text, parseMode = 'Markdown') {
    if (!this.enabled) {
      console.log('[TelegramAlerts] Skipped (disabled):', text);
      return;
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const payload = JSON.stringify({
      chat_id: this.chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true
    });

    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('[TelegramAlerts] Message sent');
            resolve(JSON.parse(data));
          } else {
            console.error('[TelegramAlerts] Failed:', res.statusCode, data);
            reject(new Error(`Telegram API error: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('[TelegramAlerts] Request error:', error);
        reject(error);
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Check if alert should be throttled
   */
  shouldThrottle(alertKey) {
    const lastAlert = this.lastAlerts.get(alertKey);
    if (!lastAlert) return false;
    
    const elapsed = Date.now() - lastAlert;
    return elapsed < this.throttleMs;
  }

  /**
   * Mark alert as sent
   */
  markAlertSent(alertKey) {
    this.lastAlerts.set(alertKey, Date.now());
  }

  /**
   * Alert: Missed heartbeats
   */
  async alertMissedHeartbeats(missedCount, hourStart, hourEnd) {
    const alertKey = `missed_hb_${hourStart}`;
    
    if (this.shouldThrottle(alertKey)) {
      return;
    }

    const text = `🚨 *MISSED HEARTBEATS*\n\n` +
      `⏰ Period: ${new Date(hourStart).toISOString()} - ${new Date(hourEnd).toISOString()}\n` +
      `❌ Missed: ${missedCount} heartbeats\n` +
      `📊 Threshold: 3/hour\n\n` +
      `Action: Check service health and logs`;

    await this.sendMessage(text);
    this.markAlertSent(alertKey);
  }

  /**
   * Alert: Consecutive probe fails
   */
  async alertConsecutiveProbeFails(probeType, failCount, lastProbes) {
    const alertKey = `probe_fail_${probeType}_${Date.now()}`;
    
    if (this.shouldThrottle(alertKey)) {
      return;
    }

    const probeDetails = lastProbes.map(p => 
      `  - ${new Date(p.ts).toISOString()}: ${p.result} (${p.latencyMs}ms)`
    ).join('\n');

    const text = `🚨 *CONSECUTIVE PROBE FAILS*\n\n` +
      `🔍 Type: ${probeType}\n` +
      `❌ Consecutive fails: ${failCount}\n` +
      `📊 Threshold: 2\n\n` +
      `Recent probes:\n${probeDetails}\n\n` +
      `Action: Check ${probeType} functionality`;

    await this.sendMessage(text);
    this.markAlertSent(alertKey);
  }

  /**
   * Alert: Queue depth threshold
   */
  async alertQueueDepth(currentDepth, threshold) {
    const alertKey = `queue_depth_${Math.floor(Date.now() / this.throttleMs)}`;
    
    if (this.shouldThrottle(alertKey)) {
      return;
    }

    const text = `🚨 *QUEUE DEPTH THRESHOLD*\n\n` +
      `📊 Current depth: ${currentDepth}\n` +
      `⚠️ Threshold: ${threshold}\n` +
      `⏰ Time: ${new Date().toISOString()}\n\n` +
      `Action: Check message processing rate`;

    await this.sendMessage(text);
    this.markAlertSent(alertKey);
  }

  /**
   * Alert: Reconnect loop
   */
  async alertReconnectLoop(accountId, reconnectCount, hourStart, hourEnd) {
    const alertKey = `reconnect_loop_${accountId}_${hourStart}`;
    
    if (this.shouldThrottle(alertKey)) {
      return;
    }

    const text = `🚨 *RECONNECT LOOP DETECTED*\n\n` +
      `📱 Account: ${accountId}\n` +
      `🔄 Reconnects: ${reconnectCount}\n` +
      `📊 Threshold: 5/hour\n` +
      `⏰ Period: ${new Date(hourStart).toISOString()} - ${new Date(hourEnd).toISOString()}\n\n` +
      `Action: Check account credentials and network`;

    await this.sendMessage(text);
    this.markAlertSent(alertKey);
  }

  /**
   * Alert: Insufficient data
   */
  async alertInsufficientData(date, coverage, threshold) {
    const alertKey = `insufficient_data_${date}`;
    
    if (this.shouldThrottle(alertKey)) {
      return;
    }

    const text = `⚠️ *INSUFFICIENT DATA*\n\n` +
      `📅 Date: ${date}\n` +
      `📊 Coverage: ${(coverage * 100).toFixed(1)}%\n` +
      `⚠️ Threshold: ${(threshold * 100).toFixed(1)}%\n\n` +
      `Action: Check service uptime and heartbeat job`;

    await this.sendMessage(text);
    this.markAlertSent(alertKey);
  }

  /**
   * Alert: Daily summary
   */
  async sendDailySummary(date, stats) {
    const text = `📊 *DAILY SUMMARY: ${date}*\n\n` +
      `✅ Uptime: ${stats.uptimePct.toFixed(1)}%\n` +
      `📡 Heartbeats: ${stats.writtenHb}/${stats.expectedHb} (${stats.missedHb} missed)\n` +
      `🔍 Probes:\n` +
      `  - Outbound: ${stats.probePassRates.outbound.toFixed(1)}%\n` +
      `  - Inbound: ${stats.probePassRates.inbound.toFixed(1)}%\n` +
      `  - Queue: ${stats.probePassRates.queue.toFixed(1)}%\n` +
      `🚨 Incidents: ${stats.incidentsCount}\n` +
      `⏱️ MTTR: P50=${stats.mttrP50 || 'N/A'}s, P90=${stats.mttrP90 || 'N/A'}s, P95=${stats.mttrP95 || 'N/A'}s\n\n` +
      `${stats.insufficientData ? '⚠️ INSUFFICIENT DATA' : '✅ Data complete'}`;

    await this.sendMessage(text);
  }
}

module.exports = TelegramAlerts;
