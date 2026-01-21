const {
  normalizeMessageText,
  getStrongFingerprint,
  getStableKey,
} = require('../lib/wa-message-identity');

describe('wa-message-identity helpers', () => {
  test('stable key consistent for same input', () => {
    const msg = {
      key: { id: 'abc123', fromMe: false, remoteJid: '123@s.whatsapp.net' },
      message: { conversation: 'hello' },
    };
    const first = getStableKey({ accountId: 'acc1', canonicalJid: '123@s.whatsapp.net', msg });
    const second = getStableKey({ accountId: 'acc1', canonicalJid: '123@s.whatsapp.net', msg });
    expect(first).toBe(second);
  });

  test('strong fingerprint consistent for same input', () => {
    const msg = {
      key: { id: 'abc123', fromMe: false, remoteJid: '123@s.whatsapp.net' },
      message: { conversation: 'hello' },
    };
    const first = getStrongFingerprint({
      accountId: 'acc1',
      canonicalJid: '123@s.whatsapp.net',
      msg,
      tsClientMs: 1710000000000,
    });
    const second = getStrongFingerprint({
      accountId: 'acc1',
      canonicalJid: '123@s.whatsapp.net',
      msg,
      tsClientMs: 1710000000000,
    });
    expect(first).toBe(second);
  });

  test('normalizeMessageText tolerates common message shapes', () => {
    expect(normalizeMessageText({ message: { conversation: 'hi' } })).toBe('hi');
    expect(normalizeMessageText({ message: { extendedTextMessage: { text: 'hi' } } })).toBe('hi');
    expect(normalizeMessageText({ message: { imageMessage: { caption: 'pic' } } })).toBe('pic');
    expect(normalizeMessageText({ message: { ephemeralMessage: { message: { conversation: 'e' } } } })).toBe('e');
    expect(normalizeMessageText({})).toBe('');
  });
});
