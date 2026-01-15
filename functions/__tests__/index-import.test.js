'use strict';

/**
 * Test that index.js can be required without throwing when env vars are missing
 * This ensures Firebase emulator can analyze the codebase without crashing
 */

// Mock Firebase Admin BEFORE any requires (Jest hoisting)
jest.mock('firebase-admin', () => {
  const mockFirestore = jest.fn(() => ({
    collection: jest.fn(),
  }));
  const mockAuth = jest.fn(() => ({
    verifyIdToken: jest.fn(),
  }));
  return {
    initializeApp: jest.fn(),
    apps: [],
    firestore: mockFirestore,
    auth: mockAuth,
  };
});

describe('index.js Module Import', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original env vars
    originalEnv = {
      WHATSAPP_RAILWAY_BASE_URL: process.env.WHATSAPP_RAILWAY_BASE_URL,
      FIREBASE_CONFIG: process.env.FIREBASE_CONFIG,
      NODE_ENV: process.env.NODE_ENV,
    };
  });

  afterEach(() => {
    // Restore original env vars
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    });
    jest.resetModules();
  });

  it('should NOT throw when requiring index.js without WHATSAPP_RAILWAY_BASE_URL', () => {
    // Unset env vars that could cause import-time errors
    delete process.env.WHATSAPP_RAILWAY_BASE_URL;
    delete process.env.FIREBASE_CONFIG;
    process.env.NODE_ENV = 'test';

    // Should not throw during require (lazy loading prevents error)
    expect(() => {
      require('../index');
    }).not.toThrow();
  });

  it('should NOT throw when requiring index.js with FIREBASE_CONFIG set (emulator scenario)', () => {
    // Simulate Firebase emulator environment
    delete process.env.WHATSAPP_RAILWAY_BASE_URL;
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'test-project' });
    process.env.NODE_ENV = 'development';

    // Should not throw (lazy loading prevents error)
    expect(() => {
      require('../index');
    }).not.toThrow();
  });

  it('should NOT throw when requiring whatsappProxy.js without WHATSAPP_RAILWAY_BASE_URL', () => {
    // Unset env vars
    delete process.env.WHATSAPP_RAILWAY_BASE_URL;
    delete process.env.FIREBASE_CONFIG;
    process.env.NODE_ENV = 'test';

    // whatsappProxy should not throw at import time
    expect(() => {
      require('../whatsappProxy');
    }).not.toThrow();
  });
});
