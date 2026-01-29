/**
 * Unit/smoke tests for fetchMessagesFromWA helper.
 * When fetchMessageHistory is missing/miswired, we throw a clear error (recent-sync marks status error).
 */

const { fetchMessagesFromWA } = require('../lib/fetch-messages-wa');

describe('fetchMessagesFromWA', () => {
  test('throws clear error when sock is null', async () => {
    await expect(fetchMessagesFromWA(null, 'jid', 20, {})).rejects.toThrow(
      'fetchMessagesFromWA: sock is required'
    );
  });

  test('throws clear error when sock has no fetchMessageHistory', async () => {
    const sock = { ev: { on: jest.fn(), off: jest.fn() } };
    await expect(
      fetchMessagesFromWA(sock, '123@s.whatsapp.net', 20, { db: {}, accountId: 'a1' })
    ).rejects.toThrow('fetchMessagesFromWA: sock.fetchMessageHistory is not a function');
  });

  test('throws clear error when fetchMessageHistory is miswired (not a function)', async () => {
    const sock = {
      fetchMessageHistory: 'not-a-function',
      ev: { on: jest.fn(), off: jest.fn() },
    };
    await expect(
      fetchMessagesFromWA(sock, '123@s.whatsapp.net', 20, { db: {}, accountId: 'a1' })
    ).rejects.toThrow('sock.fetchMessageHistory is not a function');
  });

  test('returns [] when opts.db or opts.accountId missing (no Firestore lookup)', async () => {
    const sock = {
      fetchMessageHistory: jest.fn(),
      ev: { on: jest.fn(), off: jest.fn() },
    };
    await expect(fetchMessagesFromWA(sock, 'jid', 20, {})).resolves.toEqual([]);
    await expect(fetchMessagesFromWA(sock, 'jid', 20, { db: {} })).resolves.toEqual([]);
    await expect(fetchMessagesFromWA(sock, 'jid', 20, { accountId: 'a1' })).resolves.toEqual([]);
    expect(sock.fetchMessageHistory).not.toHaveBeenCalled();
  });
});
