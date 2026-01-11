const { isAffirmative, isNegative } = require('../confirmationParser');

describe('confirmationParser', () => {
  describe('isAffirmative', () => {
    test('recognizes "da"', () => {
      expect(isAffirmative('da')).toBe(true);
      expect(isAffirmative('Da')).toBe(true);
      expect(isAffirmative('DA')).toBe(true);
      expect(isAffirmative('da.')).toBe(true);
    });

    test('recognizes "confirm"', () => {
      expect(isAffirmative('confirm')).toBe(true);
      expect(isAffirmative('confirmă')).toBe(true);
      expect(isAffirmative('confirma')).toBe(true);
    });

    test('recognizes "corect"', () => {
      expect(isAffirmative('corect')).toBe(true);
      expect(isAffirmative('Corect')).toBe(true);
    });

    test('recognizes "exact"', () => {
      expect(isAffirmative('exact')).toBe(true);
      expect(isAffirmative('Exact!')).toBe(true);
    });

    test('recognizes "e ok"', () => {
      expect(isAffirmative('e ok')).toBe(true);
      expect(isAffirmative('E ok')).toBe(true);
    });

    test('recognizes "sigur"', () => {
      expect(isAffirmative('sigur')).toBe(true);
      expect(isAffirmative('Sigur')).toBe(true);
    });

    test('recognizes English affirmatives', () => {
      expect(isAffirmative('yes')).toBe(true);
      expect(isAffirmative('ok')).toBe(true);
      expect(isAffirmative('sure')).toBe(true);
    });

    test('recognizes affirmative with extra text', () => {
      expect(isAffirmative('da, confirm')).toBe(true);
      expect(isAffirmative('corect, așa e')).toBe(true);
    });

    test('rejects non-affirmative', () => {
      expect(isAffirmative('nu')).toBe(false);
      expect(isAffirmative('poate')).toBe(false);
      expect(isAffirmative('nu știu')).toBe(false);
    });

    test('rejects empty input', () => {
      expect(isAffirmative('')).toBe(false);
      expect(isAffirmative(null)).toBe(false);
    });
  });

  describe('isNegative', () => {
    test('recognizes "nu"', () => {
      expect(isNegative('nu')).toBe(true);
      expect(isNegative('Nu')).toBe(true);
      expect(isNegative('NU')).toBe(true);
    });

    test('recognizes "no"', () => {
      expect(isNegative('no')).toBe(true);
      expect(isNegative('nope')).toBe(true);
    });

    test('recognizes "anulează"', () => {
      expect(isNegative('anulează')).toBe(true);
      expect(isNegative('anuleaza')).toBe(true);
    });

    test('rejects non-negative', () => {
      expect(isNegative('da')).toBe(false);
      expect(isNegative('ok')).toBe(false);
    });
  });
});
