const { resolveCanonicalJid } = require('../lib/jid-utils');
const { buildMessageDedupeKey } = require('../lib/message-dedupe');

describe('jid-utils', () => {
  test('resolveCanonicalJid maps @lid via onWhatsApp', async () => {
    const sock = {
      onWhatsApp: jest.fn().mockResolvedValue([{ jid: '40123456789@s.whatsapp.net' }]),
    };

    const result = await resolveCanonicalJid(sock, '40123456789@lid');

    expect(sock.onWhatsApp).toHaveBeenCalledWith('40123456789@lid');
    expect(result.canonicalJid).toBe('40123456789@s.whatsapp.net');
  });

  test('resolveCanonicalJid falls back to contacts map', async () => {
    const sock = {
      onWhatsApp: jest.fn().mockRejectedValue(new Error('LIDs are not supported with onWhatsApp')),
      contacts: {
        '40123456789@s.whatsapp.net': {
          id: '40123456789@s.whatsapp.net',
          lid: '6734961766538@lid',
        },
      },
    };

    const result = await resolveCanonicalJid(sock, '6734961766538@lid');

    expect(sock.onWhatsApp).toHaveBeenCalledWith('6734961766538@lid');
    expect(result.canonicalJid).toBe('40123456789@s.whatsapp.net');
  });
});

describe('message dedupe', () => {
  test('uses waMessageId as deterministic key', () => {
    const key1 = buildMessageDedupeKey({ waMessageId: 'abc123' });
    const key2 = buildMessageDedupeKey({ waMessageId: 'abc123' });

    expect(key1).toBe('wa:abc123');
    expect(key1).toBe(key2);
  });
});
