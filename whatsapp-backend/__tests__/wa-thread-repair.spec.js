/**
 * Unit tests for thread last-activity repair:
 * - deriveLastActivityFromMessage: timestamp derivation (sec vs ms) -> correct ms
 * - repair: when last message exists sets fields; when none, does not crash; idempotent.
 */

const { deriveLastActivityFromMessage } = require('../lib/wa-thread-repair');

function mockAdmin() {
  return {
    firestore: {
      Timestamp: {
        fromMillis: (ms) => ({ _ms: ms, toMillis: () => ms }),
      },
    },
  };
}

describe('deriveLastActivityFromMessage', () => {
  const admin = mockAdmin();

  test('returns null when msgData is null', () => {
    expect(deriveLastActivityFromMessage(null, admin)).toBeNull();
  });

  test('returns null when admin or Timestamp missing', () => {
    expect(deriveLastActivityFromMessage({ tsClient: { toMillis: () => 1000 } }, null)).toBeNull();
    expect(deriveLastActivityFromMessage({ tsClient: { toMillis: () => 1000 } }, {})).toBeNull();
  });

  test('uses tsClient.toMillis() when present', () => {
    const msg = { tsClient: { toMillis: () => 1700000000000 } };
    const out = deriveLastActivityFromMessage(msg, admin);
    expect(out).not.toBeNull();
    expect(out.lastMessageAtMs).toBe(1700000000000);
    expect(out.lastMessageAt).toBeDefined();
  });

  test('uses createdAt.toMillis() when tsClient missing', () => {
    const msg = { createdAt: { toMillis: () => 1600000000000 } };
    const out = deriveLastActivityFromMessage(msg, admin);
    expect(out).not.toBeNull();
    expect(out.lastMessageAtMs).toBe(1600000000000);
  });

  test('lastMessageTimestamp in seconds -> converts to ms', () => {
    const msg = { lastMessageTimestamp: 1700000000 };
    const out = deriveLastActivityFromMessage(msg, admin);
    expect(out).not.toBeNull();
    expect(out.lastMessageAtMs).toBe(1700000000000);
  });

  test('lastMessageTimestamp in ms -> kept as ms', () => {
    const msg = { lastMessageTimestamp: 1700000000000 };
    const out = deriveLastActivityFromMessage(msg, admin);
    expect(out).not.toBeNull();
    expect(out.lastMessageAtMs).toBe(1700000000000);
  });

  test('tsClient._seconds (serialized) -> converts to ms', () => {
    const msg = { tsClient: { _seconds: 1700000000 } };
    const out = deriveLastActivityFromMessage(msg, admin);
    expect(out).not.toBeNull();
    expect(out.lastMessageAtMs).toBe(1700000000000);
  });

  test('createdAt._seconds (serialized) -> converts to ms', () => {
    const msg = { createdAt: { _seconds: 1600000000 } };
    const out = deriveLastActivityFromMessage(msg, admin);
    expect(out).not.toBeNull();
    expect(out.lastMessageAtMs).toBe(1600000000000);
  });

  test('returns null when no usable timestamp', () => {
    expect(deriveLastActivityFromMessage({}, admin)).toBeNull();
    expect(deriveLastActivityFromMessage({ body: 'hi' }, admin)).toBeNull();
  });

  test('idempotent: same input yields same output', () => {
    const msg = { tsClient: { toMillis: () => 1700000000000 } };
    const a = deriveLastActivityFromMessage(msg, admin);
    const b = deriveLastActivityFromMessage(msg, admin);
    expect(a.lastMessageAtMs).toBe(b.lastMessageAtMs);
  });
});
