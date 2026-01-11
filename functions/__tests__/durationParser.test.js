const { parseDuration } = require('../durationParser');

describe('parseDuration', () => {
  test('parses "2 ore" as 120 minutes', () => {
    const result = parseDuration('2 ore');
    expect(result.valid).toBe(true);
    expect(result.minutes).toBe(120);
    expect(result.interpretation).toContain('2 ore');
    expect(result.interpretation).toContain('120 minute');
  });

  test('parses "120 min" as 120 minutes', () => {
    const result = parseDuration('120 min');
    expect(result.valid).toBe(true);
    expect(result.minutes).toBe(120);
    expect(result.interpretation).toContain('120 minute');
    expect(result.interpretation).toContain('2 ore');
  });

  test('parses "90" as 90 minutes', () => {
    const result = parseDuration('90');
    expect(result.valid).toBe(true);
    expect(result.minutes).toBe(90);
  });

  test('parses "1.5 ore" as 90 minutes', () => {
    const result = parseDuration('1.5 ore');
    expect(result.valid).toBe(true);
    expect(result.minutes).toBe(90);
    expect(result.interpretation).toContain('1.5 ore');
    expect(result.interpretation).toContain('90 minute');
  });

  test('parses "1,5 ore" (comma) as 90 minutes', () => {
    const result = parseDuration('1,5 ore');
    expect(result.valid).toBe(true);
    expect(result.minutes).toBe(90);
  });

  test('parses "2" as 120 minutes (assumes hours)', () => {
    const result = parseDuration('2');
    expect(result.valid).toBe(true);
    expect(result.minutes).toBe(120);
    expect(result.ambiguous).toBe(true);
  });

  test('rejects invalid input', () => {
    const result = parseDuration('abc');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('rejects empty input', () => {
    const result = parseDuration('');
    expect(result.valid).toBe(false);
  });
});
