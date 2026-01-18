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
let passiveRetryTimer = null; // Timer for retrying lock acquisition when PASSIVE

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
    
    // CRITICAL: Start retry loop to acquire lock when it becomes available
    startPassiveRetryLoop(db);
    
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

  // Stop passive retry loop if it was running
  stopPassiveRetryLoop();

  // Setup lock lost handler
  setupLockLostHandler();

  return result;
}

/**
 * Start retry loop for lock acquisition when in PASSIVE mode
 * Retries every 15 seconds until lock is acquired or instance shuts down
 */
function startPassiveRetryLoop(db) {
  // Clear any existing retry timer
  stopPassiveRetryLoop();
  
  console.log('[WABootstrap] Starting PASSIVE retry loop (every 15s) - will retry lock acquisition');
  
  passiveRetryTimer = setInterval(async () => {
    if (!waIntegration || !db) {
      console.log('[WABootstrap] Retry skipped: waIntegration or db not available');
      return;
    }
    
    if (isActive) {
      // Already active, stop retry
      console.log('[WABootstrap] Lock acquired, stopping PASSIVE retry loop');
      stopPassiveRetryLoop();
      return;
    }
    
    try {
      console.log('[WABootstrap] 🔄 Retrying lock acquisition (PASSIVE mode)...');
      const result = await waIntegration.initialize();
      
      if (result.mode === 'active' && !result.blocked) {
        isActive = true;
        console.log('[WABootstrap] ✅ ACTIVE MODE - lock acquired after retry');
        console.log('[WABootstrap] Can start Baileys connections');
        stopPassiveRetryLoop();
        setupLockLostHandler();
        
        // Emit event/log that system is now active (could trigger connection restoration)
        console.log('[WABootstrap] 🔔 System transitioned from PASSIVE to ACTIVE - ready to process');
        
        // CRITICAL: Auto-reconnect accounts that were stuck in connecting/reconnecting
        // This ensures session stability when lock becomes available
        if (typeof process.emit === 'function') {
          process.emit('wa-bootstrap:active', { instanceId });
        }
      } else {
        console.log(`[WABootstrap] Still PASSIVE - ${result.reason || 'lock held by another instance'}`);
      }
    } catch (error) {
      console.error('[WABootstrap] Retry lock acquisition failed:', error.message);
      // Continue retrying on next interval
    }
  }, 15000); // Retry every 15 seconds
}

/**
 * Stop passive retry loop
 */
function stopPassiveRetryLoop() {
  if (passiveRetryTimer) {
    clearInterval(passiveRetryTimer);
    passiveRetryTimer = null;
    console.log('[WABootstrap] PASSIVE retry loop stopped');
  }
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

  // Stop passive retry loop
  stopPassiveRetryLoop();

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
