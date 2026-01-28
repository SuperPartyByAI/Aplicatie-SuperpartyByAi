'use strict';

/**
 * Unit tests for WhatsApp Proxy QR Connect endpoints
 *
 * Tests authentication, authorization, input validation, and backend forwarding.
 */

// Set env var before importing module (to avoid fail-fast in tests)
// Note: For lazy-loading tests, we'll unset this to test missing config behavior
process.env.WHATSAPP_BACKEND_BASE_URL =
  process.env.WHATSAPP_BACKEND_BASE_URL || 'https://test-backend.invalid';
process.env.NODE_ENV = 'test';

// Mock Firebase Admin BEFORE requiring it (Jest hoisting)
const mockVerifyIdToken = jest.fn();
const mockFirestoreDocGet = jest.fn();
const mockFirestoreDoc = jest.fn(() => ({
  get: mockFirestoreDocGet,
}));
const mockFirestoreCollection = jest.fn(() => ({
  doc: mockFirestoreDoc,
}));
const mockFirestoreRunTransaction = jest.fn();

const mockFirestore = {
  collection: jest.fn(name => {
    if (name === 'staffProfiles') {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ exists: false }),
        })),
      };
    }
    if (name === 'threads') {
      return {
        doc: jest.fn(() => ({
          get: jest.fn(),
        })),
      };
    }
    if (name === 'outbox') {
      return {
        doc: jest.fn(() => ({
          get: jest.fn(),
        })),
      };
    }
    return mockFirestoreCollection;
  }),
  runTransaction: mockFirestoreRunTransaction,
};

const mockAuth = {
  verifyIdToken: mockVerifyIdToken,
};

jest.mock('firebase-admin', () => {
  // Create firestore function that also has static properties (like Admin SDK)
  const firestoreFn = jest.fn(() => mockFirestore);
  // Attach static properties to match Admin SDK structure
  firestoreFn.FieldValue = {
    serverTimestamp: jest.fn(() => ({ _methodName: 'serverTimestamp' })),
  };
  firestoreFn.Timestamp = {
    now: jest.fn(() => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 })),
  };

  return {
    firestore: firestoreFn,
    auth: jest.fn(() => mockAuth),
    initializeApp: jest.fn(),
    apps: [],
  };
});

const admin = require('firebase-admin');

describe('WhatsApp Proxy /getAccountsStaff', () => {
  let req;
  let res;
  let whatsappProxy;
  let mockForwardRequest;
  let mockStaffProfilesGet;

  beforeEach(() => {
    jest.resetModules();
    whatsappProxy = require('../whatsappProxy');

    mockForwardRequest = jest.fn().mockResolvedValue({
      statusCode: 200,
      body: {
        success: true,
        accounts: [
          {
            id: 'account1',
            name: 'Test Account',
            phone: '+40737571397',
            status: 'connected',
            qrCode: 'sensitive-qr-code-data',
            pairingCode: 'sensitive-pairing-code',
            pairing_url: 'sensitive-pairing-url',
          },
        ],
      },
    });
    whatsappProxy._forwardRequest = mockForwardRequest;

    req = {
      method: 'GET',
      headers: {
        authorization: 'Bearer mock-token',
      },
      user: null,
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headersSent: false,
    };

    mockVerifyIdToken.mockResolvedValue({
      uid: 'test-uid',
      email: 'employee@example.com',
    });

    // Mock staffProfiles exists (employee)
    mockStaffProfilesGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ role: 'staff' }),
    });
    
    // Override staffProfiles mock for this test suite
    mockFirestore.collection.mockImplementation((name) => {
      if (name === 'staffProfiles') {
        return {
          doc: jest.fn(() => ({
            get: mockStaffProfilesGet,
          })),
        };
      }
      return mockFirestoreCollection(name);
    });
  });

  it('should return 401 when no auth token', async () => {
    req.headers.authorization = undefined;
    mockVerifyIdToken.mockRejectedValue(new Error('Unauthorized'));

    await whatsappProxy.getAccountsStaffHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'unauthorized',
        message: 'Missing token',
      })
    );
  });

  it('should return 403 when user is not employee (no staffProfiles)', async () => {
    mockStaffProfilesGet.mockResolvedValue({
      exists: false,
    });

    await whatsappProxy.getAccountsStaffHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'employee_only',
        message: 'Only employees can send messages',
      })
    );
  });

  it('should allow employee and sanitize response (remove QR/pairing fields)', async () => {
    await whatsappProxy.getAccountsStaffHandler(req, res);

    expect(mockForwardRequest).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    
    // Verify response was sanitized (no qrCode, pairingCode, pairing_url)
    const responseCall = res.json.mock.calls[0][0];
    expect(responseCall.success).toBe(true);
    expect(responseCall.accounts).toHaveLength(1);
    
    const account = responseCall.accounts[0];
    expect(account.id).toBe('account1');
    expect(account.name).toBe('Test Account');
    expect(account.phone).toBe('+40737571397');
    expect(account.status).toBe('connected');
    
    // Verify sensitive fields are removed
    expect(account.qrCode).toBeUndefined();
    expect(account.qr).toBeUndefined();
    expect(account.pairingCode).toBeUndefined();
    expect(account.pairing_code).toBeUndefined();
    expect(account.pairingUrl).toBeUndefined();
    expect(account.pairing_url).toBeUndefined();
  });

  it('should allow admin email (employee)', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'admin-uid',
      email: 'ursache.andrei1995@gmail.com', // Super-admin
    });

    await whatsappProxy.getAccountsStaffHandler(req, res);

    expect(mockForwardRequest).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should handle backend errors correctly', async () => {
    mockForwardRequest.mockResolvedValue({
      statusCode: 500,
      body: { success: false, error: 'backend_error' },
    });

    await whatsappProxy.getAccountsStaffHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'backend_error',
      })
    );
  });

  it('should sanitize multiple accounts', async () => {
    mockForwardRequest.mockResolvedValue({
      statusCode: 200,
      body: {
        success: true,
        accounts: [
          {
            id: 'account1',
            name: 'Account 1',
            phone: '+40737571397',
            status: 'connected',
            qrCode: 'qr1',
            pairingCode: 'pair1',
          },
          {
            id: 'account2',
            name: 'Account 2',
            phone: '+40737571398',
            status: 'disconnected',
            qrCode: 'qr2',
            pairing_url: 'url2',
          },
        ],
      },
    });

    await whatsappProxy.getAccountsStaffHandler(req, res);

    const responseCall = res.json.mock.calls[0][0];
    expect(responseCall.accounts).toHaveLength(2);
    
    // Both accounts should be sanitized
    responseCall.accounts.forEach((account) => {
      expect(account.qrCode).toBeUndefined();
      expect(account.pairingCode).toBeUndefined();
      expect(account.pairing_url).toBeUndefined();
      expect(account.id).toBeDefined();
      expect(account.name).toBeDefined();
      expect(account.phone).toBeDefined();
      expect(account.status).toBeDefined();
    });
  });
});

describe('WhatsApp Proxy /getAccounts', () => {
  let req;
  let res;
  let whatsappProxy;
  let mockForwardRequest;

  beforeEach(() => {
    jest.resetModules();
    whatsappProxy = require('../whatsappProxy');

    // Mock forwardRequest by replacing the exported function
    mockForwardRequest = jest.fn().mockResolvedValue({
      statusCode: 200,
      body: { success: true, accounts: [] },
    });
    whatsappProxy._forwardRequest = mockForwardRequest;

    req = {
      method: 'GET',
      headers: {
        authorization: 'Bearer mock-token',
      },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };

    mockVerifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com', // Super-admin
    });
  });

  it('should reject unauthenticated requests', async () => {
    req.headers.authorization = null;
    mockVerifyIdToken.mockResolvedValue(null);

    await whatsappProxy.getAccountsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'unauthorized',
        message: 'Missing token',
      })
    );
  });

  it('should reject non-super-admin', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'user123',
      email: 'user@example.com', // Not super-admin
    });

    await whatsappProxy.getAccountsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'super_admin_only',
      })
    );
  });

  it('should allow super-admin and forward request (exposes QR codes)', async () => {
    mockForwardRequest.mockResolvedValue({
      statusCode: 200,
      body: { success: true, accounts: [{ id: 'acc1', name: 'Test', status: 'connected' }] },
    });

    await whatsappProxy.getAccountsHandler(req, res);

    expect(mockForwardRequest).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        accounts: expect.any(Array),
      })
    );
  });
});

describe('WhatsApp Proxy /addAccount', () => {
  let req;
  let res;
  let whatsappProxy;
  let mockForwardRequest;

  beforeEach(() => {
    jest.resetModules();
    whatsappProxy = require('../whatsappProxy');
    mockForwardRequest = jest.fn();
    whatsappProxy._forwardRequest = mockForwardRequest;

    req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer mock-token',
      },
      body: {
        name: 'Test Account',
        phone: '+407123456789',
      },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };

    mockVerifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com', // Super-admin
    });
  });

  it('should reject unauthenticated requests', async () => {
    req.headers.authorization = null;
    mockVerifyIdToken.mockResolvedValue(null);

    await whatsappProxy.addAccountHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'unauthorized',
        message: 'Missing token',
      })
    );
  });

  it('should reject non-super-admin', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'user123',
      email: 'user@example.com', // Not super-admin
    });

    await whatsappProxy.addAccountHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'super_admin_only',
      })
    );
  });

  it('should reject invalid name', async () => {
    req.body.name = ''; // Invalid

    await whatsappProxy.addAccountHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'invalid_request',
      })
    );
  });

  it('should reject invalid phone', async () => {
    req.body.phone = '123'; // Too short

    await whatsappProxy.addAccountHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'invalid_request',
      })
    );
  });

  it('should accept valid super-admin request and forward', async () => {
    mockForwardRequest.mockResolvedValue({
      statusCode: 200,
      body: { success: true, accountId: 'acc123' },
    });

    await whatsappProxy.addAccountHandler(req, res);

    expect(mockForwardRequest).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        accountId: 'acc123',
      })
    );
  });
});

describe('WhatsApp Proxy /regenerateQr', () => {
  let req;
  let res;
  let whatsappProxy;
  let mockForwardRequest;

  beforeEach(() => {
    jest.resetModules();
    whatsappProxy = require('../whatsappProxy');
    mockForwardRequest = jest.fn();
    whatsappProxy._forwardRequest = mockForwardRequest;

    req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer mock-token',
      },
      query: {
        accountId: 'account123',
      },
      body: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };

    mockVerifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com',
    });
  });

  it('should reject unauthenticated requests', async () => {
    req.headers.authorization = null;
    mockVerifyIdToken.mockResolvedValue(null);

    await whatsappProxy.regenerateQrHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'unauthorized',
        message: 'Missing token',
      })
    );
  });

  it('should reject non-super-admin', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'user123',
      email: 'user@example.com', // Not super-admin
    });

    await whatsappProxy.regenerateQrHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'super_admin_only',
      })
    );
  });

  it('should require accountId', async () => {
    req.query = {};
    req.body = {};

    await whatsappProxy.regenerateQrHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'invalid_request',
      })
    );
  });

  it('should accept valid super-admin request and forward', async () => {
    mockForwardRequest.mockResolvedValue({
      statusCode: 200,
      body: { success: true, message: 'QR regeneration started' },
    });

    await whatsappProxy.regenerateQrHandler(req, res);

    expect(mockForwardRequest).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });
});

describe('WhatsApp Proxy /send', () => {
  let req;
  let res;
  let whatsappProxy;
  let mockTransaction;
  let mockThreadRef;
  let mockOutboxRef;
  let mockThreadCollection;
  let mockOutboxCollection;
  let mockStaffCollection;

  // Helper to create Firestore snapshot mocks
  const snap = (exists, data = {}) => ({
    exists,
    data: () => data,
  });

  beforeEach(() => {
    jest.resetModules();
    whatsappProxy = require('../whatsappProxy');

    // Mock Firestore with transaction support
    mockTransaction = {
      get: jest.fn(),
      set: jest.fn(),
      update: jest.fn(),
    };

    mockThreadRef = {
      get: jest.fn(),
      set: jest.fn(),
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          set: jest.fn(),
        })),
      })),
    };

    mockOutboxRef = {
      get: jest.fn(),
    };

    mockThreadCollection = {
      doc: jest.fn(() => mockThreadRef),
    };

    mockOutboxCollection = {
      doc: jest.fn(() => mockOutboxRef),
    };

    // Create a single mock doc ref that will be reused
    const mockStaffDocRef = {
      get: jest.fn(),
    };
    mockStaffCollection = {
      doc: jest.fn(() => mockStaffDocRef),
    };

    // Override global mock for this test suite
    mockFirestore.collection.mockImplementation(name => {
      if (name === 'threads') return mockThreadCollection;
      if (name === 'outbox') return mockOutboxCollection;
      if (name === 'staffProfiles') return mockStaffCollection;
      return { doc: jest.fn() };
    });

    mockFirestoreRunTransaction.mockImplementation(async callback => {
      return await callback(mockTransaction);
    });

    req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer mock-token',
      },
      body: {
        threadId: 'thread123',
        accountId: 'account123',
        toJid: '+40712345678@s.whatsapp.net',
        text: 'Test message',
        clientMessageId: 'client_msg_123',
      },
      // user and employeeInfo will be set by requireEmployee middleware
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };

    // Mock auth
    mockVerifyIdToken.mockResolvedValue({
      uid: 'user123',
      email: 'employee@example.com',
    });

    // Mock staffProfiles check (employee) - use snap helper
    // mockStaffCollection.doc() returns mockStaffDocRef (set up above)
    mockStaffCollection.doc().get.mockResolvedValue(snap(true, { role: 'staff' }));

    // Set default mock for threadRef.get() to avoid crashes
    // Tests that need specific thread data will override this
    mockThreadRef.get.mockResolvedValue(
      snap(true, {
        accountId: 'account123',
        ownerUid: 'user123',
        coWriterUids: [],
      })
    );
  });

  it('should reject unauthenticated requests', async () => {
    req.headers.authorization = null;
    mockVerifyIdToken.mockResolvedValue(null);

    await whatsappProxy.sendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'unauthorized',
        message: 'Missing token',
      })
    );
  });

  it('should reject non-employee', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'user123',
      email: 'user@example.com', // Not super-admin and not in staffProfiles
    });

    // Mock staffProfiles check (not employee) - must return snap(false)
    mockStaffCollection.doc().get.mockResolvedValue(snap(false));

    await whatsappProxy.sendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'employee_only',
      })
    );
  });

  it('should reject missing required fields', async () => {
    req.body = {
      threadId: 'thread123',
      // Missing accountId, toJid, text, clientMessageId
    };

    // Reset threadRef mock - validation should stop before reaching it
    mockThreadRef.get.mockReset();

    await whatsappProxy.sendHandler(req, res);

    // Verify transaction was not called
    expect(mockFirestoreRunTransaction).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'invalid_request',
      })
    );
  });

  it('should reject if thread does not exist', async () => {
    mockThreadRef.get.mockResolvedValue(snap(false));

    await whatsappProxy.sendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'thread_not_found',
      })
    );
  });

  it('should reject if accountId mismatch', async () => {
    mockThreadRef.get.mockResolvedValue(
      snap(true, {
        accountId: 'different_account', // Mismatch
      })
    );

    await whatsappProxy.sendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'account_mismatch',
      })
    );
  });

  it('should reject if user is not owner or co-writer', async () => {
    mockThreadRef.get.mockResolvedValue(
      snap(true, {
        accountId: 'account123',
        ownerUid: 'different_user', // Not the requester
        coWriterUids: [], // Empty
      })
    );

    // No transaction mock needed - handler returns 403 before transaction

    await whatsappProxy.sendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'not_owner_or_cowriter',
      })
    );
    // Transaction should not be called for this case
    expect(mockFirestoreRunTransaction).not.toHaveBeenCalled();
  });

  it('should allow owner to send', async () => {
    const threadSnap = snap(true, {
      accountId: 'account123',
      ownerUid: 'user123', // Owner
      coWriterUids: [],
    });
    mockThreadRef.get.mockResolvedValue(threadSnap);

    // Reset transaction mocks
    mockTransaction.get.mockReset();
    // Mock transaction - thread first, then outbox
    mockTransaction.get
      .mockResolvedValueOnce(snap(false)) // Outbox check (not duplicate)
      .mockResolvedValueOnce(threadSnap); // Thread read in transaction

    await whatsappProxy.sendHandler(req, res);

    expect(mockFirestoreRunTransaction).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        duplicate: false,
      })
    );
  });

  it('should allow co-writer to send', async () => {
    const threadSnap = snap(true, {
      accountId: 'account123',
      ownerUid: 'different_user',
      coWriterUids: ['user123'], // Co-writer
    });
    mockThreadRef.get.mockResolvedValue(threadSnap);

    // Reset transaction mocks
    mockTransaction.get.mockReset();
    // Mock transaction - thread first, then outbox
    mockTransaction.get
      .mockResolvedValueOnce(snap(false)) // Outbox check (not duplicate)
      .mockResolvedValueOnce(threadSnap); // Thread read in transaction

    await whatsappProxy.sendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });

  it('should set ownerUid on first send', async () => {
    const threadSnap = snap(true, {
      accountId: 'account123',
      // No ownerUid (first send)
    });
    mockThreadRef.get.mockResolvedValue(threadSnap);

    // Mock transaction - thread first (still no ownerUid), then outbox
    const threadSnapInTx = snap(true, {
      accountId: 'account123',
      // Still no ownerUid in transaction
    });
    // Reset transaction mocks
    mockTransaction.get.mockReset();
    mockTransaction.get
      .mockResolvedValueOnce(snap(false)) // Outbox check (not duplicate)
      .mockResolvedValueOnce(threadSnapInTx); // Thread read in transaction

    await whatsappProxy.sendHandler(req, res);

    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerUid: 'user123',
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should return duplicate=true if outbox doc already exists (idempotency)', async () => {
    const threadSnap = snap(true, {
      accountId: 'account123',
      ownerUid: 'user123',
      coWriterUids: [],
    });
    mockThreadRef.get.mockResolvedValue(threadSnap);

    // Reset transaction mocks
    mockTransaction.get.mockReset();
    // Mock transaction - thread first, then outbox (exists = duplicate)
    mockTransaction.get
      .mockResolvedValueOnce(snap(true)) // Outbox exists (duplicate)
      .mockResolvedValueOnce(threadSnap); // Thread read in transaction (unused)

    await whatsappProxy.sendHandler(req, res);

    expect(mockTransaction.set).not.toHaveBeenCalled(); // Should not create duplicate
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        duplicate: true,
      })
    );
  });

  it('should generate deterministic requestId', async () => {
    const threadSnap = snap(true, {
      accountId: 'account123',
      ownerUid: 'user123',
      coWriterUids: [],
    });
    mockThreadRef.get.mockResolvedValue(threadSnap);

    // Reset transaction mocks
    mockTransaction.get.mockReset();
    // Mock transaction - thread first, then outbox
    mockTransaction.get
      .mockResolvedValueOnce(snap(false)) // Outbox check (not duplicate)
      .mockResolvedValueOnce(threadSnap); // Thread read in transaction

    await whatsappProxy.sendHandler(req, res);

    // Verify requestId is deterministic (same inputs = same requestId)
    const crypto = require('crypto');
    const expectedRequestId = crypto
      .createHash('sha256')
      .update(`${req.body.threadId}|${req.user.uid}|${req.body.clientMessageId}`)
      .digest('hex');

    expect(mockTransaction.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requestId: expectedRequestId,
      })
    );
  });
});

describe('WhatsApp Proxy - Lazy Loading (Module Import)', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = process.env.WHATSAPP_BACKEND_BASE_URL;
    originalEnv = originalEnv ? { WHATSAPP_BACKEND_BASE_URL: originalEnv } : {};
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv.WHATSAPP_BACKEND_BASE_URL) {
      process.env.WHATSAPP_BACKEND_BASE_URL = originalEnv.WHATSAPP_BACKEND_BASE_URL;
    } else {
      delete process.env.WHATSAPP_BACKEND_BASE_URL;
    }
    jest.resetModules();
  });

  it('should NOT throw when requiring index.js without WHATSAPP_BACKEND_BASE_URL', () => {
    // Unset env var
    delete process.env.WHATSAPP_BACKEND_BASE_URL;
    delete process.env.FIREBASE_CONFIG; // Also unset to avoid production check

    // Should not throw during require
    expect(() => {
      require('../index');
    }).not.toThrow();
  });

  it('should return 500 error when getAccountsHandler called without base URL', async () => {
    // Unset all possible backend URL env vars
    delete process.env.WHATSAPP_BACKEND_BASE_URL;
    delete process.env.WHATSAPP_BACKEND_URL;
    delete process.env.BACKEND_BASE_URL;
    delete process.env.FIREBASE_CONFIG;

    // Mock getBackendBaseUrl to return null (no default)
    jest.resetModules();
    jest.doMock('../lib/backend-url', () => ({
      getBackendBaseUrl: jest.fn(() => null),
    }));
    const whatsappProxy = require('../whatsappProxy');

    const req = {
      method: 'GET',
      headers: {
        authorization: 'Bearer mock-token',
      },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };

    mockVerifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com', // Super-admin
    });

    await whatsappProxy.getAccountsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'configuration_missing',
        message: expect.stringContaining('WHATSAPP_BACKEND_BASE_URL'),
      })
    );
  });

  it('should return 500 error when addAccountHandler called without base URL', async () => {
    // Delete all possible backend URL env vars
    delete process.env.WHATSAPP_BACKEND_BASE_URL;
    delete process.env.WHATSAPP_BACKEND_URL;
    delete process.env.BACKEND_BASE_URL;
    delete process.env.FIREBASE_CONFIG;

    // Mock getBackendBaseUrl to return null
    jest.resetModules();
    jest.mock('../lib/backend-url', () => ({
      getBackendBaseUrl: jest.fn(() => null),
    }));
    const whatsappProxy = require('../whatsappProxy');

    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer mock-token',
      },
      body: {
        name: 'Test Account',
        phone: '+407123456789',
      },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };

    mockVerifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com',
    });

    await whatsappProxy.addAccountHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'configuration_missing',
        message: expect.stringContaining('WHATSAPP_BACKEND_BASE_URL'),
      })
    );
  });

  it('should work correctly when base URL is set via process.env', async () => {
    // Set test env BEFORE resetting modules
    const savedEnv = process.env.WHATSAPP_BACKEND_BASE_URL;
    process.env.WHATSAPP_BACKEND_BASE_URL = 'https://test-backend.example.com';
    delete process.env.WHATSAPP_BACKEND_URL;
    delete process.env.BACKEND_BASE_URL;

    // Reset modules to pick up new env vars
    jest.resetModules();
    // Also reset the backend-url module mock if it exists
    jest.doMock('../lib/backend-url', () => ({
      getBackendBaseUrl: jest.fn(() => 'https://test-backend.example.com'),
    }));
    
    const whatsappProxy = require('../whatsappProxy');

    // Mock must be set AFTER module is loaded
    const mockForwardRequest = jest.fn().mockResolvedValue({
      statusCode: 200,
      body: { success: true, accounts: [] },
    });
    whatsappProxy._forwardRequest = mockForwardRequest;

    const req = {
      method: 'GET',
      headers: {
        authorization: 'Bearer mock-token',
      },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };

    mockVerifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com',
    });

    await whatsappProxy.getAccountsHandler(req, res);

    // Verify mock was called (it should be called via getForwardRequest())
    expect(mockForwardRequest).toHaveBeenCalled();
    expect(mockForwardRequest).toHaveBeenCalledWith(
      'https://test-backend.example.com/api/whatsapp/accounts',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    
    // Restore original env
    if (savedEnv) {
      process.env.WHATSAPP_BACKEND_BASE_URL = savedEnv;
    } else {
      delete process.env.WHATSAPP_BACKEND_BASE_URL;
    }
  });
});
