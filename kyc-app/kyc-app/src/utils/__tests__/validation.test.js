import { describe, it, expect } from 'vitest';
import { isValidEmail, isValidPassword, isValidCNP } from '../validation.js';

describe('Validation Functions', () => {
  describe('isValidEmail', () => {
    it('acceptă email valid', () => {
      expect(isValidEmail('test@test.com')).toBe(true);
      expect(isValidEmail('user@example.ro')).toBe(true);
    });

    it('respinge email invalid', () => {
      expect(isValidEmail('test')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('@test.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('isValidPassword', () => {
    it('acceptă parolă validă (min 6 caractere)', () => {
      expect(isValidPassword('parola123')).toBe(true);
      expect(isValidPassword('123456')).toBe(true);
    });

    it('respinge parolă invalidă', () => {
      expect(isValidPassword('12345')).toBe(false);
      expect(isValidPassword('abc')).toBe(false);
      expect(isValidPassword('')).toBe(false);
    });
  });

  describe('isValidCNP', () => {
    it('acceptă CNP valid (13 cifre)', () => {
      expect(isValidCNP('1234567890123')).toBe(true);
      expect(isValidCNP('5030515123456')).toBe(true);
    });

    it('respinge CNP invalid', () => {
      expect(isValidCNP('123')).toBe(false);
      expect(isValidCNP('12345678901234')).toBe(false); // 14 cifre
      expect(isValidCNP('123456789012a')).toBe(false); // conține literă
      expect(isValidCNP('')).toBe(false);
    });
  });
});
