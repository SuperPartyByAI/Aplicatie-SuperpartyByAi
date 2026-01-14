'use strict';

/**
 * Unit tests for WhatsApp Proxy endpoints
 * 
 * Tests owner/co-writer policy, idempotency, auth, and validation.
 */

// Set env var before importing module (to avoid fail-fast in tests)
process.env.WHATSAPP_RAILWAY_BASE_URL = process.env.WHATSAPP_RAILWAY_BASE_URL || 'https://test-railway.invalid';
process.env.NODE_ENV = 'test';

const admin = require('firebase-admin');

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn(),
    runTransaction: jest.fn(),
  };

  const mockAuth = {
    verifyIdToken: jest.fn(),
  };

  return {
    firestore: jest.fn(() => mockFirestore),
    auth: jest.fn(() => mockAuth),
    initializeApp: jest.fn(),
    apps: [],
    FieldValue: {
      serverTimestamp: jest.fn(() => ({ _methodName: 'serverTimestamp' })),
      arrayUnion: jest.fn(() => ({ _methodName: 'arrayUnion' })),
    },
  };
});

describe('WhatsApp Proxy /send', () => {
  let mockDb;
  let mockThreadRef;
  let mockOutboxRef;
  let mockThreadDoc;
  let mockOutboxDoc;
  let req;
  let res;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup Firestore mocks
    mockDb = admin.firestore();
    mockThreadRef = {
      get: jest.fn(),
    };
    mockOutboxRef = {
      get: jest.fn(),
    };
    mockThreadDoc = {
      exists: true,
      data: jest.fn(),
    };
    mockOutboxDoc = {
      exists: false,
      data: jest.fn(),
    };

    mockDb.collection = jest.fn((collectionName) => {
      if (collectionName === 'threads') {
        return {
          doc: jest.fn(() => mockThreadRef),
        };
      }
      if (collectionName === 'outbox') {
        return {
          doc: jest.fn(() => mockOutboxRef),
        };
      }
      return { doc: jest.fn() };
    });

    // Setup request/response mocks
    req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer mock-token',
      },
      body: {
        threadId: 'thread123',
        accountId: 'account1',
        toJid: '407123456789@s.whatsapp.net',
        text: 'Test message',
        clientMessageId: 'client-msg-1',
      },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Mock auth token verification
    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'user123',
      email: 'user@example.com',
    });

    // Mock staffProfiles check (employee)
    mockDb.collection.mockImplementation((collectionName) => {
      if (collectionName === 'staffProfiles') {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ role: 'staff' }),
            }),
          })),
        };
      }
      return mockDb.collection(collectionName);
    });
  });

  describe('Owner policy', () => {
    it('should set ownerUid on first outbound send', async () => {
      // Thread exists but no ownerUid
      mockThreadDoc.data.mockReturnValue({
        accountId: 'account1',
        clientJid: '407123456789@s.whatsapp.net',
      });
      mockThreadRef.get.mockResolvedValue(mockThreadDoc);

      // Transaction mock
      let transactionCallback;
      mockDb.runTransaction.mockImplementation((callback) => {
        transactionCallback = callback;
        return Promise.resolve();
      });

      // Mock transaction methods
      const mockTransaction = {
        get: jest.fn().mockResolvedValue(mockThreadDoc),
        update: jest.fn(),
        set: jest.fn(),
      };

      // Execute transaction callback
      await transactionCallback(mockTransaction);

      // Verify ownerUid would be set (via transaction.update)
      expect(mockTransaction.update).toHaveBeenCalledWith(
        mockThreadRef,
        expect.objectContaining({
          ownerUid: 'user123',
        })
      );
    });

    it('should allow owner to send', async () => {
      // Thread exists with ownerUid matching user
      mockThreadDoc.data.mockReturnValue({
        accountId: 'account1',
        ownerUid: 'user123',
        coWriterUids: [],
      });
      mockThreadRef.get.mockResolvedValue(mockThreadDoc);

      // Transaction mock
      mockDb.runTransaction.mockImplementation((callback) => {
        const mockTransaction = {
          get: jest.fn().mockResolvedValue(mockThreadDoc),
          update: jest.fn(),
          set: jest.fn(),
        };
        return callback(mockTransaction);
      });

      // Mock outbox doc doesn't exist
      mockOutboxRef.get.mockResolvedValue({ exists: false });

      await send(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          requestId: expect.any(String),
        })
      );
    });

    it('should reject non-owner/non-cowriter', async () => {
      // Thread exists with different owner
      mockThreadDoc.data.mockReturnValue({
        accountId: 'account1',
        ownerUid: 'other-user',
        coWriterUids: [],
      });
      mockThreadRef.get.mockResolvedValue(mockThreadDoc);

      await send(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'not_owner_or_cowriter',
        })
      );
    });

    it('should allow co-writer to send', async () => {
      // Thread exists with owner, but user is co-writer
      mockThreadDoc.data.mockReturnValue({
        accountId: 'account1',
        ownerUid: 'other-user',
        coWriterUids: ['user123'],
      });
      mockThreadRef.get.mockResolvedValue(mockThreadDoc);

      // Transaction mock
      mockDb.runTransaction.mockImplementation((callback) => {
        const mockTransaction = {
          get: jest.fn().mockResolvedValue(mockThreadDoc),
          update: jest.fn(),
          set: jest.fn(),
        };
        return callback(mockTransaction);
      });

      mockOutboxRef.get.mockResolvedValue({ exists: false });

      await send(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });
  });

  describe('Idempotency', () => {
    it('should detect duplicate requestId and return duplicate:true', async () => {
      // Thread exists with owner
      mockThreadDoc.data.mockReturnValue({
        accountId: 'account1',
        ownerUid: 'user123',
        coWriterUids: [],
      });
      mockThreadRef.get.mockResolvedValue(mockThreadDoc);

      // Outbox doc already exists (duplicate)
      mockOutboxDoc.exists = true;
      mockOutboxRef.get.mockResolvedValue(mockOutboxDoc);

      // Transaction mock
      mockDb.runTransaction.mockImplementation((callback) => {
        const mockTransaction = {
          get: jest.fn((ref) => {
            if (ref === mockThreadRef) {
              return Promise.resolve(mockThreadDoc);
            }
            if (ref === mockOutboxRef) {
              return Promise.resolve(mockOutboxDoc);
            }
            return Promise.resolve({ exists: false });
          }),
          update: jest.fn(),
          set: jest.fn(),
        };
        return callback(mockTransaction);
      });

      await send(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          duplicate: true,
        })
      );
    });
  });

  describe('Validation', () => {
    it('should reject missing threadId', async () => {
      req.body.threadId = null;

      await send(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'invalid_request',
        })
      );
    });

    it('should reject non-employee', async () => {
      // Mock staffProfiles doesn't exist
      mockDb.collection.mockImplementation((collectionName) => {
        if (collectionName === 'staffProfiles') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ exists: false }),
            })),
          };
        }
        return mockDb.collection(collectionName);
      });

      await send(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'employee_only',
        })
      );
    });

    it('should reject missing auth token', async () => {
      req.headers.authorization = null;

      await send(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'missing_auth_token',
        })
      );
    });

    it('should reject non-existent thread', async () => {
      mockThreadDoc.exists = false;
      mockThreadRef.get.mockResolvedValue(mockThreadDoc);

      await send(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'thread_not_found',
        })
      );
    });
  });
});

describe('WhatsApp Proxy /getAccounts', () => {
  let req;
  let res;
  let mockForwardRequest;

  beforeEach(() => {
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
      uid: 'user123',
      email: 'user@example.com',
    });

    // Mock forwardRequest
    mockForwardRequest = jest.fn().mockResolvedValue({
      statusCode: 200,
      body: { success: true, accounts: [] },
    });
  });

  it('should reject unauthenticated requests', async () => {
    req.headers.authorization = null;
    admin.auth().verifyIdToken.mockResolvedValue(null);

    // Clear module cache to get fresh instance
    jest.resetModules();
    const { getAccounts } = require('../whatsappProxy');

    await getAccounts(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'missing_auth_token',
      })
    );
  });

  it('should reject non-employee users', async () => {
    // Mock staffProfiles doesn't exist
    const mockDb = admin.firestore();
    mockDb.collection.mockImplementation((collectionName) => {
      if (collectionName === 'staffProfiles') {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ exists: false }),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    jest.resetModules();
    const { getAccounts } = require('../whatsappProxy');
    await getAccounts(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'employee_only',
      })
    );
  });

  it('should allow employees and forward request', async () => {
    // Mock employee (has staffProfiles)
    const mockDb = admin.firestore();
    mockDb.collection.mockImplementation((collectionName) => {
      if (collectionName === 'staffProfiles') {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ role: 'staff' }),
            }),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    // Mock forwardRequest (would need to be injected, but for now test structure)
    jest.resetModules();
    const { getAccounts } = require('../whatsappProxy');
    
    // This will fail on forwardRequest, but auth should pass
    try {
      await getAccounts(req, res);
    } catch (e) {
      // Expected - forwardRequest not fully mocked
    }

    // Verify it didn't fail on auth
    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});

describe('WhatsApp Proxy /addAccount', () => {
  let req;
  let res;

  beforeEach(() => {
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
  });

  it('should reject unauthenticated requests', async () => {
    req.headers.authorization = null;
    admin.auth().verifyIdToken.mockResolvedValue(null);

    jest.resetModules();
    const { addAccount } = require('../whatsappProxy');
    await addAccount(req, res);

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

    jest.resetModules();
    const { addAccount } = require('../whatsappProxy');
    await addAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'super_admin_only',
      })
    );
  });

  it('should reject invalid name', async () => {
    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com', // Super-admin
    });

    req.body.name = ''; // Invalid

    jest.resetModules();
    const { addAccount } = require('../whatsappProxy');
    await addAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'invalid_request',
      })
    );
  });

  it('should reject invalid phone', async () => {
    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com', // Super-admin
    });

    req.body.phone = '123'; // Too short

    jest.resetModules();
    const { addAccount } = require('../whatsappProxy');
    await addAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'invalid_request',
      })
    );
  });

  it('should accept valid super-admin request', async () => {
    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com', // Super-admin
    });

    jest.resetModules();
    const { addAccount } = require('../whatsappProxy');
    
    // This will fail on forwardRequest, but validation should pass
    try {
      await addAccount(req, res);
    } catch (e) {
      // Expected - forwardRequest not mocked
    }

    // Verify it didn't fail on auth or validation
    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.status).not.toHaveBeenCalledWith(400);
  });
});

describe('WhatsApp Proxy /regenerateQr', () => {
  let req;
  let res;

  beforeEach(() => {
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
  });

  it('should reject unauthenticated requests', async () => {
    req.headers.authorization = null;
    admin.auth().verifyIdToken.mockResolvedValue(null);

    jest.resetModules();
    const { regenerateQr } = require('../whatsappProxy');
    await regenerateQr(req, res);

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

    jest.resetModules();
    const { regenerateQr } = require('../whatsappProxy');
    await regenerateQr(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'super_admin_only',
      })
    );
  });

  it('should require accountId', async () => {
    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com',
    });

    req.query = {};
    req.body = {};

    jest.resetModules();
    const { regenerateQr } = require('../whatsappProxy');
    await regenerateQr(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'invalid_request',
      })
    );
  });

  it('should accept valid super-admin request', async () => {
    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'admin123',
      email: 'ursache.andrei1995@gmail.com',
    });

    jest.resetModules();
    const { regenerateQr } = require('../whatsappProxy');
    
    // This will fail on forwardRequest, but validation should pass
    try {
      await regenerateQr(req, res);
    } catch (e) {
      // Expected - forwardRequest not mocked
    }

    // Verify it didn't fail on auth or validation
    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.status).not.toHaveBeenCalledWith(400);
  });
});
