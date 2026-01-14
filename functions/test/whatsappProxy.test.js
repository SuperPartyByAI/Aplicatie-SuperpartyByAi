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

    await whatsappProxy.getAccounts(req, res);

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

    await whatsappProxy.getAccounts(req, res);

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

    await whatsappProxy.getAccounts(req, res);

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

    await whatsappProxy.regenerateQr(req, res);

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

    await whatsappProxy.regenerateQr(req, res);

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

    await whatsappProxy.regenerateQr(req, res);

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

    await whatsappProxy.regenerateQr(req, res);

    expect(mockForwardRequest).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });
});
