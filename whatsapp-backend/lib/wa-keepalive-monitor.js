/**
 * WA KEEPALIVE + STALE SOCKET DETECTION
 *
 * Monitors socket activity and detects stale connections.
 * Tracks last event and last message timestamps.
 * Forces reconnect if socket appears half-open.
 */

class WAKeepaliveMonitor {
  constructor() {
    this.lastEventAt = null;
    this.lastMessageAt = null;
    this.staleThresholdMs = 300000; // 5 minutes
    this.checkIntervalMs = 60000; // Check every 60s
    this.checkTimer = null;
    this.forceReconnectCallback = null;

    console.log('[WAKeepalive] Initialized');
  }

  /**
   * Start monitoring
   */
  start(forceReconnectCallback) {
    this.forceReconnectCallback = forceReconnectCallback;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    this.checkTimer = setInterval(() => {
      this.checkStaleSocket();
    }, this.checkIntervalMs);

    console.log('[WAKeepalive] Monitoring started');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    console.log('[WAKeepalive] Monitoring stopped');
  }

  /**
   * Record event activity
   */
  recordEvent(eventType) {
    this.lastEventAt = new Date().toISOString();

    if (eventType === 'messages.upsert' || eventType === 'message.update') {
      this.lastMessageAt = new Date().toISOString();
    }
  }

  /**
   * Check for stale socket
   */
  checkStaleSocket() {
    if (!this.lastEventAt) {
      // No events yet, skip check
      return;
    }

    const now = Date.now();
    const lastEventTime = new Date(this.lastEventAt).getTime();
    const timeSinceLastEvent = now - lastEventTime;

    if (timeSinceLastEvent > this.staleThresholdMs) {
      console.warn(
        `[WAKeepalive] ⚠️ Stale socket detected (${Math.round(timeSinceLastEvent / 1000)}s since last event)`
      );

      if (this.forceReconnectCallback) {
        console.log('[WAKeepalive] Forcing reconnect...');
        this.forceReconnectCallback('stale_socket');
      }
    }
  }

  /**
   * Get activity status
   */
  getStatus() {
    const now = Date.now();

    let timeSinceLastEvent = null;
    let timeSinceLastMessage = null;

    if (this.lastEventAt) {
      timeSinceLastEvent = now - new Date(this.lastEventAt).getTime();
    }

    if (this.lastMessageAt) {
      timeSinceLastMessage = now - new Date(this.lastMessageAt).getTime();
    }

    return {
      lastEventAt: this.lastEventAt,
      lastMessageAt: this.lastMessageAt,
      timeSinceLastEventMs: timeSinceLastEvent,
      timeSinceLastMessageMs: timeSinceLastMessage,
      isStale: timeSinceLastEvent !== null && timeSinceLastEvent > this.staleThresholdMs,
    };
  }

  /**
   * Reset activity tracking
   */
  reset() {
    this.lastEventAt = null;
    this.lastMessageAt = null;
  }

  /**
   * Get Baileys socket config with keepalive settings (FAST FAIL)
   */
  static getBaileysConfig() {
    return {
      keepAliveIntervalMs: 25000, // Send keepalive every 25s
      connectTimeoutMs: 15000, // 15s connection timeout (FAST FAIL)
      defaultQueryTimeoutMs: 30000, // 30s query timeout
      qrTimeout: 60000, // 60s QR timeout
      retryRequestDelayMs: 250, // Retry delay
    };
  }
}

module.exports = WAKeepaliveMonitor;
