/**
 * WA AUTO-HEAL
 *
 * Detects reconnect loops and triggers controlled restart.
 * Threshold: >=10 retries in 10 minutes (and not logged out)
 *
 * Actions:
 * 1. Create incident with evidence
 * 2. Release lock
 * 3. Exit process (Railway restarts)
 */

const { FieldValue } = require('firebase-admin/firestore');

class WAAutoHeal {
  constructor(db, instanceId, reconnectManager, lockManager) {
    this.db = db;
    this.instanceId = instanceId;
    this.reconnectManager = reconnectManager;
    this.lockManager = lockManager;
    this.checkIntervalMs = 60000; // Check every 60s
    this.checkTimer = null;

    console.log('[WAAutoHeal] Initialized');
  }

  /**
   * Start monitoring for reconnect loops
   */
  start() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    this.checkTimer = setInterval(() => {
      this.checkReconnectLoop();
    }, this.checkIntervalMs);

    console.log('[WAAutoHeal] Monitoring started');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    console.log('[WAAutoHeal] Monitoring stopped');
  }

  /**
   * Check for reconnect loop
   */
  async checkReconnectLoop() {
    const state = this.reconnectManager.getState();

    // Skip if connected or needs pairing
    if (state.waStatus === 'CONNECTED' || state.waStatus === 'NEEDS_PAIRING') {
      return;
    }

    // Check if in reconnect loop
    if (this.reconnectManager.isInReconnectLoop()) {
      console.error('[WAAutoHeal] 🚨 RECONNECT LOOP DETECTED');
      console.error(`[WAAutoHeal] Retry count: ${state.retryCount}`);
      console.error(`[WAAutoHeal] Last disconnect: ${state.lastDisconnectAt}`);
      console.error(`[WAAutoHeal] Reason: ${state.lastDisconnectReason}`);

      await this.triggerAutoHeal(state);
    }
  }

  /**
   * Trigger auto-heal (create incident + restart)
   */
  async triggerAutoHeal(state) {
    try {
      // Create incident
      const incidentId = `wa_reconnect_loop_${Date.now()}`;

      await this.db.doc(`wa_metrics/longrun/incidents/${incidentId}`).set({
        type: 'wa_reconnect_loop',
        detectedAt: FieldValue.serverTimestamp(),
        instanceId: this.instanceId,
        evidence: {
          retryCount: state.retryCount,
          lastDisconnectAt: state.lastDisconnectAt,
          lastDisconnectReason: state.lastDisconnectReason,
          nextRetryAt: state.nextRetryAt,
          connectedAt: state.connectedAt,
        },
        active: true,
        instructions: 'Reconnect loop detected. Process will restart automatically.',
        runbook: {
          step1: 'Railway will restart the process automatically',
          step2: 'Check logs after restart for connection status',
          step3: 'If issue persists, check auth state and network',
          step4: 'Consider manual intervention if >3 restarts in 1 hour',
        },
      });

      console.log(`[WAAutoHeal] Created incident: ${incidentId}`);

      // Release lock
      console.log('[WAAutoHeal] Releasing lock...');
      await this.lockManager.release();

      // Wait a bit for Firestore writes to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Exit process (Railway will restart)
      console.log('[WAAutoHeal] 🔄 Exiting process for controlled restart...');
      process.exit(1);
    } catch (error) {
      console.error('[WAAutoHeal] Error during auto-heal:', error);
      // Still exit even if incident creation fails
      process.exit(1);
    }
  }

  /**
   * Manual trigger (for testing)
   */
  async manualTrigger(reason = 'manual_trigger') {
    const state = this.reconnectManager.getState();
    state.lastDisconnectReason = reason;

    console.log('[WAAutoHeal] Manual trigger initiated');
    await this.triggerAutoHeal(state);
  }
}

module.exports = WAAutoHeal;
