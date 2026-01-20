const fs = require('fs');
const path = require('path');

describe('LID canonicalization + outbound dedupe', () => {
  const serverPath = path.join(__dirname, '..', 'server.js');
  const serverCode = fs.readFileSync(serverPath, 'utf8');

  test('saveMessageToFirestore canonicalizes LID to canonicalJid', () => {
    expect(serverCode).toMatch(/rawJid\s*=\s*msg\.key\.remoteJid/);
    expect(serverCode).toMatch(/let\s+canonicalJid\s*=\s*rawJid/);
    expect(serverCode).toMatch(/rawJid\.endsWith\('@lid'\)/);
    expect(serverCode).toMatch(/canonicalJid\s*=\s*contact\.jid/);
    expect(serverCode).toMatch(/const threadId = `\$\{accountId}__\$\{canonicalJid}`/);
    expect(serverCode).toMatch(/clientJid:\s*canonicalJid/);
    expect(serverCode).toMatch(/rawJid/);
  });

  test('send-message uses requestId for messageDocId when present', () => {
    expect(serverCode).toMatch(/const requestIdHeader = req\.headers\['x-request-id'\]/);
    expect(serverCode).toMatch(/const messageDocId = requestIdHeader \|\| waMessageId/);
  });
});
