'use strict';

const {
  validateDate,
  validateTime,
  validateDuration,
  validatePhone,
  validateEventV3,
} = require('../v3Validators');

describe('validateDate', () => {
  test('accepts valid DD-MM-YYYY', () => {
    const result = validateDate('15-01-2026');
    expect(result.valid).toBe(true);
    expect(result.date).toBeInstanceOf(Date);
  });

  test('rejects invalid format', () => {
    expect(validateDate('2026-01-15').valid).toBe(false);
    expect(validateDate('15/01/2026').valid).toBe(false);
  });

  test('rejects invalid date', () => {
    expect(validateDate('32-01-2026').valid).toBe(false);
    expect(validateDate('29-02-2025').valid).toBe(false);
  });
});

describe('validateTime', () => {
  test('accepts valid HH:mm', () => {
    const result = validateTime('14:30');
    expect(result.valid).toBe(true);
    expect(result.hour).toBe(14);
    expect(result.minute).toBe(30);
  });

  test('rejects invalid format', () => {
    expect(validateTime('14').valid).toBe(false);
    expect(validateTime('2:30').valid).toBe(false);
  });

  test('rejects invalid time', () => {
    expect(validateTime('24:00').valid).toBe(false);
    expect(validateTime('14:60').valid).toBe(false);
  });
});

describe('validateDuration', () => {
  test('accepts valid duration', () => {
    expect(validateDuration(120).valid).toBe(true);
    expect(validateDuration(60).valid).toBe(true);
  });

  test('rejects invalid duration', () => {
    expect(validateDuration(0).valid).toBe(false);
    expect(validateDuration(-10).valid).toBe(false);
    expect(validateDuration(500).valid).toBe(false);
  });
});

describe('validatePhone', () => {
  test('accepts valid E.164', () => {
    const result = validatePhone('+40712345678', '0712345678');
    expect(result.valid).toBe(true);
  });

  test('rejects invalid phone', () => {
    expect(validatePhone('0712345678').valid).toBe(false);
    expect(validatePhone('+4071234').valid).toBe(false);
  });
});

describe('validateEventV3', () => {
  test('accepts valid event', () => {
    const event = {
      eventShortId: 1,
      date: '15-01-2026',
      address: 'București, Sector 3',
      phoneE164: '+40712345678',
      phoneRaw: '0712345678',
      rolesBySlot: {
        '01A': {
          slot: '01A',
          roleType: 'animator',
          label: 'Animator',
          startTime: '14:00',
          durationMin: 120,
          status: 'active',
          details: {},
        },
      },
    };

    const result = validateEventV3(event);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects invalid event', () => {
    const event = {
      eventShortId: 0, // invalid
      date: '2026-01-15', // wrong format
      address: 'Buc', // too short
      phoneE164: '0712345678', // no +
      rolesBySlot: {},
    };

    const result = validateEventV3(event);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
