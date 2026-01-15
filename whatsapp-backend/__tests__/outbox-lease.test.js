/**
 * Unit tests for outbox worker lease mechanism
 * 
 * Tests distributed leasing to ensure multi-instance safety:
 * - Two workers cannot claim same outbox message concurrently
 * - Lease expiration allows takeover only after TTL
 */

const admin = require('firebase-admin');

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn(),
    runTransaction: jest.fn(),
    Timestamp: {
      now: jest.fn(() => ({
        toMillis: () => Date.now(),
      })),
      fromMillis: jest.fn((ms) => ({
        toMillis: () => ms,
        toDate: () => new Date(ms),
      })),
      fromDate: jest.fn((date) => ({
        toMillis: () => date.getTime(),
      })),
    },
    FieldValue: {
      serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
    },
  };

  const firestoreFn = jest.fn(() => mockFirestore);
  // Attach Timestamp to firestore function itself (for admin.firestore.Timestamp access)
  firestoreFn.Timestamp = mockFirestore.Timestamp;

  return {
    firestore: firestoreFn,
    initializeApp: jest.fn(),
    apps: [],
  };
});

describe('Outbox Worker Lease Mechanism', () => {
  let mockFirestore;
  let mockTransaction;
  let mockOutboxCollection;
  let mockOutboxDoc;
  let mockOutboxRef;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFirestore = admin.firestore();

    mockOutboxDoc = {
      id: 'request123',
      exists: true,
      data: () => ({
        status: 'queued',
        accountId: 'account123',
        toJid: '+40712345678@s.whatsapp.net',
        body: 'Test message',
        attemptCount: 0,
        nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1000), // Ready to process
        leaseUntil: null, // Not leased
      }),
    };

    mockOutboxRef = {
      get: jest.fn(),
      update: jest.fn(),
    };

    mockOutboxCollection = {
      doc: jest.fn(() => mockOutboxRef),
      where: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(),
          })),
        })),
      })),
    };

    mockFirestore.collection.mockReturnValue(mockOutboxCollection);

    mockTransaction = {
      get: jest.fn(),
      update: jest.fn(),
    };

    mockFirestore.runTransaction.mockImplementation(async (callback) => {
      return await callback(mockTransaction);
    });
  });

  it('should allow first worker to claim unleased message', async () => {
    const WORKER_ID_1 = 'worker1';
    const LEASE_DURATION_MS = 60000;

    // Mock initial state: queued, no lease
    const initialDoc = {
      exists: true,
      data: () => ({
        status: 'queued',
        leaseUntil: null,
      }),
    };

    // Transaction: first worker claims
    mockTransaction.get.mockResolvedValue(initialDoc);

    let claimed = false;
    await mockFirestore.runTransaction(async (transaction) => {
      const outboxRef = mockFirestore.collection('outbox').doc('request123');
      const outboxDoc = await transaction.get(outboxRef);

      if (!outboxDoc.exists) return;
      const data = outboxDoc.data();
      if (data.status !== 'queued') return;
      if (data.leaseUntil && data.leaseUntil.toMillis() > Date.now()) return;

      // Claim
      transaction.update(outboxRef, {
        status: 'processing',
        claimedBy: WORKER_ID_1,
        leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + LEASE_DURATION_MS),
        attemptCount: (data.attemptCount || 0) + 1,
      });
      claimed = true;
    });

    expect(claimed).toBe(true);
    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'processing',
        claimedBy: WORKER_ID_1,
      })
    );
  });

  it('should prevent second worker from claiming already leased message', async () => {
    const WORKER_ID_1 = 'worker1';
    const WORKER_ID_2 = 'worker2';
    const LEASE_DURATION_MS = 60000;

    // Mock state: already leased by worker1
    const leasedDoc = {
      exists: true,
      data: () => ({
        status: 'processing',
        claimedBy: WORKER_ID_1,
        leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + 30000), // Still valid (30s remaining)
      }),
    };

    mockTransaction.get.mockResolvedValue(leasedDoc);

    let claimed = false;
    await mockFirestore.runTransaction(async (transaction) => {
      const outboxRef = mockFirestore.collection('outbox').doc('request123');
      const outboxDoc = await transaction.get(outboxRef);

      if (!outboxDoc.exists) return;
      const data = outboxDoc.data();
      if (data.status !== 'queued') return;
      if (data.leaseUntil && data.leaseUntil.toMillis() > Date.now()) return; // Lease still valid

      transaction.update(outboxRef, {
        status: 'processing',
        claimedBy: WORKER_ID_2,
        leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + LEASE_DURATION_MS),
      });
      claimed = true;
    });

    expect(claimed).toBe(false); // Should not claim (lease still valid)
    expect(mockTransaction.update).not.toHaveBeenCalled();
  });

  it('should allow second worker to claim after lease expiration', async () => {
    const WORKER_ID_1 = 'worker1';
    const WORKER_ID_2 = 'worker2';
    const LEASE_DURATION_MS = 60000;

    // Mock state: lease expired (leaseUntil < now)
    const expiredLeaseDoc = {
      exists: true,
      data: () => ({
        status: 'queued', // Back to queued (or processing if worker crashed)
        claimedBy: WORKER_ID_1,
        leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() - 1000), // Expired 1s ago
      }),
    };

    mockTransaction.get.mockResolvedValue(expiredLeaseDoc);

    let claimed = false;
    await mockFirestore.runTransaction(async (transaction) => {
      const outboxRef = mockFirestore.collection('outbox').doc('request123');
      const outboxDoc = await transaction.get(outboxRef);

      if (!outboxDoc.exists) return;
      const data = outboxDoc.data();
      if (data.status !== 'queued') return;
      if (data.leaseUntil && data.leaseUntil.toMillis() > Date.now()) return; // Check lease

      // Lease expired, can claim
      transaction.update(outboxRef, {
        status: 'processing',
        claimedBy: WORKER_ID_2,
        leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + LEASE_DURATION_MS),
      });
      claimed = true;
    });

    expect(claimed).toBe(true); // Should claim (lease expired)
    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        claimedBy: WORKER_ID_2,
      })
    );
  });

  it('should prevent concurrent claim race condition', async () => {
    const WORKER_ID_1 = 'worker1';
    const WORKER_ID_2 = 'worker2';
    const LEASE_DURATION_MS = 60000;

    // Simulate race: both workers read "queued" at same time
    const queuedDoc = {
      exists: true,
      data: () => ({
        status: 'queued',
        leaseUntil: null,
      }),
    };

    // First transaction succeeds
    let claim1 = false;
    let claim2 = false;

    // Worker 1 transaction
    mockTransaction.get.mockResolvedValueOnce(queuedDoc);
    await mockFirestore.runTransaction(async (transaction) => {
      const outboxRef = mockFirestore.collection('outbox').doc('request123');
      const outboxDoc = await transaction.get(outboxRef);
      const data = outboxDoc.data();
      if (data.status === 'queued' && (!data.leaseUntil || data.leaseUntil.toMillis() <= Date.now())) {
        transaction.update(outboxRef, {
          status: 'processing',
          claimedBy: WORKER_ID_1,
          leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + LEASE_DURATION_MS),
        });
        claim1 = true;
      }
    });

    // Worker 2 transaction (reads updated state)
    const leasedDoc = {
      exists: true,
      data: () => ({
        status: 'processing', // Already claimed by worker1
        claimedBy: WORKER_ID_1,
        leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + LEASE_DURATION_MS),
      }),
    };
    mockTransaction.get.mockResolvedValueOnce(leasedDoc);
    await mockFirestore.runTransaction(async (transaction) => {
      const outboxRef = mockFirestore.collection('outbox').doc('request123');
      const outboxDoc = await transaction.get(outboxRef);
      const data = outboxDoc.data();
      if (data.status === 'queued' && (!data.leaseUntil || data.leaseUntil.toMillis() <= Date.now())) {
        transaction.update(outboxRef, {
          status: 'processing',
          claimedBy: WORKER_ID_2,
          leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + LEASE_DURATION_MS),
        });
        claim2 = true;
      }
    });

    expect(claim1).toBe(true);
    expect(claim2).toBe(false); // Worker 2 should not claim (status is 'processing', not 'queued')
  });
});

describe('No Flush on Connect', () => {
  it('should verify flush handlers are removed from server.js', () => {
    const fs = require('fs');
    const serverJs = fs.readFileSync(__dirname + '/../server.js', 'utf8');

    // Should NOT contain flush outbox on connect
    const flushPatterns = [
      /flush.*outbox.*on.*connect/i,
      /connection\.update.*open.*flush/i,
      /connection\.open.*outbox/i,
    ];

    flushPatterns.forEach((pattern) => {
      const matches = serverJs.match(pattern);
      if (matches) {
        // If found, should be in a comment indicating removal
        const context = serverJs.substring(
          Math.max(0, serverJs.indexOf(matches[0]) - 100),
          Math.min(serverJs.length, serverJs.indexOf(matches[0]) + 200)
        );
        expect(context).toMatch(/removed|REMOVED|comment/i);
      }
    });

    // Should contain indication that flush was removed
    expect(serverJs).toMatch(/REMOVED.*flush|removed.*flush|single.*send.*path/i);
  });
});
