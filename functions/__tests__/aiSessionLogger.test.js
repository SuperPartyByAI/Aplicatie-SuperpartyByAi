const logger = require('../aiSessionLogger');

function makeDb() {
  const calls = [];

  function makeDocRef(path) {
    return {
      _path: path,
      set: async (data) => {
        calls.push({ op: 'set', path, data });
      },
      collection: (name) => ({
        doc: (id) => makeDocRef(`${path}/${name}/${id || 'AUTO'}`),
        get: async () => ({ docs: [] }),
      }),
      get: async () => ({ exists: false, data: () => null }),
    };
  }

  const db = {
    batch: () => ({
      set: () => {},
      commit: async () => {},
    }),
    collection: (name) => ({
      doc: (id) => makeDocRef(`${name}/${id}`),
    }),
    _calls: calls,
  };

  return db;
}

test('startSession writes to temp when eventId missing', async () => {
  const db = makeDb();
  await logger.startSession(db, {
    eventId: null,
    sessionId: 's1',
    actorUid: 'u1',
    actorEmail: 'a@b.c',
    actionType: 'test',
    configMeta: { hash: 'x' },
  });
  expect(db._calls.find((c) => c.op === 'set' && c.path === 'ai_sessions/s1')).toBeTruthy();
});

test('appendMessage writes under messages subcollection', async () => {
  const db = makeDb();
  await logger.appendMessage(db, { sessionId: 's1', role: 'user', text: 'hi' });
  expect(db._calls.some((c) => c.op === 'set' && c.path.includes('ai_sessions/s1/messages'))).toBe(true);
});

