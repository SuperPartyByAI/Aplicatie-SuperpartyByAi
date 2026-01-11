'use strict';

const { allocateSlot, isFutureEvent } = require('../v3Operations');

describe('allocateSlot', () => {
  test('allocates first slot for new event', () => {
    const slot = allocateSlot(1, {});
    expect(slot).toBe('01A');
  });

  test('allocates next available slot', () => {
    const existing = {
      '01A': {},
      '01B': {},
    };
    const slot = allocateSlot(1, existing);
    expect(slot).toBe('01C');
  });

  test('never reuses slots', () => {
    const existing = {
      '01A': { status: 'archived' },
      '01C': {},
    };
    const slot = allocateSlot(1, existing);
    expect(slot).toBe('01B'); // B is free, not A (even though archived)
  });

  test('throws when no slots available', () => {
    const existing = {};
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const letter of letters) {
      existing[`01${letter}`] = {};
    }

    expect(() => allocateSlot(1, existing)).toThrow('No more slots available');
  });
});

describe('isFutureEvent', () => {
  test('returns true for future date', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const dateStr = `${futureDate.getDate().toString().padStart(2, '0')}-${(futureDate.getMonth() + 1).toString().padStart(2, '0')}-${futureDate.getFullYear()}`;

    expect(isFutureEvent(dateStr)).toBe(true);
  });

  test('returns false for past date', () => {
    expect(isFutureEvent('01-01-2020')).toBe(false);
  });

  test('returns true for today', () => {
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;

    expect(isFutureEvent(dateStr)).toBe(true);
  });
});
