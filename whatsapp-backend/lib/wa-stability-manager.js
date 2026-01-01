/**
 * WA STABILITY MANAGER
 *
 * Integrates all WA connection stability components:
 * - Distributed lock (single-instance)
 * - Firestore auth state
 * - Reconnect state machine
 * - Keepalive monitoring
 * - Auto-heal
 * - Disconnect guard
 */

const WAConnectionLock = require('./wa-connection-lock');
const FirestoreAuthState = require('./wa-firestore-auth');
const WAReconnectManager = require('./wa-reconnect-manager');
const WAKeepaliveMonitor = require('./wa-keepalive-monitor');
const WAAutoHeal = require('./wa-auto-heal');
const WADisconnectGuard = require('./wa-disconnect-guard');

class WAStabilityManager {
  constructor(db, instanceId) {
    this.db = db;
    this.instanceId = instanceId;

    // Initialize components
    this.lock = new WAConnectionLock(db, instanceId);
    this.authState = new FirestoreAuthState(db);
    this.reconnectManager = new WAReconnectManager(db, instanceId);
    this.keepalive = new WAKeepaliveMonitor();
    this.autoHeal = new WAAutoHeal(db, instanceId, this.reconnectManager, this.lock);
    this.disconnectGuard = new WADisconnectGuard(db, instanceId, this.reconnectManager);

    this.waMode = 'passive'; // active or passive
    this.sock = null;

    console.log('[WAStability] Initialized');
  }

  /**
   * Try to acquire lock and start in active mode
   */
  async tryActivate() {
    const result = await this.lock.tryAcquire();

    if (result.acquired) {
      this.waMode = 'active';
      console.log('[WAStability] ✅ ACTIVE MODE - can start WA connection');
      return true;
    } else {
      this.waMode = 'passive';
      console.log('[WAStability] ⚠️ PASSIVE MODE - lock not acquired');
      return false;
    }
  }

  /**
   * Start monitoring (after connection established)
   */
  startMonitoring(sock) {
    this.sock = sock;

    // Start keepalive monitoring
    this.keepalive.start(async reason => {
      console.log(`[WAStability] Keepalive triggered reconnect: ${reason}`);
      if (this.sock) {
        this.sock.end();
      }
    });

    // Start auto-heal monitoring
    this.autoHeal.start();

    // Start disconnect guard
    this.disconnectGuard.start();

    console.log('[WAStability] All monitors started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    this.keepalive.stop();
    this.autoHeal.stop();
    this.disconnectGuard.stop();

    console.log('[WAStability] All monitors stopped');
  }

  /**
   * Handle connection open
   */
  async handleConnected() {
    await this.reconnectManager.handleConnected();
    this.keepalive.reset();
  }

  /**
   * Handle connection close
   */
  async handleDisconnected(reason, error) {
    const result = await this.reconnectManager.handleDisconnected(reason, error);
    return result;
  }

  /**
   * Record socket event
   */
  recordEvent(eventType) {
    this.keepalive.recordEvent(eventType);
  }

  /**
   * Get comprehensive status
   */
  async getStatus() {
    const lockStatus = await this.lock.getStatus();
    const reconnectState = this.reconnectManager.getState();
    const keepaliveStatus = this.keepalive.getStatus();
    const authInfo = await this.authState.getAuthStateInfo();
    const disconnectIncident = await this.disconnectGuard.getIncidentStatus();

    return {
      waMode: this.waMode,
      lock: lockStatus,
      connection: reconnectState,
      keepalive: keepaliveStatus,
      authStore: 'firestore',
      authInfo,
      disconnectIncident: disconnectIncident.exists ? disconnectIncident : null,
    };
  }

  /**
   * Release lock and cleanup
   */
  async cleanup() {
    this.stopMonitoring();
    await this.lock.release();
    console.log('[WAStability] Cleanup complete');
  }

  /**
   * Get auth state handler for Baileys
   */
  async getAuthStateHandler() {
    return await this.authState.useFirestoreAuthState();
  }

  /**
   * Get Baileys config with keepalive settings
   */
  getBaileysConfig() {
    return WAKeepaliveMonitor.getBaileysConfig();
  }
}

module.exports = WAStabilityManager;
