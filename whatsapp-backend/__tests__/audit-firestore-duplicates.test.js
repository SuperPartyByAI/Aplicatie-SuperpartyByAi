const {
  coerceToMs,
  extractProviderMessageId,
  extractThreadId,
  extractFrom,
  buildStableKeyHash,
} = require('../scripts/audit-firestore-duplicates');

describe('audit-firestore-duplicates helpers', () => {
  test('coerceToMs handles numbers and strings', () => {
    expect(coerceToMs(1700000000)).toBe(1700000000 * 1000);
    expect(coerceToMs('1700000000')).toBe(1700000000 * 1000);
    expect(coerceToMs(1700000000000)).toBe(1700000000000);
    expect(coerceToMs('1700000000000')).toBe(1700000000000);
  });

  test('coerceToMs handles Date and Timestamp shapes', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    expect(coerceToMs(date)).toBe(date.getTime());

    const tsObj = { seconds: 1700000000, nanoseconds: 500000000 };
    expect(coerceToMs(tsObj)).toBe(1700000000 * 1000 + 500);

    const restObj = { timestampValue: '2024-01-01T00:00:00.000Z' };
    expect(coerceToMs(restObj)).toBe(date.getTime());
  });

  test('coerceToMs handles ISO strings and invalid strings', () => {
    const iso = '2024-01-01T00:00:00.000Z';
    expect(coerceToMs(iso)).toBe(Date.parse(iso));
    expect(coerceToMs('not-a-date')).toBeNull();
  });

  test('extract helpers find nested ids', () => {
    const payload = {
      raw: { key: { id: 'msg-123', remoteJid: 'jid-1', participant: 'user-1' } },
    };
    expect(extractProviderMessageId(payload).value).toBe('msg-123');
    expect(extractThreadId(payload).value).toBe('jid-1');
    expect(extractFrom(payload).value).toBe('user-1');
  });

  test('extractProviderMessageId prefers waMessageId when present', () => {
    const payload = { waMessageId: 'wa-456' };
    expect(extractProviderMessageId(payload).value).toBe('wa-456');
  });

  test('buildStableKeyHash prefers providerMessageId', () => {
    const data = { providerMessageId: 'abc-1' };
    const key = buildStableKeyHash({ data, accountId: 'acct-1', tsClientMs: 1700000000000 });
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });
});
