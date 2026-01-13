const { HttpsError } = require('firebase-functions/v2/https');
const ConversationStateManager = require('../conversationStateManager');

function makeDbWithState(stateDocData) {
  return {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: Boolean(stateDocData),
          id: 's1',
          data: () => stateDocData,
        }),
        update: async () => true,
        delete: async () => true,
        set: async () => true,
      }),
    }),
  };
}

test('ConversationStateManager enforces ownerUid on getState', async () => {
  const db = makeDbWithState({ ownerUid: 'ownerA', notingMode: true });
  const mgr = new ConversationStateManager(db);

  await expect(mgr.getState('s1', 'ownerA')).resolves.toBeTruthy();

  await expect(mgr.getState('s1', 'ownerB')).rejects.toBeInstanceOf(HttpsError);
});

test('ConversationStateManager denies state missing ownerUid', async () => {
  const db = makeDbWithState({ notingMode: true });
  const mgr = new ConversationStateManager(db);

  await expect(mgr.getState('s1', 'ownerA')).rejects.toBeInstanceOf(HttpsError);
});

