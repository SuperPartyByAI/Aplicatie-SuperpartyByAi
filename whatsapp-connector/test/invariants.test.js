const test = require('node:test');
const assert = require('node:assert/strict');

const { ingestId, threadId, messageId, shouldUpdateLastMessage } = require('../src/ingest');

test('invariant: threadId is deterministic (accountId + chatId)', () => {
  assert.equal(threadId({ accountId: 'wa_1', chatId: 'c1@s.whatsapp.net' }), 'wa_1_c1@s.whatsapp.net');
});

test('invariant: messageId is deterministic (threadId + waMessageKey)', () => {
  assert.equal(
    messageId({ threadId: 'wa_1_c1@s.whatsapp.net', waMessageKey: 'ABC' }),
    'wa_1_c1@s.whatsapp.net_ABC',
  );
});

test('invariant: ingestId is deterministic (accountId + chatId + waMessageKey)', () => {
  assert.equal(
    ingestId({ accountId: 'wa_1', chatId: 'c1@s.whatsapp.net', waMessageKey: 'ABC' }),
    'wa_1_c1@s.whatsapp.net_ABC',
  );
});

test('invariant: thread lastMessageAt is monotonic helper', () => {
  assert.equal(shouldUpdateLastMessage(0, 1000), true);
  assert.equal(shouldUpdateLastMessage(1000, 1000), true);
  assert.equal(shouldUpdateLastMessage(1000, 999), false);
});

