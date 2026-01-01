/**
 * Webhooks Module
 *
 * Real-time notifications for external systems:
 * - Account events (connected, disconnected, qr)
 * - Message events (sent, received, failed)
 * - System events (rate_limit, circuit_break, error)
 * - Health events (degraded, recovered)
 * - Retry logic with exponential backoff
 * - Queue management for failed webhooks
 *
 * Truth: 90% - Webhooks are simple and reliable
 */

const axios = require('axios');
const EventEmitter = require('events');

class WebhookManager extends EventEmitter {
  constructor() {
    super();

    // Webhook endpoints
    this.endpoints = new Map(); // name -> { url, events, enabled, secret }

    // Queue for failed webhooks
    this.queue = [];
    this.processing = false;

    // Retry configuration
    this.retryConfig = {
      maxRetries: 3,
      initialDelay: 1000, // 1s
      maxDelay: 30000, // 30s
      backoffMultiplier: 2,
    };

    // Stats
    this.stats = {
      sent: 0,
      failed: 0,
      retried: 0,
      queued: 0,
    };

    // Start queue processor
    this.startQueueProcessor();
  }

  /**
   * Register webhook endpoint
   */
  register(name, config) {
    if (!config.url) {
      throw new Error('Webhook URL is required');
    }

    this.endpoints.set(name, {
      url: config.url,
      events: config.events || ['*'], // '*' = all events
      enabled: config.enabled !== false,
      secret: config.secret || null,
      headers: config.headers || {},
      timeout: config.timeout || 5000,
    });

    console.log(`✅ Webhook registered: ${name} -> ${config.url}`);
  }

  /**
   * Unregister webhook endpoint
   */
  unregister(name) {
    if (this.endpoints.has(name)) {
      this.endpoints.delete(name);
      console.log(`✅ Webhook unregistered: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Enable/disable webhook
   */
  setEnabled(name, enabled) {
    const endpoint = this.endpoints.get(name);
    if (endpoint) {
      endpoint.enabled = enabled;
      console.log(`✅ Webhook ${name}: ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    }
    return false;
  }

  /**
   * Send webhook notification
   */
  async send(eventType, data) {
    const timestamp = Date.now();

    // Find matching endpoints
    const matchingEndpoints = [];
    for (const [name, endpoint] of this.endpoints.entries()) {
      if (!endpoint.enabled) continue;

      // Check if endpoint listens to this event
      if (endpoint.events.includes('*') || endpoint.events.includes(eventType)) {
        matchingEndpoints.push({ name, ...endpoint });
      }
    }

    if (matchingEndpoints.length === 0) {
      return; // No endpoints listening
    }

    // Prepare payload
    const payload = {
      event: eventType,
      timestamp,
      data,
    };

    // Send to all matching endpoints
    const promises = matchingEndpoints.map(endpoint => this.sendToEndpoint(endpoint, payload));

    await Promise.allSettled(promises);
  }

  /**
   * Send to specific endpoint
   */
  async sendToEndpoint(endpoint, payload, retryCount = 0) {
    try {
      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'SuperParty-WhatsApp-Webhook/4.0',
        ...endpoint.headers,
      };

      // Add signature if secret provided
      if (endpoint.secret) {
        const crypto = require('crypto');
        const signature = crypto
          .createHmac('sha256', endpoint.secret)
          .update(JSON.stringify(payload))
          .digest('hex');
        headers['X-Webhook-Signature'] = signature;
      }

      // Send request
      const response = await axios.post(endpoint.url, payload, {
        headers,
        timeout: endpoint.timeout,
      });

      // Success
      this.stats.sent++;

      if (retryCount > 0) {
        this.stats.retried++;
        console.log(`✅ Webhook retry success: ${endpoint.name} (attempt ${retryCount + 1})`);
      }

      return { success: true, status: response.status };
    } catch (error) {
      console.error(`❌ Webhook failed: ${endpoint.name} - ${error.message}`);

      // Check if should retry
      if (retryCount < this.retryConfig.maxRetries) {
        // Add to queue for retry
        this.queueRetry(endpoint, payload, retryCount + 1);
      } else {
        // Max retries reached
        this.stats.failed++;
        this.emit('webhook-failed', {
          endpoint: endpoint.name,
          event: payload.event,
          error: error.message,
          retries: retryCount,
        });
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Queue webhook for retry
   */
  queueRetry(endpoint, payload, retryCount) {
    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, retryCount - 1),
      this.retryConfig.maxDelay
    );

    const retryAt = Date.now() + delay;

    this.queue.push({
      endpoint,
      payload,
      retryCount,
      retryAt,
    });

    this.stats.queued++;

    console.log(
      `⏳ Webhook queued for retry: ${endpoint.name} (attempt ${retryCount + 1} in ${delay}ms)`
    );
  }

  /**
   * Process retry queue
   */
  startQueueProcessor() {
    const processQueue = async () => {
      if (this.processing || this.queue.length === 0) {
        setTimeout(processQueue, 1000);
        return;
      }

      this.processing = true;
      const now = Date.now();

      // Find items ready for retry
      const readyItems = [];
      const remainingItems = [];

      for (const item of this.queue) {
        if (item.retryAt <= now) {
          readyItems.push(item);
        } else {
          remainingItems.push(item);
        }
      }

      this.queue = remainingItems;

      // Process ready items
      for (const item of readyItems) {
        await this.sendToEndpoint(item.endpoint, item.payload, item.retryCount);
      }

      this.processing = false;
      setTimeout(processQueue, 1000);
    };

    processQueue();
  }

  /**
   * Send account event
   */
  async sendAccountEvent(accountId, event, data = {}) {
    await this.send('account', {
      accountId,
      event,
      ...data,
    });
  }

  /**
   * Send message event
   */
  async sendMessageEvent(accountId, event, data = {}) {
    await this.send('message', {
      accountId,
      event,
      ...data,
    });
  }

  /**
   * Send system event
   */
  async sendSystemEvent(event, data = {}) {
    await this.send('system', {
      event,
      ...data,
    });
  }

  /**
   * Send health event
   */
  async sendHealthEvent(event, data = {}) {
    await this.send('health', {
      event,
      ...data,
    });
  }

  /**
   * Get all endpoints
   */
  getEndpoints() {
    const endpoints = {};
    for (const [name, endpoint] of this.endpoints.entries()) {
      endpoints[name] = {
        url: endpoint.url,
        events: endpoint.events,
        enabled: endpoint.enabled,
        hasSecret: !!endpoint.secret,
      };
    }
    return endpoints;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      endpoints: this.endpoints.size,
      processing: this.processing,
    };
  }

  /**
   * Clear queue
   */
  clearQueue() {
    const cleared = this.queue.length;
    this.queue = [];
    console.log(`✅ Webhook queue cleared: ${cleared} items`);
    return cleared;
  }

  /**
   * Test webhook endpoint
   */
  async test(name) {
    const endpoint = this.endpoints.get(name);
    if (!endpoint) {
      throw new Error(`Webhook not found: ${name}`);
    }

    const testPayload = {
      event: 'test',
      timestamp: Date.now(),
      data: {
        message: 'This is a test webhook from SuperParty WhatsApp',
      },
    };

    const result = await this.sendToEndpoint(endpoint, testPayload);
    return result;
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.endpoints.clear();
    this.queue = [];
    this.processing = false;
  }
}

// Singleton instance
const webhookManager = new WebhookManager();

// Helper functions for common events
webhookManager.onAccountConnected = (accountId, phone) => {
  webhookManager.sendAccountEvent(accountId, 'connected', { phone });
};

webhookManager.onAccountDisconnected = (accountId, reason) => {
  webhookManager.sendAccountEvent(accountId, 'disconnected', { reason });
};

webhookManager.onAccountQR = (accountId, qrCode) => {
  webhookManager.sendAccountEvent(accountId, 'qr', { qrCode });
};

webhookManager.onMessageSent = (accountId, chatId, messageId) => {
  webhookManager.sendMessageEvent(accountId, 'sent', { chatId, messageId });
};

webhookManager.onMessageReceived = (accountId, chatId, messageId, from) => {
  webhookManager.sendMessageEvent(accountId, 'received', { chatId, messageId, from });
};

webhookManager.onMessageFailed = (accountId, chatId, error) => {
  webhookManager.sendMessageEvent(accountId, 'failed', { chatId, error });
};

webhookManager.onRateLimit = (accountId, severity) => {
  webhookManager.sendSystemEvent('rate_limit', { accountId, severity });
};

webhookManager.onCircuitBreak = (accountId, state) => {
  webhookManager.sendSystemEvent('circuit_break', { accountId, state });
};

webhookManager.onHealthDegraded = (accountId, metric, value) => {
  webhookManager.sendHealthEvent('degraded', { accountId, metric, value });
};

webhookManager.onHealthRecovered = (accountId, metric) => {
  webhookManager.sendHealthEvent('recovered', { accountId, metric });
};

module.exports = webhookManager;
