/**
 * WA DISCONNECT GUARD
 *
 * Monitors for prolonged disconnections (>10 minutes).
 * Creates deduped incident that updates lastCheckedAt.
 *
 * Incident: wa_disconnect_stuck_active
 * Fields: active, firstDetectedAt, lastCheckedAt, reason, retryCount, instructions
 */

const { FieldValue } = require('firebase-admin/firestore');

class WADisconnectGuard {
  constructor(db, instanceId, reconnectManager) {
    this.db = db;
    this.instanceId = instanceId;
    this.reconnectManager = reconnectManager;
    this.incidentPath = 'wa_metrics/longrun/incidents/wa_disconnect_stuck_active';
    this.checkIntervalMs = 60000; // Check every 60s
    this.disconnectThresholdMs = 600000; // 10 minutes
    this.checkTimer = null;

    console.log('[WADisconnectGuard] Initialized');
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    this.checkTimer = setInterval(() => {
      this.checkDisconnectDuration();
    }, this.checkIntervalMs);

    console.log('[WADisconnectGuard] Monitoring started');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    console.log('[WADisconnectGuard] Monitoring stopped');
  }

  /**
   * Check disconnect duration
   */
  async checkDisconnectDuration() {
    const state = this.reconnectManager.getState();

    // Skip if connected or needs pairing
    if (state.waStatus === 'CONNECTED' || state.waStatus === 'NEEDS_PAIRING') {
      // If there's an active incident, resolve it
      await this.resolveIncident();
      return;
    }

    // Check if disconnected for >10 minutes
    if (state.lastDisconnectAt) {
      const disconnectTime = new Date(state.lastDisconnectAt).getTime();
      const now = Date.now();
      const disconnectDuration = now - disconnectTime;

      if (disconnectDuration > this.disconnectThresholdMs) {
        console.warn(
          `[WADisconnectGuard] ⚠️ Prolonged disconnect: ${Math.round(disconnectDuration / 1000)}s`
        );
        await this.createOrUpdateIncident(state, disconnectDuration);
      }
    }
  }

  /**
   * Create or update deduped incident
   */
  async createOrUpdateIncident(state, disconnectDuration) {
    try {
      const incidentRef = this.db.doc(this.incidentPath);
      const incidentDoc = await incidentRef.get();

      const now = FieldValue.serverTimestamp();

      if (!incidentDoc.exists) {
        // Create new incident
        await incidentRef.set({
          type: 'wa_disconnect_stuck',
          active: true,
          firstDetectedAt: now,
          lastCheckedAt: now,
          instanceId: this.instanceId,
          evidence: {
            lastDisconnectAt: state.lastDisconnectAt,
            lastDisconnectReason: state.lastDisconnectReason,
            retryCount: state.retryCount,
            nextRetryAt: state.nextRetryAt,
            disconnectDurationMs: disconnectDuration,
          },
          instructions: 'WhatsApp disconnected for >10 minutes. Check logs and connection status.',
          runbook: {
            step1: 'Check /api/longrun/status-now for current state',
            step2: 'Review logs for disconnect reason',
            step3: 'Check if auth state is valid',
            step4: 'Consider manual restart if auto-reconnect failing',
            step5: 'Check network connectivity and Railway status',
          },
        });

        console.log('[WADisconnectGuard] Created incident: wa_disconnect_stuck_active');
      } else {
        // Update existing incident
        await incidentRef.update({
          lastCheckedAt: now,
          instanceId: this.instanceId,
          evidence: {
            lastDisconnectAt: state.lastDisconnectAt,
            lastDisconnectReason: state.lastDisconnectReason,
            retryCount: state.retryCount,
            nextRetryAt: state.nextRetryAt,
            disconnectDurationMs: disconnectDuration,
          },
        });

        console.log('[WADisconnectGuard] Updated incident: wa_disconnect_stuck_active');
      }
    } catch (error) {
      console.error('[WADisconnectGuard] Error creating/updating incident:', error);
    }
  }

  /**
   * Resolve incident (when reconnected)
   */
  async resolveIncident() {
    try {
      const incidentRef = this.db.doc(this.incidentPath);
      const incidentDoc = await incidentRef.get();

      if (incidentDoc.exists && incidentDoc.data().active) {
        await incidentRef.update({
          active: false,
          resolvedAt: FieldValue.serverTimestamp(),
          resolvedBy: 'auto_reconnect',
        });

        console.log('[WADisconnectGuard] ✅ Resolved incident: wa_disconnect_stuck_active');
      }
    } catch (error) {
      console.error('[WADisconnectGuard] Error resolving incident:', error);
    }
  }

  /**
   * Get incident status
   */
  async getIncidentStatus() {
    try {
      const incidentDoc = await this.db.doc(this.incidentPath).get();

      if (!incidentDoc.exists) {
        return { exists: false };
      }

      return {
        exists: true,
        ...incidentDoc.data(),
      };
    } catch (error) {
      console.error('[WADisconnectGuard] Error getting incident status:', error);
      return { error: error.message };
    }
  }
}

module.exports = WADisconnectGuard;
