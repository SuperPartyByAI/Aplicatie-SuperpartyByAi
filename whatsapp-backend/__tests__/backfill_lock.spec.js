/**
 * Unit tests for backfill distributed lock (whatsapp_backfill_locks).
 * - Acquire: sets ownerId, expiresAtMs, startedAt; returns true when no existing lock or expired.
 * - Release: deletes doc.
 * - Expire: lock with expiresAtMs in past is treated as not busy.
 */

const { acquireLock, releaseLock, checkLock, LOCK_COLLECTION } = require('../lib/backfill_lock');

describe('backfill lock', () => {
  let mockDb;
  let mockRef;
  let mockSnap;
  let transactionGet;
  let transactionSet;
  let docData;

  beforeEach(() => {
    docData = null;
    transactionGet = jest.fn();
    transactionSet = jest.fn();
    mockSnap = {
      get exists() {
        return !!docData;
      },
      data: () => docData,
    };
    mockRef = {
      get: jest.fn().mockImplementation(() => Promise.resolve({ exists: !!docData, data: () => docData })),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    mockDb = {
      collection: jest.fn((name) => {
        if (name !== LOCK_COLLECTION) return {};
        return {
          doc: jest.fn(() => mockRef),
        };
      }),
      runTransaction: jest.fn((fn) => {
        const t = {
          get: transactionGet.mockImplementation(() => Promise.resolve(mockSnap)),
          set: transactionSet.mockImplementation(() => Promise.resolve()),
        };
        return fn(t);
      }),
    };
  });

  test('acquireLock returns true when no existing lock', async () => {
    docData = null;
    mockSnap.exists = false;
    const timestamp = jest.fn(() => 'SERVER_TS');
    const result = await acquireLock(mockDb, 'account_123', 'instance-1', 15000, timestamp);
    expect(result).toBe(true);
    expect(mockDb.runTransaction).toHaveBeenCalled();
    expect(transactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerId: 'instance-1',
        startedAt: 'SERVER_TS',
      })
    );
    const setCall = transactionSet.mock.calls[0][1];
    expect(setCall.expiresAtMs).toBeGreaterThan(Date.now());
    expect(setCall.expiresAtMs).toBeLessThanOrEqual(Date.now() + 20000);
  });

  test('acquireLock returns false when lock exists and not expired', async () => {
    docData = { ownerId: 'other', expiresAtMs: Date.now() + 60000 };
    mockSnap.exists = true;
    mockSnap.data = () => docData;
    const result = await acquireLock(mockDb, 'account_123', 'instance-1', 15000, jest.fn());
    expect(result).toBe(false);
    expect(transactionSet).not.toHaveBeenCalled();
  });

  test('acquireLock returns true when lock expired', async () => {
    docData = { ownerId: 'other', expiresAtMs: Date.now() - 1000 };
    mockSnap.exists = true;
    mockSnap.data = () => docData;
    const result = await acquireLock(mockDb, 'account_123', 'instance-1', 15000, jest.fn());
    expect(result).toBe(true);
    expect(transactionSet).toHaveBeenCalled();
  });

  test('releaseLock deletes doc', async () => {
    mockRef.delete = jest.fn().mockResolvedValue(undefined);
    await releaseLock(mockDb, 'account_123');
    expect(mockDb.collection).toHaveBeenCalledWith(LOCK_COLLECTION);
    expect(mockRef.delete).toHaveBeenCalled();
  });

  test('checkLock returns busy when lock exists and not expired', async () => {
    docData = { ownerId: 'instance-1', expiresAtMs: Date.now() + 5000 };
    mockRef.get = jest.fn().mockResolvedValue({ exists: true, data: () => docData });
    const result = await checkLock(mockDb, 'account_123');
    expect(result.busy).toBe(true);
    expect(result.ownerId).toBe('instance-1');
  });

  test('checkLock returns not busy when lock expired', async () => {
    docData = { ownerId: 'instance-1', expiresAtMs: Date.now() - 1000 };
    mockRef.get = jest.fn().mockResolvedValue({ exists: true, data: () => docData });
    const result = await checkLock(mockDb, 'account_123');
    expect(result.busy).toBe(false);
  });

  test('checkLock returns not busy when doc does not exist', async () => {
    mockRef.get = jest.fn().mockResolvedValue({ exists: false, data: () => null });
    const result = await checkLock(mockDb, 'account_123');
    expect(result.busy).toBe(false);
  });
});
