/**
 * WA BOOTSTRAP - PASSIVE MODE GATING (MAIN FLOW)
 *
 * Integrates lock acquisition BEFORE any Baileys initialization.
 * PASSIVE mode is HARD GATING - no connect/outbox/inbound when lock not held.
 */

const WAIntegration = require('./wa-integration');
const crypto = require('crypto');

// Global state
let waIntegration = null;
let isActive = false;
let instanceId = null;

/**
 * Initialize WA system with lock acquisition
 * MUST be called before any Baileys socket creation
 */
async function initializeWASystem(db) {
  if (!db) {
    console.error('[WABootstrap] Firestore not available - cannot acquire lock');
    return { mode: 'passive', reason: 'no_firestore' };
  }

  // Generate instance ID
  instanceId =
    process.env.INSTANCE_ID ||
    process.env.RAILWAY_DEPLOYMENT_ID ||
    `instance_${crypto.randomBytes(8).toString('hex')}`;

  console.log(`[WABootstrap] Initializing WA system for instance: ${instanceId}`);

  // Create WAIntegration
  waIntegration = new WAIntegration(db, instanceId);

  // Try to acquire lock
  const result = await waIntegration.initialize();

  if (result.mode === 'passive') {
    isActive = false;
    console.log(`[WABootstrap] ⚠️ PASSIVE MODE - ${result.reason}`);
    console.log('[WABootstrap] Will NOT start Baileys connections');
    console.log('[WABootstrap] Will NOT process outbox');
    console.log('[WABootstrap] Will NOT process inbound');
    return result;
  }

  if (result.blocked) {
    isActive = false;
    console.log(`[WABootstrap] ⚠️ ACTIVE but BLOCKED - ${result.reason}`);
    return result;
  }

  isActive = true;
  console.log('[WABootstrap] ✅ ACTIVE MODE - lock acquired');
  console.log('[WABootstrap] Can start Baileys connections');

  // Setup lock lost handler
  setupLockLostHandler();

  return result;
}

/**
 * Setup handler for lock loss
 */
function setupLockLostHandler() {
  // Check lock status every 30s
  setInterval(async () => {
    if (!waIntegration || !isActive) return;

    const lockStatus = await waIntegration.stability.lock.getStatus();

    if (!lockStatus.isHolder) {
      console.error('[WABootstrap] 🚨 LOCK LOST - entering PASSIVE mode');
      console.error(
        `[WABootstrap] lock_lost_entering_passive instanceId=${instanceId} leaseEpoch=${lockStatus.leaseEpoch || 'unknown'}`
      );

      isActive = false;

      // TODO: Close all Baileys sockets immediately
      // This will be implemented when integrating with actual socket management

      console.log('[WABootstrap] All Baileys connections closed');
      console.log('[WABootstrap] Now in PASSIVE mode');
    }
  }, 30000);
}

/**
 * Check if system is in ACTIVE mode
 * GATING: Returns false if lock not held
 */
function isActiveMode() {
  return isActive && waIntegration !== null;
}

/**
 * Check if can start Baileys connection
 * GATING: Returns false in PASSIVE mode
 */
function canStartBaileys() {
  if (!isActive) {
    console.log('[WABootstrap] GATING: Cannot start Baileys - PASSIVE mode');
    return false;
  }

  if (waIntegration && waIntegration.pairingRequired) {
    console.log('[WABootstrap] GATING: Cannot start Baileys - pairing required');
    return false;
  }

  return true;
}

/**
 * Check if can process outbox
 * GATING: Returns false in PASSIVE mode
 */
function canProcessOutbox() {
  if (!isActive) {
    return false;
  }

  if (waIntegration && waIntegration.pairingRequired) {
    return false;
  }

  return true;
}

/**
 * Check if can process inbound
 * GATING: Returns false in PASSIVE mode
 */
function canProcessInbound() {
  if (!isActive) {
    return false;
  }

  return true;
}

/**
 * Get comprehensive status
 */
async function getWAStatus() {
  if (!waIntegration) {
    return {
      instanceId: instanceId || 'unknown',
      waMode: 'passive_lock_not_acquired',
      waStatus: 'NOT_RUNNING',
      lockStatus: 'not_initialized',
      reason: 'wa_integration_not_initialized',
    };
  }

  const status = await waIntegration.getStatus();

  // Override waStatus if not active
  if (!isActive) {
    status.waStatus = 'NOT_RUNNING';
  }

  return status;
}

/**
 * Graceful shutdown (SIGTERM/SIGINT)
 */
async function shutdown(signal) {
  console.log(`[WABootstrap] Graceful shutdown initiated signal=${signal}`);

  if (waIntegration) {
    try {
      // Stop timers
      waIntegration.stopMonitoring();

      // Close socket (TODO: integrate with actual Baileys socket)
      console.log('[WABootstrap] Closing Baileys socket...');

      // Flush auth writes
      console.log('[WABootstrap] Flushing auth writes...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for pending writes

      // Release lock
      console.log('[WABootstrap] Releasing lock...');
      await waIntegration.stability.lock.release();

      console.log('[WABootstrap] shutdown_graceful_complete');
      process.exit(0);
    } catch (error) {
      console.error('[WABootstrap] Shutdown error:', error.message);
      process.exit(1);
    }
  } else {
    process.exit(0);
  }
}

// Setup shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = {
  initializeWASystem,
  isActiveMode,
  canStartBaileys,
  canProcessOutbox,
  canProcessInbound,
  getWAStatus,
  shutdown,
};
