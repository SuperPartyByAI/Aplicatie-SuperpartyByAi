const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SendRequestSchema,
  AccountsCreateSchema,
  RegenerateQrParamsSchema,
  HealthResponseSchema,
} = require('../src/schemas');

test('POST /api/send request schema: valid payload passes', () => {
  const ok = SendRequestSchema.safeParse({
    threadId: 'acc_chat',
    accountId: 'acc',
    chatId: 'chat',
    to: 'chat',
    text: 'hi',
    clientMessageId: 'c1',
  });
  assert.equal(ok.success, true);
});

test('POST /api/send request schema: invalid payload fails', () => {
  const bad = SendRequestSchema.safeParse({ threadId: '', accountId: 'x' });
  assert.equal(bad.success, false);
});

test('POST /api/accounts request schema: requires name', () => {
  assert.equal(AccountsCreateSchema.safeParse({ name: 'A', phone: '+40' }).success, true);
  assert.equal(AccountsCreateSchema.safeParse({ phone: '+40' }).success, false);
});

test('POST /api/accounts/:id/regenerate-qr params schema', () => {
  assert.equal(RegenerateQrParamsSchema.safeParse({ accountId: 'wa_1' }).success, true);
  assert.equal(RegenerateQrParamsSchema.safeParse({}).success, false);
});

test('GET /health response schema: minimal shape', () => {
  const ok = HealthResponseSchema.safeParse({
    ok: true,
    instanceId: 'inst_1',
    uptimeSec: 1,
    accounts: [{ accountId: 'wa_1', degraded: false }],
  });
  assert.equal(ok.success, true);
});

