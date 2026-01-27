const { extractWaKeyId, extractWaMetadata, looksLikeWaMessageId } = require('../lib/extract-wa-key-id');

describe('extractWaKeyId', () => {
  test('extracts from key.id (priority 1)', () => {
    const docData = {
      key: { id: '3EB0ABC123', remoteJid: '40768098268@s.whatsapp.net', fromMe: false },
      body: 'test',
    };
    const result = extractWaKeyId(docData, 'fallback123');
    expect(result.waKeyId).toBe('3EB0ABC123');
    expect(result.source).toBe('key.id');
  });

  test('extracts from waMessageId (priority 2)', () => {
    const docData = {
      waMessageId: 'AC1B7D58CA',
      body: 'test',
    };
    const result = extractWaKeyId(docData, 'fallback123');
    expect(result.waKeyId).toBe('AC1B7D58CA');
    expect(result.source).toBe('waMessageId');
  });

  test('extracts from message.key.id (priority 3)', () => {
    const docData = {
      message: { key: { id: '3A2EB95E79' } },
      body: 'test',
    };
    const result = extractWaKeyId(docData, 'fallback123');
    expect(result.waKeyId).toBe('3A2EB95E79');
    expect(result.source).toBe('message.key.id');
  });

  test('uses doc.id fallback if looks like WA ID (priority 4)', () => {
    const docData = { body: 'test' };
    const result = extractWaKeyId(docData, '3EB0ABC123DEF456789');
    expect(result.waKeyId).toBe('3EB0ABC123DEF456789');
    expect(result.source).toBe('doc.id_fallback');
  });

  test('returns null if no valid ID found', () => {
    const docData = { body: 'test' };
    const result = extractWaKeyId(docData, 'random_hash_123');
    expect(result.waKeyId).toBeNull();
    expect(result.source).toBe('not_found');
  });

  test('handles null/undefined docData', () => {
    expect(extractWaKeyId(null, 'fallback').waKeyId).toBeNull();
    expect(extractWaKeyId(undefined, 'fallback').waKeyId).toBeNull();
    expect(extractWaKeyId({}, 'fallback').waKeyId).toBeNull();
  });
});

describe('extractWaMetadata', () => {
  test('extracts all metadata correctly', () => {
    const docData = {
      key: {
        id: '3EB0ABC123',
        remoteJid: '40768098268@s.whatsapp.net',
        fromMe: false,
        timestamp: 1769290625,
      },
      tsClient: { seconds: 1769290625, nanoseconds: 0 },
      direction: 'in',
    };
    const result = extractWaMetadata(docData, 'fallback123');
    expect(result.waKeyId).toBe('3EB0ABC123');
    expect(result.waRemoteJid).toBe('40768098268@s.whatsapp.net');
    expect(result.waFromMe).toBe(false);
    expect(result.waTimestampSec).toBe(1769290625);
  });

  test('extracts fromMe from direction field', () => {
    const docData = {
      key: { id: '3EB0ABC123' },
      direction: 'out',
    };
    const result = extractWaMetadata(docData, 'fallback123');
    expect(result.waFromMe).toBe(true);
  });

  test('handles Firestore Timestamp', () => {
    const docData = {
      key: { id: '3EB0ABC123' },
      tsClient: { seconds: 1769290625, nanoseconds: 500000 },
    };
    const result = extractWaMetadata(docData, 'fallback123');
    expect(result.waTimestampSec).toBe(1769290625);
  });
});

describe('looksLikeWaMessageId', () => {
  test('accepts valid WA IDs', () => {
    expect(looksLikeWaMessageId('3EB0ABC123DEF456789')).toBe(true);
    expect(looksLikeWaMessageId('AC1B7D58CA66CFA123456')).toBe(true);
    expect(looksLikeWaMessageId('3A2EB95E79ABCDEF1234567890')).toBe(true);
  });

  test('rejects invalid IDs', () => {
    expect(looksLikeWaMessageId('random_hash_123')).toBe(false);
    expect(looksLikeWaMessageId('msg_1234567890')).toBe(false);
    expect(looksLikeWaMessageId('abc')).toBe(false); // too short
    expect(looksLikeWaMessageId('')).toBe(false);
    expect(looksLikeWaMessageId(null)).toBe(false);
  });
});
