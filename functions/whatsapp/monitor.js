// WhatsApp Monitor - Firestore instrumentation for status tracking and MTTR
const firestore = require('../firebase/firestore');

class WhatsAppMonitor {
  constructor() {
    this.db = null;
  }

  async initialize() {
    if (!firestore.db) {
      await firestore.initialize();
    }
    this.db = firestore.db;
  }

  /**
   * Update account status in Firestore
   */
  async updateAccountStatus(accountId, status, data = {}) {
    try {
      if (!this.db) await this.initialize();

      const now = new Date();
      const update = {
        accountId,
        status,
        updatedAt: now.toISOString(),
        ...data
      };

      // Calculate MTTR if reconnecting
      if (status === 'connected' && data.lastDisconnectedAt) {
        const disconnectedAt = new Date(data.lastDisconnectedAt);
        const mttrSeconds = Math.floor((now - disconnectedAt) / 1000);
        update.mttrLastSeconds = mttrSeconds;
        update.lastReconnectAt = now.toISOString();
        
        // Log incident
        await this.logIncident(accountId, 'reconnect', {
          mttrSeconds,
          previousStatus: 'disconnected'
        });
      }

      // Update lastConnectedAt/lastDisconnectedAt
      if (status === 'connected') {
        update.lastConnectedAt = now.toISOString();
      } else if (status === 'disconnected' || status === 'loggedOut') {
        update.lastDisconnectedAt = now.toISOString();
      }

      await this.db
        .collection('whatsapp_monitor')
        .doc('accounts')
        .collection('active')
        .doc(accountId)
        .set(update, { merge: true });

      console.log(`📊 [Monitor] Account ${accountId} status: ${status}`);
      return true;
    } catch (error) {
      console.error(`❌ [Monitor] Failed to update status:`, error.message);
      return false;
    }
  }

  /**
   * Log incident to Firestore
   */
  async logIncident(accountId, type, data = {}) {
    try {
      if (!this.db) await this.initialize();

      const incidentId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const incident = {
        accountId,
        type,
        ts: new Date().toISOString(),
        ...data
      };

      await this.db
        .collection('whatsapp_monitor')
        .doc('incidents')
        .collection('log')
        .doc(incidentId)
        .set(incident);

      console.log(`📝 [Monitor] Incident logged: ${type} for ${accountId}`);
      return incidentId;
    } catch (error) {
      console.error(`❌ [Monitor] Failed to log incident:`, error.message);
      return null;
    }
  }

  /**
   * Update heartbeat status
   */
  async updateHeartbeat(accountId, result, cid) {
    try {
      if (!this.db) await this.initialize();

      const update = {
        lastHeartbeatAt: new Date().toISOString(),
        lastHeartbeatResult: result,
        lastHeartbeatCid: cid
      };

      await this.db
        .collection('whatsapp_monitor')
        .doc('accounts')
        .collection('active')
        .doc(accountId)
        .set(update, { merge: true });

      if (result === 'fail') {
        await this.logIncident(accountId, 'heartbeat_fail', { cid });
      }

      console.log(`💓 [Monitor] Heartbeat ${result} for ${accountId} (${cid})`);
      return true;
    } catch (error) {
      console.error(`❌ [Monitor] Failed to update heartbeat:`, error.message);
      return false;
    }
  }

  /**
   * Get account status
   */
  async getAccountStatus(accountId) {
    try {
      if (!this.db) await this.initialize();

      const doc = await this.db
        .collection('whatsapp_monitor')
        .doc('accounts')
        .collection('active')
        .doc(accountId)
        .get();

      return doc.exists ? doc.data() : null;
    } catch (error) {
      console.error(`❌ [Monitor] Failed to get status:`, error.message);
      return null;
    }
  }

  /**
   * Get all incidents
   */
  async getIncidents(limit = 100) {
    try {
      if (!this.db) await this.initialize();

      const snapshot = await this.db
        .collection('whatsapp_monitor')
        .doc('incidents')
        .collection('log')
        .orderBy('ts', 'desc')
        .limit(limit)
        .get();

      const incidents = [];
      snapshot.forEach(doc => {
        incidents.push({ id: doc.id, ...doc.data() });
      });

      return incidents;
    } catch (error) {
      console.error(`❌ [Monitor] Failed to get incidents:`, error.message);
      return [];
    }
  }

  /**
   * Check for alerts (disconnected > 3 minutes or loggedOut)
   */
  async checkAlerts() {
    try {
      if (!this.db) await this.initialize();

      const snapshot = await this.db
        .collection('whatsapp_monitor')
        .doc('accounts')
        .collection('active')
        .get();

      const alerts = [];
      const now = new Date();

      snapshot.forEach(doc => {
        const account = doc.data();
        
        // Check disconnected > 3 minutes
        if (account.status === 'disconnected' && account.lastDisconnectedAt) {
          const disconnectedAt = new Date(account.lastDisconnectedAt);
          const minutesDisconnected = (now - disconnectedAt) / 1000 / 60;
          
          if (minutesDisconnected > 3) {
            alerts.push({
              accountId: account.accountId,
              type: 'disconnected_timeout',
              minutesDisconnected: Math.floor(minutesDisconnected),
              reason: account.disconnectReason || 'unknown'
            });
          }
        }
        
        // Check loggedOut
        if (account.status === 'loggedOut') {
          alerts.push({
            accountId: account.accountId,
            type: 'logged_out',
            reason: account.disconnectReason || 'needs_qr'
          });
        }
      });

      return alerts;
    } catch (error) {
      console.error(`❌ [Monitor] Failed to check alerts:`, error.message);
      return [];
    }
  }
}

module.exports = new WhatsAppMonitor();
