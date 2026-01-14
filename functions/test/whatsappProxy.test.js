'use strict';

/**
 * Unit tests for WhatsApp Proxy QR Connect endpoints
 * 
 * Tests authentication, authorization, input validation, and Railway forwarding.
 */

// Set env var before importing module (to avoid fail-fast in tests)
process.env.WHATSAPP_RAILWAY_BASE_URL = process.env.WHATSAPP_RAILWAY_BASE_URL || 'https://test-railway.invalid';
process.env.NODE_ENV = 'test';

const admin = require('firebase-admin');

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn(),
  };

  const mockAuth = {
    verifyIdToken: jest.fn(),
  };

  return {
    firestore: jest.fn(() => mockFirestore),
    auth: jest.fn(() => mockAuth),
    initializeApp: jest.fn(),
    apps: [],
  };
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

    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com', // Super-admin
    });
  });

  it('should reject unauthenticated requests', async () => {
    req.headers.authorization = null;
    admin.auth().verifyIdToken.mockResolvedValue(null);

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
    admin.auth().verifyIdToken.mockResolvedValue({
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

    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com', // Super-admin
    });
  });

  it('should reject unauthenticated requests', async () => {
    req.headers.authorization = null;
    admin.auth().verifyIdToken.mockResolvedValue(null);

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
    admin.auth().verifyIdToken.mockResolvedValue({
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

    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com',
    });
  });

  it('should reject unauthenticated requests', async () => {
    req.headers.authorization = null;
    admin.auth().verifyIdToken.mockResolvedValue(null);

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
    admin.auth().verifyIdToken.mockResolvedValue({
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
  let mockFirestore;
  let mockTransaction;

  beforeEach(() => {
    jest.resetModules();
    whatsappProxy = require('../whatsappProxy');

    // Mock Firestore with transaction support
    mockTransaction = {
      get: jest.fn(),
      set: jest.fn(),
      update: jest.fn(),
    };

    const mockThreadRef = {
      get: jest.fn(),
    };

    const mockOutboxRef = {
      get: jest.fn(),
    };

    const mockThreadCollection = {
      doc: jest.fn(() => mockThreadRef),
    };

    const mockOutboxCollection = {
      doc: jest.fn(() => mockOutboxRef),
    };

    mockFirestore = {
      collection: jest.fn((name) => {
        if (name === 'threads') return mockThreadCollection;
        if (name === 'outbox') return mockOutboxCollection;
        if (name === 'staffProfiles') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn(),
            })),
          };
        }
        return { doc: jest.fn() };
      }),
      runTransaction: jest.fn((callback) => {
        return callback(mockTransaction);
      }),
    };

    admin.firestore.mockReturnValue(mockFirestore);

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
      user: {
        uid: 'user123',
        email: 'employee@example.com',
      },
      employeeInfo: {
        isEmployee: true,
        role: 'staff',
      },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };

    // Mock auth
    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'user123',
      email: 'employee@example.com',
    });

    // Mock staffProfiles check (employee)
    const mockStaffDoc = {
      exists: true,
      data: () => ({ role: 'staff' }),
    };
    mockFirestore.collection('staffProfiles').doc().get.mockResolvedValue(mockStaffDoc);
  });

  it('should reject unauthenticated requests', async () => {
    req.headers.authorization = null;
    admin.auth().verifyIdToken.mockResolvedValue(null);

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
    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'user123',
      email: 'user@example.com',
    });

    // Mock staffProfiles check (not employee)
    const mockStaffDoc = {
      exists: false,
    };
    mockFirestore.collection('staffProfiles').doc().get.mockResolvedValue(mockStaffDoc);

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
    mockFirestore.collection('threads').doc().get.mockResolvedValue(mockThreadDoc);

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
    mockFirestore.collection('threads').doc().get.mockResolvedValue(mockThreadDoc);

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
    mockFirestore.collection('threads').doc().get.mockResolvedValue(mockThreadDoc);

    // Mock transaction
    mockTransaction.get.mockResolvedValue(mockThreadDoc);

    await whatsappProxy.sendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'not_owner_or_cowriter',
      })
    );
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
    mockFirestore.collection('threads').doc().get.mockResolvedValue(mockThreadDoc);

    // Mock transaction
    const mockOutboxDoc = {
      exists: false, // Not duplicate
    };
    mockTransaction.get
      .mockResolvedValueOnce(mockThreadDoc) // Thread read
      .mockResolvedValueOnce(mockOutboxDoc); // Outbox check

    await whatsappProxy.sendHandler(req, res);

    expect(mockFirestore.runTransaction).toHaveBeenCalled();
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
    mockFirestore.collection('threads').doc().get.mockResolvedValue(mockThreadDoc);

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
    mockFirestore.collection('threads').doc().get.mockResolvedValue(mockThreadDoc);

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
    mockFirestore.collection('threads').doc().get.mockResolvedValue(mockThreadDoc);

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
    mockFirestore.collection('threads').doc().get.mockResolvedValue(mockThreadDoc);

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
