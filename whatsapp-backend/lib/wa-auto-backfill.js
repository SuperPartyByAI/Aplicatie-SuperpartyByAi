/**
 * Server-side auto backfill: production-safe.
 *
 * - On connect: trigger initial backfill (10–40s jitter).
 * - Periodic: every AUTO_BACKFILL_INTERVAL_MS, run for connected accounts.
 * - Distributed lock: Firestore lease per account (autoBackfillLeaseUntil, etc.).
 * - Eligibility: sort by lastAutoBackfillAt asc; max accounts per tick, max concurrency.
 * - Cooldown: success 6h; attempt backoff 10–15 min for retry after failure.
 * - Status: running → ok/error in lastAutoBackfillStatus.
 * - Instance ID: INSTANCE_ID env, else hostname+pid.
 * - Scheduler: start once; skip in PASSIVE mode.
 */

const os = require('os');

const DEFAULT_COOLDOWN_SUCCESS_MS = 1 * 60 * 60 * 1000; // 1h (reduced from 6h for more frequent sync)
const DEFAULT_ATTEMPT_BACKOFF_MS = 10 * 60 * 1000; // 10 min
const DEFAULT_INTERVAL_MS = 12 * 60 * 1000; // 12 min
const DEFAULT_LEASE_MS = 15 * 60 * 1000; // 15 min
const INITIAL_DELAY_MIN_MS = 10000;
const INITIAL_DELAY_MAX_MS = 40000;
const DEFAULT_MAX_ACCOUNTS_PER_TICK = 4; // Process all connected accounts per tick (increased from 3)
const DEFAULT_MAX_CONCURRENCY = 2; // Allow 2 concurrent backfills (increased from 1 for faster sync)

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

/**
 * @param {object} ctx
 * @param {import('@google-cloud/firestore').Firestore} ctx.db
 * @param {() => object} ctx.timestamp - returns serverTimestamp()
 * @param {string} ctx.instanceId
 * @param {() => Promise<boolean>} ctx.isPassive - true => skip scheduler
 * @param {() => Promise<string[]>} ctx.getConnectedAccountIds
 * @param {(id: string) => Promise<{ success: boolean; threads?: number; messages?: number; errors?: number; error?: string }>} ctx.runBackfill
 * @param {(id: string, data: object) => Promise<void>} ctx.saveAccountMeta - merge into accounts/{id}
 * @param {(id: string) => Promise<AccountMeta | null>} ctx.getAccountMeta
 */
function createAutoBackfill(ctx) {
  const instanceId = ctx.instanceId || getInstanceId();
  const cooldownSuccessMs = parseInt(
    process.env.AUTO_BACKFILL_COOLDOWN_SUCCESS_MS || String(DEFAULT_COOLDOWN_SUCCESS_MS),
    10
  );
  const attemptBackoffMs = parseInt(
    process.env.AUTO_BACKFILL_ATTEMPT_BACKOFF_MS || String(DEFAULT_ATTEMPT_BACKOFF_MS),
    10
  );
  const intervalMs = parseInt(
    process.env.AUTO_BACKFILL_INTERVAL_MS || String(DEFAULT_INTERVAL_MS),
    10
  );
  const leaseMs = parseInt(process.env.AUTO_BACKFILL_LEASE_MS || String(DEFAULT_LEASE_MS), 10);
  const maxAccountsPerTick = parseInt(
    process.env.AUTO_BACKFILL_MAX_ACCOUNTS_PER_TICK || String(DEFAULT_MAX_ACCOUNTS_PER_TICK),
    10
  );
  const maxConcurrency = parseInt(
    process.env.AUTO_BACKFILL_MAX_CONCURRENCY || String(DEFAULT_MAX_CONCURRENCY),
    10
  );
  const enabled = process.env.AUTO_BACKFILL_ENABLED !== 'false';

  const inFlight = new Set();
  let activeBackfills = 0;

  function toDate(v) {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (v._seconds !== undefined && v._seconds !== null) return new Date(v._seconds * 1000);
    return null;
  }

  /**
   * Acquire distributed lease for account. Returns true if acquired.
   * @param {string} accountId
   * @returns {Promise<boolean>}
   */
  async function acquireBackfillLease(accountId) {
    if (!ctx.db) return false;
    const ref = ctx.db.collection('accounts').doc(accountId);
    const now = new Date();
    const until = new Date(now.getTime() + leaseMs);
    const ts = ctx.timestamp();

    try {
      let acquired = false;
      await ctx.db.runTransaction(async t => {
        const snap = await t.get(ref);
        const d = snap.exists ? snap.data() : {};
        const leaseUntil = toDate(d.autoBackfillLeaseUntil);
        if (leaseUntil && leaseUntil.getTime() > now.getTime()) {
          return;
        }
        t.set(
          ref,
          {
            autoBackfillLeaseUntil: until,
            autoBackfillLeaseHolder: instanceId,
            autoBackfillLeaseAcquiredAt: ts,
          },
          { merge: true }
        );
        acquired = true;
      });
      return acquired;
    } catch (e) {
      console.warn(`📚 [auto-backfill] ${maskId(accountId)} lease acquire error:`, e.message);
      return false;
    }
  }

  /**
   * Release lease (best-effort). Or let it expire.
   * @param {string} accountId
   */
  async function releaseBackfillLease(accountId) {
    if (!ctx.db) return;
    const ref = ctx.db.collection('accounts').doc(accountId);
    try {
      await ref.set(
        {
          autoBackfillLeaseUntil: null,
          autoBackfillLeaseHolder: null,
          autoBackfillLeaseAcquiredAt: null,
        },
        { merge: true }
      );
    } catch (e) {
      console.warn(`📚 [auto-backfill] ${maskId(accountId)} lease release error:`, e.message);
    }
  }

  /**
   * Run auto backfill for one account (distributed lease + cooldown).
   * @param {string} accountId
   * @param {{ isInitial?: boolean; trigger?: 'connect' | 'periodic' }} [opts]
   * @returns {Promise<{ ran: boolean; reason?: string; durationMs?: number; messages?: number; threads?: number; error?: string }>}
   */
  async function runAutoBackfillForAccount(accountId, opts = {}) {
    const { isInitial = false, trigger = isInitial ? 'connect' : 'periodic' } = opts;
    const masked = maskId(accountId);

    if (inFlight.has(accountId)) {
      console.log(`📚 [auto-backfill] ${masked} skip: in-flight (same instance)`);
      return { ran: false, reason: 'in-flight' };
    }

    let meta = null;
    try {
      meta = await ctx.getAccountMeta(accountId);
    } catch (e) {
      console.warn(`📚 [auto-backfill] ${masked} getAccountMeta error:`, e.message);
    }

    const status = meta?.lastAutoBackfillStatus || {};
    if (status.running === true) {
      console.log(`📚 [auto-backfill] ${masked} skip: status running (another instance?)`);
      return { ran: false, reason: 'running' };
    }

    const lastSuccess = toDate(meta?.lastAutoBackfillSuccessAt);
    const lastAttempt = toDate(meta?.lastAutoBackfillAttemptAt);
    const now = Date.now();

    if (!isInitial && lastSuccess && now - lastSuccess.getTime() < cooldownSuccessMs) {
      const ago = Math.round((now - lastSuccess.getTime()) / 1000);
      console.log(`📚 [auto-backfill] ${masked} skip: success cooldown (last success ${ago}s ago)`);
      return { ran: false, reason: 'cooldown-success' };
    }

    if (!isInitial && lastAttempt && now - lastAttempt.getTime() < attemptBackoffMs) {
      const ago = Math.round((now - lastAttempt.getTime()) / 1000);
      console.log(`📚 [auto-backfill] ${masked} skip: attempt backoff (last attempt ${ago}s ago)`);
      return { ran: false, reason: 'cooldown-attempt' };
    }

    const acquired = await acquireBackfillLease(accountId);
    if (!acquired) {
      console.log(`📚 [auto-backfill] ${masked} skip: lease not acquired (another instance)`);
      return { ran: false, reason: 'lease' };
    }

    inFlight.add(accountId);
    activeBackfills += 1;
    const start = Date.now();

    const runningStatus = {
      running: true,
      startedAt: ctx.timestamp(),
      trigger,
      holder: instanceId,
    };
    try {
      await ctx.saveAccountMeta(accountId, {
        lastAutoBackfillStatus: runningStatus,
        lastAutoBackfillAttemptAt: ctx.timestamp(),
      });
    } catch (e) {
      console.warn(`📚 [auto-backfill] ${masked} save running status error:`, e.message);
    }

    console.log(`📚 [auto-backfill] ${masked} start trigger=${trigger} holder=${instanceId}`);

    try {
      const result = await ctx.runBackfill(accountId);
      const durationMs = Date.now() - start;
      const messages = result.messages ?? 0;
      const threads = result.threads ?? 0;
      const finalStatus = {
        ok: result.success === true,
        running: false,
        threads,
        messages,
        errors: result.errors ?? 0,
        durationMs,
        ...(result.error ? { errorCode: 'backfill_error', errorMessage: result.error } : {}),
      };

      await ctx.saveAccountMeta(accountId, {
        lastAutoBackfillStatus: finalStatus,
        ...(result.success === true
          ? {
              lastAutoBackfillSuccessAt: ctx.timestamp(),
              lastAutoBackfillAt: ctx.timestamp(),
            }
          : {}),
      });

      console.log(
        `📚 [auto-backfill] ${masked} end duration=${durationMs}ms threads=${threads} messages=${messages} holder=${instanceId}`
      );
      return { ran: true, durationMs, messages, threads };
    } catch (err) {
      const durationMs = Date.now() - start;
      const finalStatus = {
        ok: false,
        running: false,
        errorCode: 'exception',
        errorMessage: err.message,
        durationMs,
      };
      try {
        await ctx.saveAccountMeta(accountId, { lastAutoBackfillStatus: finalStatus });
      } catch (e) {
        console.warn(`📚 [auto-backfill] ${masked} saveAccountMeta error:`, e.message);
      }
      console.error(`📚 [auto-backfill] ${masked} error after ${durationMs}ms:`, err.message);
      return { ran: true, error: err.message, durationMs };
    } finally {
      inFlight.delete(accountId);
      activeBackfills = Math.max(0, activeBackfills - 1);
      releaseBackfillLease(accountId).catch(() => {});
    }
  }

  /**
   * Trigger initial backfill on connect (jittered delay).
   */
  function triggerInitialBackfillOnConnect(accountId, check) {
    const delay =
      Math.floor(Math.random() * (INITIAL_DELAY_MAX_MS - INITIAL_DELAY_MIN_MS + 1)) +
      INITIAL_DELAY_MIN_MS;
    const masked = maskId(accountId);
    setTimeout(async () => {
      if (check && !check.stillConnected()) return;
      if (!enabled) return;
      await runAutoBackfillForAccount(accountId, { isInitial: true, trigger: 'connect' });
    }, delay);
    console.log(
      `📚 [auto-backfill] ${masked} scheduled initial (delay=${delay}ms) holder=${instanceId}`
    );
  }

  let schedulerStarted = false;
  let intervalId = null;

  /**
   * Start periodic auto backfill. Call once after server listen. Skips when PASSIVE.
   */
  function schedulePeriodicAutoBackfill() {
    if (!enabled) {
      console.log('📚 [auto-backfill] disabled (AUTO_BACKFILL_ENABLED=false)');
      return;
    }
    if (schedulerStarted) {
      console.log('📚 [auto-backfill] periodic already started, skip');
      return;
    }
    schedulerStarted = true;
    console.log(
      `📚 [auto-backfill] periodic interval=${intervalMs}ms successCooldown=${cooldownSuccessMs}ms attemptBackoff=${attemptBackoffMs}ms maxPerTick=${maxAccountsPerTick} maxConcurrency=${maxConcurrency} lease=${leaseMs}ms instance=${instanceId}`
    );

    const runTick = async () => {
      try {
        if (ctx.isPassive && (await ctx.isPassive())) {
          return;
        }
        const ids = await ctx.getConnectedAccountIds();
        if (ids.length === 0) return;

        const metaList = await Promise.all(
          ids.map(async id => {
            let m = null;
            try {
              m = await ctx.getAccountMeta(id);
            } catch (e) {
              void e;
            }
            return { id, meta: m };
          })
        );

        const lastAt = m => {
          const v = m?.meta?.lastAutoBackfillAt ?? m?.meta?.lastAutoBackfillSuccessAt;
          const d = toDate(v);
          return d ? d.getTime() : 0;
        };
        metaList.sort((a, b) => lastAt(a) - lastAt(b));

        const eligible = metaList.slice(0, maxAccountsPerTick).map(x => x.id);
        console.log(
          `📚 [auto-backfill] tick connected=${ids.length} eligible=${eligible.length} instance=${instanceId}`
        );
        for (const id of eligible) {
          while (activeBackfills >= maxConcurrency) {
            await new Promise(r => setTimeout(r, 2000));
          }
          runAutoBackfillForAccount(id, { isInitial: false, trigger: 'periodic' }).catch(e =>
            console.error('📚 [auto-backfill] tick run error:', e.message)
          );
        }
      } catch (e) {
        console.error('📚 [auto-backfill] periodic tick error:', e.message);
      }
    };

    intervalId = setInterval(runTick, intervalMs);
    runTick();
  }

  function stopPeriodic() {
    schedulerStarted = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    console.log('📚 [auto-backfill] periodic stopped');
  }

  return {
    runAutoBackfillForAccount,
    triggerInitialBackfillOnConnect,
    schedulePeriodicAutoBackfill,
    stopPeriodic,
    getInstanceId: () => instanceId,
  };
}

module.exports = {
  createAutoBackfill,
  maskId,
  getInstanceId,
  DEFAULT_COOLDOWN_SUCCESS_MS,
  DEFAULT_ATTEMPT_BACKOFF_MS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ACCOUNTS_PER_TICK,
  DEFAULT_MAX_CONCURRENCY,
};
