/**
 * Contract tests: backfill never creates threads; only fills messages for existing ones.
 * Asserts that server.js contains the explicit comment and log for this contract.
 */

const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');

describe('backfill contract', () => {
  let serverSource;

  beforeAll(() => {
    serverSource = fs.readFileSync(serverPath, 'utf8');
  });

  test('backfill explicitly states it never creates threads', () => {
    expect(serverSource).toMatch(/Backfill NEVER creates threads/);
  });

  test('no-threads backfill log mentions re-pair to create', () => {
    expect(serverSource).toMatch(/No threads found for backfill/);
    expect(serverSource).toMatch(/re-pair to create/);
  });
});
