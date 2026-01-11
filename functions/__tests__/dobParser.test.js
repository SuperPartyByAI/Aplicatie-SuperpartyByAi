const { parseDOB, calculateYearFromAge } = require('../dobParser');

describe('dobParser', () => {
  describe('parseDOB', () => {
    test('parses complete DOB (DD-MM-YYYY)', () => {
      const result = parseDOB('15-01-2020', null, '15-01-2026');
      
      expect(result.valid).toBe(true);
      expect(result.dob).toBe('15-01-2020');
      expect(result.missingYear).toBe(false);
    });

    test('parses partial DOB (DD-MM) with age', () => {
      const result = parseDOB('15-01', 6, '15-01-2026');
      
      expect(result.valid).toBe(true);
      expect(result.dob).toBe('15-01-2020');
      expect(result.missingYear).toBe(true);
      expect(result.needsConfirmation).toBe(true);
    });

    test('rejects partial DOB without age', () => {
      const result = parseDOB('15-01', null, '15-01-2026');
      
      expect(result.valid).toBe(false);
      expect(result.missingYear).toBe(true);
      expect(result.error).toContain('vârsta');
    });

    test('rejects invalid format', () => {
      const result = parseDOB('invalid', null, '15-01-2026');
      
      expect(result.valid).toBe(false);
    });

    test('rejects empty input', () => {
      const result = parseDOB('', null, '15-01-2026');
      
      expect(result.valid).toBe(false);
    });
  });

  describe('calculateYearFromAge', () => {
    test('calculates birth year correctly', () => {
      const year = calculateYearFromAge(6, '15-01-2026');
      expect(year).toBe(2020);
    });

    test('calculates birth year for different ages', () => {
      expect(calculateYearFromAge(5, '15-01-2026')).toBe(2021);
      expect(calculateYearFromAge(10, '15-01-2026')).toBe(2016);
    });
  });
});
