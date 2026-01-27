/**
 * Recent-sync (gap-filler): periodic lightweight fetch of last N messages from recent threads.
 * Complements realtime (messages.upsert) and full backfill. Uses Firestore lease per account.
 *
 * Env: RECENT_SYNC_ENABLED, RECENT_SYNC_INTERVAL_MS, RECENT_SYNC_LOOKBACK_MS,
 *      RECENT_SYNC_MAX_THREADS, RECENT_SYNC_MAX_MESSAGES_PER_THREAD, RECENT_SYNC_MAX_CONCURRENCY.
 */

const os = require('os');

const DEFAULT_INTERVAL_MS = 120000; // 2 min
const DEFAULT_LEASE_MS = 5 * 60 * 1000; // 5 min
const DEFAULT_MAX_THREADS = 30;
const DEFAULT_MAX_MESSAGES_PER_THREAD = 20;
const DEFAULT_MAX_CONCURRENCY = 1;

function maskId(id) {
  if (!id || typeof id !== 'string') return '?';
  if (id.length <= 12) return id;
  return id.slice(0, 8) + '...';
}

function getInstanceId() {
  return (
    process.env.INSTANCE_ID ||
    [os.hostname(), process.pid].filter(Boolean).join('-') ||
    `local-${Date.now()}`
  );
}

function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v._seconds != null) return new Date(v._seconds * 1000);
  return null;
}

/**
 * @param {object} ctx
 * @param {import('@google-cloud/firestore').Firestore} ctx.db
 * @param {() => object} ctx.timestamp
 * @param {string} ctx.instanceId
 * @param {() => Promise<boolean>} ctx.isPassive
 * @param {() => Promise<string[]>} ctx.getConnectedAccountIds
 * @param {(id: string) => Promise<{ success: boolean; threads?: number; messages?: number; errors?: number; error?: string; durationMs?: number }>} ctx.runRecentSync
 * @param {(id: string, data: object) => Promise<void>} ctx.saveAccountMeta
 * @param {(id: string) => Promise<object | null>} ctx.getAccountMeta
 */
function createRecentSync(ctx) {
  const instanceId = ctx.instanceId || getInstanceId();
  const intervalMs = parseInt(
    process.env.RECENT_SYNC_INTERVAL_MS || String(DEFAULT_INTERVAL_MS),
    10
  );
  const leaseMs = parseInt(
    process.env.RECENT_SYNC_LEASE_MS || String(DEFAULT_LEASE_MS),
    10
  );
  const maxThreads = parseInt(
    process.env.RECENT_SYNC_MAX_THREADS || String(DEFAULT_MAX_THREADS),
    10
  );
  const maxConcurrency = parseInt(
    process.env.RECENT_SYNC_MAX_CONCURRENCY || String(DEFAULT_MAX_CONCURRENCY),
    10
  );
  const enabled = process.env.RECENT_SYNC_ENABLED !== 'false';

  const inFlight = new Set();
  let active = 0;
  let schedulerStarted = false;
  let intervalId = null;

  async function acquireLease(accountId) {
    if (!ctx.db) return false;
    const ref = ctx.db.collection('accounts').doc(accountId);
    const now = new Date();
    const until = new Date(now.getTime() + leaseMs);
    const ts = ctx.timestamp();

    try {
      let acquired = false;
      await ctx.db.runTransaction(async (t) => {
        const snap = await t.get(ref);
        const d = snap.exists ? snap.data() : {};
        const leaseUntil = toDate(d.recentSyncLeaseUntil);
        if (leaseUntil && leaseUntil.getTime() > now.getTime()) {
          return;
        }
        t.set(
          ref,
          {
            recentSyncLeaseUntil: until,
            recentSyncLeaseHolder: instanceId,
            recentSyncLeaseAcquiredAt: ts,
          },
          { merge: true }
        );
        acquired = true;
      });
      return acquired;
    } catch (e) {
      console.warn(`[recent-sync] ${maskId(accountId)} lease acquire error:`, e.message);
      return false;
    }
  }

  async function releaseLease(accountId) {
    if (!ctx.db) return;
    const ref = ctx.db.collection('accounts').doc(accountId);
    try {
      await ref.set(
        {
          recentSyncLeaseUntil: null,
          recentSyncLeaseHolder: null,
          recentSyncLeaseAcquiredAt: null,
        },
        { merge: true }
      );
    } catch (e) {
      console.warn(`[recent-sync] ${maskId(accountId)} lease release error:`, e.message);
    }
  }

  async function runForAccount(accountId) {
    if (inFlight.has(accountId)) {
      console.log(`[recent-sync] ${maskId(accountId)} skipped: in-flight`);
      return { ran: false, reason: 'in-flight' };
    }

    const acquired = await acquireLease(accountId);
    if (!acquired) {
      console.log(`[recent-sync] ${maskId(accountId)} skipped: lease not acquired`);
      return { ran: false, reason: 'lease' };
    }
    console.log(`[recent-sync] ${maskId(accountId)} starting sync (lease acquired)`);

    inFlight.add(accountId);
    active += 1;
    const start = Date.now();

    try {
      const result = await ctx.runRecentSync(accountId);
      const durationMs = Date.now() - start;
      const threads = result.threads ?? 0;
      const messages = result.messages ?? 0;
      const errors = result.errors ?? 0;
      const ok = result.success === true && errors === 0;
      await ctx.saveAccountMeta(accountId, {
        lastRecentSyncAt: ctx.timestamp(),
        lastRecentSyncResult: {
          ok,
          threads,
          messages,
          errors,
          durationMs,
          ...(result.error ? { errorMessage: result.error } : {}),
        },
      });
      return { ran: true, threads, messages, errors };
    } catch (err) {
      const durationMs = Date.now() - start;
      try {
        await ctx.saveAccountMeta(accountId, {
          lastRecentSyncAt: ctx.timestamp(),
          lastRecentSyncResult: {
            ok: false,
            errorMessage: err.message,
            durationMs,
          },
        });
      } catch (e) {
        void e;
      }
      console.error(`[recent-sync] ${maskId(accountId)} error: ${err.message} durationMs=${durationMs}`);
      return { ran: true, error: err.message };
    } finally {
      inFlight.delete(accountId);
      active = Math.max(0, active - 1);
      releaseLease(accountId).catch(() => {});
    }
  }

  function schedulePeriodicRecentSync() {
    if (!enabled) {
      console.log('[recent-sync] disabled (RECENT_SYNC_ENABLED=false)');
      return;
    }
    if (schedulerStarted) {
      console.log('[recent-sync] periodic already started, skip');
      return;
    }
    schedulerStarted = true;
    console.log(
      `[recent-sync] periodic interval=${intervalMs}ms lease=${leaseMs}ms maxThreads=${maxThreads} maxConcurrency=${maxConcurrency} instance=${instanceId}`
    );

    const runTick = async () => {
      try {
        if (ctx.isPassive && (await ctx.isPassive())) {
          return;
        }
        const ids = await ctx.getConnectedAccountIds();
        if (ids.length === 0) return;

        for (const id of ids) {
          while (active >= maxConcurrency) {
            await new Promise((r) => setTimeout(r, 2000));
          }
          runForAccount(id).catch((e) =>
            console.error('[recent-sync] tick run error:', e.message)
          );
        }
      } catch (e) {
        console.error('[recent-sync] periodic tick error:', e.message);
      }
    };

    intervalId = setInterval(runTick, intervalMs);
    runTick();
  }

  function stop() {
    schedulerStarted = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    console.log('[recent-sync] periodic stopped');
  }

  return {
    runForAccount,
    schedulePeriodicRecentSync,
    stop,
    getInstanceId: () => instanceId,
  };
}

module.exports = {
  createRecentSync,
  getInstanceId,
  DEFAULT_INTERVAL_MS,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_THREADS,
  DEFAULT_MAX_MESSAGES_PER_THREAD,
  DEFAULT_MAX_CONCURRENCY,
};
