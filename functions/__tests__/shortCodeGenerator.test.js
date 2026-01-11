'use strict';

const ShortCodeGenerator = require('../shortCodeGenerator');
const { getNextFreeSlot } = require('../shortCodeGenerator');

describe('ShortCodeGenerator', () => {
  let generator;
  let mockDb;

  beforeEach(() => {
    // Mock Firestore
    mockDb = {
      collection: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnThis(),
      get: jest.fn(),
      set: jest.fn(),
      update: jest.fn(),
      runTransaction: jest.fn(),
    };

    generator = new ShortCodeGenerator(mockDb);
  });

  describe('generateRoleSlot', () => {
    it('should generate first slot as A', () => {
      const slot = generator.generateRoleSlot([]);
      expect(slot).toBe('A');
    });

    it('should generate next available slot', () => {
      const existingRoles = [
        { slot: 'A' },
        { slot: 'B' },
      ];
      
      const slot = generator.generateRoleSlot(existingRoles);
      expect(slot).toBe('C');
    });

    it('should skip used slots', () => {
      const existingRoles = [
        { slot: 'A' },
        { slot: 'C' },
      ];
      
      const slot = generator.generateRoleSlot(existingRoles);
      expect(slot).toBe('B');
    });

    it('should throw error when all slots used', () => {
      const existingRoles = Array.from({ length: 26 }, (_, i) => ({
        slot: String.fromCharCode(65 + i), // A-Z
      }));
      
      expect(() => generator.generateRoleSlot(existingRoles)).toThrow(
        'Maximum number of roles (26) reached'
      );
    });
  });

  describe('generateRoleCode', () => {
    it('should combine event short code and slot', () => {
      const roleCode = generator.generateRoleCode('01', 'A');
      expect(roleCode).toBe('01A');
    });

    it('should work with different codes', () => {
      expect(generator.generateRoleCode('05', 'B')).toBe('05B');
      expect(generator.generateRoleCode('99', 'Z')).toBe('99Z');
    });

    it('should throw error if missing parameters', () => {
      expect(() => generator.generateRoleCode('', 'A')).toThrow();
      expect(() => generator.generateRoleCode('01', '')).toThrow();
    });
  });

  describe('parseRoleCode', () => {
    it('should parse valid role code', () => {
      const parsed = generator.parseRoleCode('01A');
      
      expect(parsed).toEqual({
        eventShortCode: '01',
        slot: 'A',
      });
    });

    it('should parse different codes', () => {
      expect(generator.parseRoleCode('05B')).toEqual({
        eventShortCode: '05',
        slot: 'B',
      });
      
      expect(generator.parseRoleCode('99Z')).toEqual({
        eventShortCode: '99',
        slot: 'Z',
      });
    });

    it('should return null for invalid codes', () => {
      expect(generator.parseRoleCode('1A')).toBeNull(); // Only 1 digit
      expect(generator.parseRoleCode('01a')).toBeNull(); // Lowercase
      expect(generator.parseRoleCode('0AB')).toBeNull(); // Wrong format
      expect(generator.parseRoleCode('')).toBeNull();
    });
  });

  describe('isValidEventShortCode', () => {
    it('should validate correct format', () => {
      expect(generator.isValidEventShortCode('01')).toBe(true);
      expect(generator.isValidEventShortCode('99')).toBe(true);
      expect(generator.isValidEventShortCode('00')).toBe(true);
    });

    it('should reject invalid format', () => {
      expect(generator.isValidEventShortCode('1')).toBe(false);
      expect(generator.isValidEventShortCode('001')).toBe(false);
      expect(generator.isValidEventShortCode('A1')).toBe(false);
      expect(generator.isValidEventShortCode('')).toBe(false);
    });
  });

  describe('isValidRoleCode', () => {
    it('should validate correct format', () => {
      expect(generator.isValidRoleCode('01A')).toBe(true);
      expect(generator.isValidRoleCode('99Z')).toBe(true);
      expect(generator.isValidRoleCode('00B')).toBe(true);
    });

    it('should reject invalid format', () => {
      expect(generator.isValidRoleCode('1A')).toBe(false);
      expect(generator.isValidRoleCode('01a')).toBe(false);
      expect(generator.isValidRoleCode('001A')).toBe(false);
      expect(generator.isValidRoleCode('01')).toBe(false);
      expect(generator.isValidRoleCode('')).toBe(false);
    });
  });

  describe('getNextFreeSlot (V3 helper)', () => {
    it('should generate first slot for numeric eventShortId', () => {
      const slot = getNextFreeSlot(1, {});
      expect(slot).toBe('01A');
    });

    it('should generate next available slot', () => {
      const existingSlots = {
        '01A': {},
        '01B': {},
      };
      
      const slot = getNextFreeSlot(1, existingSlots);
      expect(slot).toBe('01C');
    });

    it('should handle larger event IDs', () => {
      const slot = getNextFreeSlot(42, {});
      expect(slot).toBe('42A');
    });

    it('should throw error when all slots used', () => {
      const existingSlots = {};
      for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i);
        existingSlots[`01${letter}`] = {};
      }
      
      expect(() => getNextFreeSlot(1, existingSlots)).toThrow(
        'Maximum number of roles (26) reached'
      );
    });
  });
});
