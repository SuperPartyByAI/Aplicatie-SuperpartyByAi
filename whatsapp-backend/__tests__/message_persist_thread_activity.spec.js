/**
 * Unit tests for message_persist thread activity (inbox order fix):
 * - getPlaceholderPreview: returns [Image], [Video], [Reaction], [Message] etc.
 * - writeMessageIdempotent: inbound and outbound both update lastMessageAtMs and lastMessageText;
 *   "real but no-preview" message still updates thread activity with placeholder.
 */

const {
  getPlaceholderPreview,
  writeMessageIdempotent,
  extractTimestampMs,
} = require('../whatsapp/message_persist');

describe('getPlaceholderPreview', () => {
  test('returns [Image] for imageMessage', () => {
    expect(getPlaceholderPreview({ message: { imageMessage: {} } })).toBe('[Image]');
  });
  test('returns [Video] for videoMessage', () => {
    expect(getPlaceholderPreview({ message: { videoMessage: {} } })).toBe('[Video]');
  });
  test('returns [Audio] for audioMessage', () => {
    expect(getPlaceholderPreview({ message: { audioMessage: {} } })).toBe('[Audio]');
  });
  test('returns [Reaction] for reactionMessage', () => {
    expect(getPlaceholderPreview({ message: { reactionMessage: {} } })).toBe('[Reaction]');
  });
  test('returns [Message] for listResponseMessage', () => {
    expect(getPlaceholderPreview({ message: { listResponseMessage: {} } })).toBe('[Message]');
  });
  test('returns [Message] when msg.message missing or empty', () => {
    expect(getPlaceholderPreview({})).toBe('[Message]');
    expect(getPlaceholderPreview({ message: null })).toBe('[Message]');
  });
});

describe('writeMessageIdempotent thread activity', () => {
  let mockThreadSet;
  let mockMessageSet;
  let mockThreadGet;
  let mockContactGet;
  let mockDb;

  beforeEach(() => {
    mockThreadSet = jest.fn().mockResolvedValue(undefined);
    mockMessageSet = jest.fn().mockResolvedValue(undefined);
    mockThreadGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({}),
    });
    mockContactGet = jest.fn().mockResolvedValue({ exists: false });
    mockDb = {
      collection: (name) => ({
        doc: (id) => ({
          get: name === 'threads' ? mockThreadGet : undefined,
          set: name === 'threads' ? mockThreadSet : mockMessageSet,
          collection: () => ({
            doc: () => ({
              set: mockMessageSet,
            }),
          }),
        }),
      }),
    };
    // message_persist uses require('firebase-admin') at load; we need admin.firestore
    const admin = require('firebase-admin');
    if (admin && !admin.firestore) {
      admin.firestore = {
        FieldValue: { serverTimestamp: () => ({ _serverTimestamp: true }) },
        Timestamp: { fromMillis: (ms) => ({ toMillis: () => ms }) },
      };
    }
  });

  test('inbound text updates thread with lastMessageAtMs and lastMessageText', async () => {
    const msg = {
      key: { id: 'mid1', fromMe: false, remoteJid: '40712345678@s.whatsapp.net' },
      message: { conversation: 'Hello' },
      messageTimestamp: 1700000000,
    };
    const opts = { accountId: 'acc1', clientJid: '40712345678@s.whatsapp.net', threadId: 'acc1__40712345678@s.whatsapp.net', direction: 'inbound' };
    await writeMessageIdempotent(mockDb, opts, msg);
    expect(mockThreadSet).toHaveBeenCalled();
    const call = mockThreadSet.mock.calls[0][0];
    expect(call.lastMessageAtMs).toBeDefined();
    expect(call.lastMessageAtMs).toBeGreaterThan(0);
    expect(call.lastMessageText).toContain('Hello');
    expect(call.lastMessageDirection).toBe('inbound');
  });

  test('outbound text updates thread with lastMessageAtMs and lastMessageText', async () => {
    const msg = {
      key: { id: 'mid2', fromMe: true, remoteJid: '40712345678@s.whatsapp.net' },
      message: { conversation: 'Bye' },
      messageTimestamp: 1700000001,
    };
    const opts = { accountId: 'acc1', clientJid: '40712345678@s.whatsapp.net', threadId: 'acc1__40712345678@s.whatsapp.net', direction: 'outbound' };
    await writeMessageIdempotent(mockDb, opts, msg);
    expect(mockThreadSet).toHaveBeenCalled();
    const call = mockThreadSet.mock.calls[0][0];
    expect(call.lastMessageAtMs).toBeDefined();
    expect(call.lastMessageText).toContain('Bye');
    expect(call.lastMessageDirection).toBe('outbound');
  });

  test('real message with no preview (reaction) still updates thread with placeholder', async () => {
    const msg = {
      key: { id: 'mid3', fromMe: false, remoteJid: '40712345678@s.whatsapp.net' },
      message: { reactionMessage: { text: '👍' } },
      messageTimestamp: 1700000002,
    };
    const opts = { accountId: 'acc1', clientJid: '40712345678@s.whatsapp.net', threadId: 'acc1__40712345678@s.whatsapp.net', direction: 'inbound' };
    await writeMessageIdempotent(mockDb, opts, msg);
    expect(mockThreadSet).toHaveBeenCalled();
    const call = mockThreadSet.mock.calls[0][0];
    expect(call.lastMessageAtMs).toBeDefined();
    expect(call.lastMessageText).toBe('[Reaction]');
    expect(call.lastMessageDirection).toBe('inbound');
  });

  test('protocol-only message does not update thread', async () => {
    const msg = {
      key: { id: 'mid4', fromMe: false, remoteJid: '40712345678@s.whatsapp.net' },
      message: { protocolMessage: { type: 5 } },
      messageTimestamp: 1700000003,
    };
    const opts = { accountId: 'acc1', clientJid: '40712345678@s.whatsapp.net', threadId: 'acc1__40712345678@s.whatsapp.net', direction: 'inbound' };
    await writeMessageIdempotent(mockDb, opts, msg);
    expect(mockThreadSet).not.toHaveBeenCalled();
  });
});

describe('extractTimestampMs', () => {
  test('seconds value converted to ms', () => {
    expect(extractTimestampMs(1700000000)).toBe(1700000000000);
  });
  test('ms value kept', () => {
    expect(extractTimestampMs(1700000000000)).toBe(1700000000000);
  });
});
