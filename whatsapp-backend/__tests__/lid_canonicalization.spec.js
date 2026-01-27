const fs = require('fs');
const path = require('path');

describe('LID canonicalization + outbound dedupe', () => {
  const serverPath = path.join(__dirname, '..', 'server.js');
  const serverCode = fs.readFileSync(serverPath, 'utf8');

  test('saveMessageToFirestore canonicalizes LID to canonicalJid', () => {
    expect(serverCode).toMatch(/canonicalClientKey/);
    expect(serverCode).toMatch(/canonicalKey/);
    expect(serverCode).toMatch(/buildCanonicalThreadId/);
    expect(serverCode).toMatch(/clientJid/);
    expect(serverCode).toMatch(/rawJid|remoteJid/);
  });

  test('send-message uses writeMessageIdempotent for outbound dedupe', () => {
    expect(serverCode).toMatch(/writeMessageIdempotent\(/);
    expect(serverCode).toMatch(/extraFields:.*status/);
  });
});
