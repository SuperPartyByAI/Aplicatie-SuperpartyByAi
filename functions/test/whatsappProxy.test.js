'use strict';

/**
 * Unit tests for WhatsApp Proxy QR Connect endpoints
 * 
 * Tests authentication, authorization, input validation, and Railway forwarding.
 */

// Set env var before importing module (to avoid fail-fast in tests)
// Note: For lazy-loading tests, we'll unset this to test missing config behavior
process.env.WHATSAPP_RAILWAY_BASE_URL = process.env.WHATSAPP_RAILWAY_BASE_URL || 'https://test-railway.invalid';
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
  collection: jest.fn((name) => {
    if (name === 'staffProfiles') {
      return {
        doc: jest.fn(() => ({
          get: jest.fn(),
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
  return {
    firestore: jest.fn(() => mockFirestore),
    auth: jest.fn(() => mockAuth),
    initializeApp: jest.fn(),
    apps: [],
  };
});

const admin = require('firebase-admin');

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
        error: 'missing_auth_token',
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

  it('should allow super-admin and forward request', async () => {
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

    await whatsappProxy.addAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'missing_auth_token',
      })
    );
  });

  it('should reject non-super-admin', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'user123',
      email: 'user@example.com', // Not super-admin
    });

    await whatsappProxy.addAccount(req, res);

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

    await whatsappProxy.addAccount(req, res);

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

    await whatsappProxy.addAccount(req, res);

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

    await whatsappProxy.addAccount(req, res);

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
        error: 'missing_auth_token',
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

    mockStaffCollection = {
      doc: jest.fn(() => ({
        get: jest.fn(),
      })),
    };

    // Override global mock for this test suite
    mockFirestore.collection.mockImplementation((name) => {
      if (name === 'threads') return mockThreadCollection;
      if (name === 'outbox') return mockOutboxCollection;
      if (name === 'staffProfiles') return mockStaffCollection;
      return { doc: jest.fn() };
    });

    mockFirestoreRunTransaction.mockImplementation(async (callback) => {
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

    // Mock staffProfiles check (employee)
    const mockStaffDoc = {
      exists: true,
      data: () => ({ role: 'staff' }),
    };
    // Use the mock staff collection from beforeEach
    mockStaffCollection.doc().get.mockResolvedValue(mockStaffDoc);
  });

  it('should reject unauthenticated requests', async () => {
    req.headers.authorization = null;
    mockVerifyIdToken.mockResolvedValue(null);

    await whatsappProxy.sendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'missing_auth_token',
      })
    );
  });

  it('should reject non-employee', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'user123',
      email: 'user@example.com',
    });

    // Mock staffProfiles check (not employee)
    const mockStaffDoc = {
      exists: false,
    };
    // Use the mock staff collection from beforeEach
    mockStaffCollection.doc().get.mockResolvedValue(mockStaffDoc);

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

    await whatsappProxy.sendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'invalid_request',
      })
    );
  });

  it('should reject if thread does not exist', async () => {
    const mockThreadDoc = {
      exists: false,
    };
    mockThreadRef.get.mockResolvedValue(mockThreadDoc);

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
    const mockThreadDoc = {
      exists: true,
      data: () => ({
        accountId: 'different_account', // Mismatch
      }),
    };
    mockThreadRef.get.mockResolvedValue(mockThreadDoc);

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
    const mockThreadDoc = {
      exists: true,
      data: () => ({
        accountId: 'account123',
        ownerUid: 'different_user', // Not the requester
        coWriterUids: [], // Empty
      }),
    };
    mockThreadRef.get.mockResolvedValue(mockThreadDoc);

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
    const mockThreadDoc = {
      exists: true,
      data: () => ({
        accountId: 'account123',
        ownerUid: 'user123', // Owner
        coWriterUids: [],
      }),
    };
    mockThreadRef.get.mockResolvedValue(mockThreadDoc);

    // Mock transaction
    const mockOutboxDoc = {
      exists: false, // Not duplicate
    };
    mockTransaction.get
      .mockResolvedValueOnce(mockThreadDoc) // Thread read
      .mockResolvedValueOnce(mockOutboxDoc); // Outbox check

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
    const mockThreadDoc = {
      exists: true,
      data: () => ({
        accountId: 'account123',
        ownerUid: 'different_user',
        coWriterUids: ['user123'], // Co-writer
      }),
    };
    mockThreadRef.get.mockResolvedValue(mockThreadDoc);

    // Mock transaction
    const mockOutboxDoc = {
      exists: false,
    };
    mockTransaction.get
      .mockResolvedValueOnce(mockThreadDoc)
      .mockResolvedValueOnce(mockOutboxDoc);

    await whatsappProxy.sendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });

  it('should set ownerUid on first send', async () => {
    const mockThreadDoc = {
      exists: true,
      data: () => ({
        accountId: 'account123',
        // No ownerUid (first send)
      }),
    };
    mockThreadRef.get.mockResolvedValue(mockThreadDoc);

    // Mock transaction
    const mockThreadDocInTx = {
      exists: true,
      data: () => ({
        accountId: 'account123',
        // Still no ownerUid in transaction
      }),
    };
    const mockOutboxDoc = {
      exists: false,
    };
    mockTransaction.get
      .mockResolvedValueOnce(mockThreadDocInTx)
      .mockResolvedValueOnce(mockOutboxDoc);

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
    const mockThreadDoc = {
      exists: true,
      data: () => ({
        accountId: 'account123',
        ownerUid: 'user123',
        coWriterUids: [],
      }),
    };
    mockThreadRef.get.mockResolvedValue(mockThreadDoc);

    // Mock transaction - outbox doc exists (duplicate)
    const mockOutboxDoc = {
      exists: true, // Already exists
    };
    mockTransaction.get
      .mockResolvedValueOnce(mockThreadDoc)
      .mockResolvedValueOnce(mockOutboxDoc);

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
    const mockThreadDoc = {
      exists: true,
      data: () => ({
        accountId: 'account123',
        ownerUid: 'user123',
        coWriterUids: [],
      }),
    };
    mockThreadRef.get.mockResolvedValue(mockThreadDoc);

    const mockOutboxDoc = {
      exists: false,
    };
    mockTransaction.get
      .mockResolvedValueOnce(mockThreadDoc)
      .mockResolvedValueOnce(mockOutboxDoc);

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
    originalEnv = process.env.WHATSAPP_RAILWAY_BASE_URL;
    originalEnv = originalEnv ? { WHATSAPP_RAILWAY_BASE_URL: originalEnv } : {};
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv.WHATSAPP_RAILWAY_BASE_URL) {
      process.env.WHATSAPP_RAILWAY_BASE_URL = originalEnv.WHATSAPP_RAILWAY_BASE_URL;
    } else {
      delete process.env.WHATSAPP_RAILWAY_BASE_URL;
    }
    jest.resetModules();
  });

  it('should NOT throw when requiring index.js without WHATSAPP_RAILWAY_BASE_URL', () => {
    // Unset env var
    delete process.env.WHATSAPP_RAILWAY_BASE_URL;
    delete process.env.FIREBASE_CONFIG; // Also unset to avoid production check

    // Should not throw during require
    expect(() => {
      require('../index');
    }).not.toThrow();
  });

  it('should return 500 error when getAccountsHandler called without base URL', async () => {
    // Unset env var
    delete process.env.WHATSAPP_RAILWAY_BASE_URL;
    delete process.env.FIREBASE_CONFIG;

    jest.resetModules();
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
        message: expect.stringContaining('WHATSAPP_RAILWAY_BASE_URL'),
      })
    );
  });

  it('should return 500 error when addAccountHandler called without base URL', async () => {
    delete process.env.WHATSAPP_RAILWAY_BASE_URL;
    delete process.env.FIREBASE_CONFIG;

    jest.resetModules();
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
        message: expect.stringContaining('WHATSAPP_RAILWAY_BASE_URL'),
      })
    );
  });

  it('should work correctly when base URL is set via process.env', async () => {
    process.env.WHATSAPP_RAILWAY_BASE_URL = 'https://test-railway.example.com';

    jest.resetModules();
    const whatsappProxy = require('../whatsappProxy');

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

    expect(mockForwardRequest).toHaveBeenCalledWith(
      'https://test-railway.example.com/api/whatsapp/accounts',
      expect.any(Object)
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
