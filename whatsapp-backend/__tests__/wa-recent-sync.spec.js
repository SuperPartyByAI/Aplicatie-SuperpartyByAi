/**
 * Smoke tests for recent-sync (gap-filler).
 * When fetchMessagesFromWA is missing/miswired, recent-sync logs a clear error and marks status error.
 */

const { createRecentSync } = require('../lib/wa-recent-sync');

function mockDb() {
  const docRef = { set: jest.fn().mockResolvedValue(undefined) };
  return {
    collection: () => ({
      doc: () => docRef,
    }),
    runTransaction: jest.fn().mockImplementation(async (fn) => {
      const t = {
        get: async () => ({ exists: false, data: () => ({}) }),
        set: async () => {},
      };
      return fn(t);
    }),
  };
}

describe('wa-recent-sync', () => {
  test('when runRecentSync returns success:false and errors>0, saveAccountMeta receives ok:false', async () => {
    const saved = [];
    const db = mockDb();
    const sync = createRecentSync({
      db,
      timestamp: () => ({ _seconds: Math.floor(Date.now() / 1000) }),
      instanceId: 'test-instance',
      isPassive: async () => false,
      getConnectedAccountIds: async () => ['account_1'],
      runRecentSync: async () => ({
        success: false,
        threads: 30,
        messages: 0,
        errors: 30,
        error: 'fetchMessageHistory not available',
        durationMs: 100,
      }),
      saveAccountMeta: async (id, data) => {
        saved.push({ accountId: id, ...data });
      },
      getAccountMeta: async () => null,
    });

    sync.schedulePeriodicRecentSync();
    await new Promise((r) => setTimeout(r, 800));
    sync.stop();

    expect(saved.length).toBeGreaterThanOrEqual(1);
    const last = saved[saved.length - 1];
    expect(last.lastRecentSyncResult).toBeDefined();
    expect(last.lastRecentSyncResult.ok).toBe(false);
    expect(last.lastRecentSyncResult.errors).toBe(30);
    expect(last.lastRecentSyncResult.errorMessage).toContain('fetchMessageHistory');
  });
});
