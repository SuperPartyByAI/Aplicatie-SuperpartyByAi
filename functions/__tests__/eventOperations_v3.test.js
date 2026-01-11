'use strict';

const admin = require('firebase-admin');

// Initialize Firebase for tests
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'test-project',
  });
}

const { allocateSlot } = require('../eventOperations_v3');

describe('Event Operations V3', () => {
  describe('allocateSlot', () => {
    it('should allocate first slot', () => {
      const slot = allocateSlot(1, {});
      expect(slot).toBe('01A');
    });
    
    it('should allocate next available slot', () => {
      const existing = {
        '01A': {},
        '01B': {},
      };
      const slot = allocateSlot(1, existing);
      expect(slot).toBe('01C');
    });
    
    it('should NOT reuse archived slots', () => {
      const existing = {
        '01A': { status: 'ARCHIVED' },
        '01B': {},
      };
      const slot = allocateSlot(1, existing);
      expect(slot).toBe('01C'); // NOT 01A
    });
    
    it('should throw when 26 slots used', () => {
      const existing = {};
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      for (let i = 0; i < 26; i++) {
        existing[`01${alphabet[i]}`] = {};
      }
      
      expect(() => allocateSlot(1, existing)).toThrow('Maximum 26 roles');
    });
  });
  

});
