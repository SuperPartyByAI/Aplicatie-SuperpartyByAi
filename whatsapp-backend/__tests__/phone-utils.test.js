const { normalizeJidToE164 } = require('../lib/phone-utils');

describe('normalizePhone', () => {
  test('should normalize JID to E.164 using default calling code', () => {
    process.env.DEFAULT_CALLING_CODE = '40';

    const result = normalizeJidToE164('40712345678@s.whatsapp.net');
    expect(result.normalizedPhone).toBe('+40712345678');
    expect(result.rawJid).toBe('40712345678@s.whatsapp.net');
  });
});
