/**
 * WA CONNECTION DISTRIBUTED LOCK
 * 
 * Ensures only ONE instance runs Baileys connection at a time.
 * Other instances run in PASSIVE MODE (no WA connection).
 * 
 * Lock path: wa_metrics/longrun/locks/wa_connection
 * Lease: 90s, refresh every 30s
 */

const { FieldValue } = require('firebase-admin/firestore');

class WAConnectionLock {
  constructor(db, instanceId) {
    this.db = db;
    this.instanceId = instanceId;
    this.lockPath = 'wa_metrics/longrun/locks/wa_connection';
    this.leaseDurationMs = 90000; // 90s
    this.refreshIntervalMs = 30000; // 30s
    this.isHolder = false;
    this.refreshTimer = null;
    
    console.log(`[WALock] Initialized for instance: ${instanceId}`);
  }

  /**
   * Try to acquire lock
   */
  async tryAcquire() {
    try {
      const lockRef = this.db.doc(this.lockPath);
      const now = Date.now();
      const leaseUntil = now + this.leaseDurationMs;

      const result = await this.db.runTransaction(async (transaction) => {
        const lockDoc = await transaction.get(lockRef);

        if (!lockDoc.exists) {
          // No lock exists, acquire it
          transaction.set(lockRef, {
            holderInstanceId: this.instanceId,
            leaseUntil,
            acquiredAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
          return { acquired: true, reason: 'no_existing_lock' };
        }

        const lockData = lockDoc.data();
        const currentLeaseUntil = lockData.leaseUntil;

        if (currentLeaseUntil < now) {
          // Lock expired, take it
          transaction.update(lockRef, {
            holderInstanceId: this.instanceId,
            leaseUntil,
            acquiredAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            previousHolder: lockData.holderInstanceId
          });
          return { acquired: true, reason: 'expired_lock_taken' };
        }

        if (lockData.holderInstanceId === this.instanceId) {
          // We already hold it, refresh
          transaction.update(lockRef, {
            leaseUntil,
            updatedAt: FieldValue.serverTimestamp()
          });
          return { acquired: true, reason: 'refreshed_own_lock' };
        }

        // Lock held by another instance
        return {
          acquired: false,
          reason: 'held_by_other',
          holder: lockData.holderInstanceId,
          leaseUntil: currentLeaseUntil
        };
      });

      if (result.acquired) {
        this.isHolder = true;
        console.log(`[WALock] ✅ Acquired (${result.reason})`);
        this.startRefreshTimer();
      } else {
        this.isHolder = false;
        const remainingMs = result.leaseUntil - now;
        console.log(`[WALock] ❌ Not acquired - held by ${result.holder} (expires in ${Math.round(remainingMs/1000)}s)`);
      }

      return result;
    } catch (error) {
      console.error('[WALock] Error acquiring lock:', error);
      this.isHolder = false;
      return { acquired: false, reason: 'error', error: error.message };
    }
  }

  /**
   * Start refresh timer
   */
  startRefreshTimer() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      if (!this.isHolder) {
        this.stopRefreshTimer();
        return;
      }

      const result = await this.tryAcquire();
      if (!result.acquired) {
        console.warn('[WALock] ⚠️ Lost lock during refresh');
        this.isHolder = false;
        this.stopRefreshTimer();
      }
    }, this.refreshIntervalMs);

    console.log(`[WALock] Refresh timer started (every ${this.refreshIntervalMs/1000}s)`);
  }

  /**
   * Stop refresh timer
   */
  stopRefreshTimer() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      console.log('[WALock] Refresh timer stopped');
    }
  }

  /**
   * Release lock
   */
  async release() {
    if (!this.isHolder) {
      console.log('[WALock] Not holding lock, nothing to release');
      return;
    }

    try {
      this.stopRefreshTimer();

      const lockRef = this.db.doc(this.lockPath);
      await this.db.runTransaction(async (transaction) => {
        const lockDoc = await transaction.get(lockRef);
        
        if (lockDoc.exists) {
          const lockData = lockDoc.data();
          if (lockData.holderInstanceId === this.instanceId) {
            transaction.delete(lockRef);
            console.log('[WALock] ✅ Released');
          } else {
            console.log('[WALock] Lock held by another instance, not releasing');
          }
        }
      });

      this.isHolder = false;
    } catch (error) {
      console.error('[WALock] Error releasing lock:', error);
    }
  }

  /**
   * Get lock status
   */
  async getStatus() {
    try {
      const lockDoc = await this.db.doc(this.lockPath).get();
      
      if (!lockDoc.exists) {
        return {
          exists: false,
          isHolder: this.isHolder
        };
      }

      const lockData = lockDoc.data();
      const now = Date.now();
      const isExpired = lockData.leaseUntil < now;

      return {
        exists: true,
        holder: lockData.holderInstanceId,
        leaseUntil: lockData.leaseUntil,
        isExpired,
        isHolder: this.isHolder,
        remainingMs: Math.max(0, lockData.leaseUntil - now)
      };
    } catch (error) {
      console.error('[WALock] Error getting status:', error);
      return { error: error.message };
    }
  }

  /**
   * Check if this instance holds the lock
   */
  holdsLock() {
    return this.isHolder;
  }
}

module.exports = WAConnectionLock;
