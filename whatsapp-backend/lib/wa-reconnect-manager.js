/**
 * WA RECONNECT STATE MACHINE
 * 
 * Manages reconnection with exponential backoff + jitter.
 * Handles different disconnect reasons deterministically.
 * 
 * States: CONNECTED, DISCONNECTED, NEEDS_PAIRING
 * Backoff delays: 1s, 2s, 4s, 8s, 16s, 32s, 60s (cap)
 */

const { DisconnectReason } = require('@whiskeysockets/baileys');
const { FieldValue } = require('firebase-admin/firestore');

class WAReconnectManager {
  constructor(db, instanceId) {
    this.db = db;
    this.instanceId = instanceId;
    this.statePath = 'wa_metrics/longrun/state/wa_connection';
    
    // State
    this.waStatus = 'DISCONNECTED';
    this.connectedAt = null;
    this.lastDisconnectAt = null;
    this.lastDisconnectReason = null;
    this.retryCount = 0;
    this.nextRetryAt = null;
    this.reconnectTimer = null;
    
    // Backoff configuration
    this.backoffDelays = [1000, 2000, 4000, 8000, 16000, 32000, 60000]; // ms
    this.maxDelay = 60000; // 60s cap
    
    console.log('[WAReconnect] Initialized');
  }

  /**
   * Handle connection open
   */
  async handleConnected() {
    this.waStatus = 'CONNECTED';
    this.connectedAt = new Date().toISOString();
    this.retryCount = 0;
    this.nextRetryAt = null;
    this.lastDisconnectReason = null;
    
    this.cancelReconnectTimer();
    
    await this.saveState();
    
    console.log('[WAReconnect] ✅ CONNECTED');
  }

  /**
   * Handle connection close
   */
  async handleDisconnected(reason, error) {
    this.lastDisconnectAt = new Date().toISOString();
    this.lastDisconnectReason = this.parseDisconnectReason(reason);
    
    console.log(`[WAReconnect] ❌ DISCONNECTED - reason: ${this.lastDisconnectReason}`);
    
    // Check if logged out
    if (this.isLoggedOut(reason)) {
      this.waStatus = 'NEEDS_PAIRING';
      this.cancelReconnectTimer();
      
      await this.saveState();
      await this.createLoggedOutIncident();
      
      console.log('[WAReconnect] ⚠️ NEEDS_PAIRING - auto-reconnect stopped');
      return { shouldReconnect: false, reason: 'logged_out' };
    }
    
    // Schedule reconnect with backoff
    this.waStatus = 'DISCONNECTED';
    this.retryCount++;
    
    const delay = this.calculateBackoffDelay();
    this.nextRetryAt = new Date(Date.now() + delay).toISOString();
    
    await this.saveState();
    
    console.log(`[WAReconnect] Scheduling reconnect #${this.retryCount} in ${delay}ms`);
    
    return { shouldReconnect: true, delay };
  }

  /**
   * Calculate backoff delay with jitter (0..250ms)
   */
  calculateBackoffDelay() {
    const index = Math.min(this.retryCount - 1, this.backoffDelays.length - 1);
    const baseDelay = this.backoffDelays[index];
    
    // Add jitter 0..250ms
    const jitter = Math.floor(Math.random() * 251);
    const delay = Math.min(baseDelay + jitter, this.maxDelay);
    
    const delaySec = (delay / 1000).toFixed(1);
    console.log(`[WAReconnect] reconnect_scheduled_backoff_sec=${delaySec}`);
    
    return Math.round(delay);
  }

  /**
   * Schedule reconnect
   */
  scheduleReconnect(reconnectFn, delay) {
    this.cancelReconnectTimer();
    
    this.reconnectTimer = setTimeout(async () => {
      console.log(`[WAReconnect] Executing reconnect attempt #${this.retryCount}`);
      try {
        await reconnectFn();
      } catch (error) {
        console.error('[WAReconnect] Reconnect function error:', error);
      }
    }, delay);
  }

  /**
   * Cancel reconnect timer
   */
  cancelReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Parse disconnect reason
   */
  parseDisconnectReason(reason) {
    const reasons = {
      [DisconnectReason.badSession]: 'bad_session',
      [DisconnectReason.connectionClosed]: 'connection_closed',
      [DisconnectReason.connectionLost]: 'connection_lost',
      [DisconnectReason.connectionReplaced]: 'connection_replaced',
      [DisconnectReason.loggedOut]: 'logged_out',
      [DisconnectReason.restartRequired]: 'restart_required',
      [DisconnectReason.timedOut]: 'timed_out',
      [DisconnectReason.multideviceMismatch]: 'multidevice_mismatch'
    };
    
    return reasons[reason] || `unknown_${reason}`;
  }

  /**
   * Check if disconnect reason is logged out
   */
  isLoggedOut(reason) {
    return reason === DisconnectReason.loggedOut;
  }

  /**
   * Save state to Firestore
   */
  async saveState() {
    try {
      await this.db.doc(this.statePath).set({
        instanceId: this.instanceId,
        waStatus: this.waStatus,
        connectedAt: this.connectedAt,
        lastDisconnectAt: this.lastDisconnectAt,
        lastDisconnectReason: this.lastDisconnectReason,
        retryCount: this.retryCount,
        nextRetryAt: this.nextRetryAt,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('[WAReconnect] Error saving state:', error);
    }
  }

  /**
   * Create logged out incident
   */
  async createLoggedOutIncident() {
    try {
      const incidentId = `wa_logged_out_${Date.now()}`;
      
      await this.db.doc(`wa_metrics/longrun/incidents/${incidentId}`).set({
        type: 'wa_logged_out_requires_pairing',
        detectedAt: FieldValue.serverTimestamp(),
        instanceId: this.instanceId,
        lastDisconnectReason: this.lastDisconnectReason,
        retryCount: this.retryCount,
        active: true,
        instructions: 'WhatsApp logged out. QR code pairing required. Check /api/whatsapp/qr endpoint.',
        runbook: {
          step1: 'Check QR code at /api/whatsapp/qr endpoint',
          step2: 'Scan QR code with WhatsApp mobile app',
          step3: 'Wait for connection to establish',
          step4: 'Verify status at /api/longrun/status-now'
        }
      });
      
      console.log(`[WAReconnect] Created incident: ${incidentId}`);
    } catch (error) {
      console.error('[WAReconnect] Error creating incident:', error);
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      waStatus: this.waStatus,
      connectedAt: this.connectedAt,
      lastDisconnectAt: this.lastDisconnectAt,
      lastDisconnectReason: this.lastDisconnectReason,
      retryCount: this.retryCount,
      nextRetryAt: this.nextRetryAt
    };
  }

  /**
   * Reset retry count (for manual reconnect)
   */
  resetRetryCount() {
    this.retryCount = 0;
    this.nextRetryAt = null;
  }

  /**
   * Check if in reconnect loop (>10 retries in 10 minutes)
   */
  isInReconnectLoop() {
    if (this.retryCount < 10) {
      return false;
    }
    
    // Check if first disconnect was within last 10 minutes
    if (this.lastDisconnectAt) {
      const disconnectTime = new Date(this.lastDisconnectAt).getTime();
      const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
      
      return disconnectTime > tenMinutesAgo;
    }
    
    return false;
  }

  /**
   * Get retry count
   */
  getRetryCount() {
    return this.retryCount;
  }
}

module.exports = WAReconnectManager;
