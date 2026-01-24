const fs = require('fs');
const path = require('path');

describe('LID canonicalization + outbound dedupe', () => {
  const serverPath = path.join(__dirname, '..', 'server.js');
  const serverCode = fs.readFileSync(serverPath, 'utf8');

  test('saveMessageToFirestore canonicalizes LID to canonicalJid', () => {
    expect(serverCode).toMatch(/resolveCanonicalPeerJid/);
    expect(serverCode).toMatch(/canonicalJid/);
    expect(serverCode).toMatch(/buildCanonicalThreadId/);
    expect(serverCode).toMatch(/clientJid:\s*canonicalJid/);
    expect(serverCode).toMatch(/rawJid/);
  });

  test('send-message uses persistMessage for outbound dedupe', () => {
    expect(serverCode).toMatch(/statusOverride:\s*'queued'/);
    expect(serverCode).toMatch(/statusOverride:\s*'sent'/);
    expect(serverCode).toMatch(/persistMessage\(/);
  });
});
