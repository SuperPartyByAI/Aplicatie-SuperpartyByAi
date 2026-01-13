const { getEffectiveConfig } = require('../aiConfigManager');

function makeDb({ globalDoc = null, globalPrivateDoc = null, overrideDoc = null } = {}) {
  const makeDoc = (doc) => ({
    get: async () => ({
      exists: Boolean(doc),
      data: () => doc,
    }),
  });

  const db = {
    collection: (name) => {
      if (name === 'ai_config') {
        return { doc: (id) => (id === 'global' ? makeDoc(globalDoc) : makeDoc(null)) };
      }
      if (name === 'ai_config_private') {
        return { doc: (id) => (id === 'global' ? makeDoc(globalPrivateDoc) : makeDoc(null)) };
      }
      if (name === 'ai_config_overrides') {
        return { doc: () => makeDoc(null) };
      }
      if (name === 'ai_config_overrides_private') {
        return { doc: () => makeDoc(null) };
      }
      if (name === 'evenimente') {
        return {
          doc: () => ({
            collection: (sub) => ({
              doc: (docId) =>
                sub === 'ai_overrides' && docId === 'current' ? makeDoc(overrideDoc) : makeDoc(null),
            }),
          }),
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  };
  return db;
}

test('getEffectiveConfig falls back to defaults', async () => {
  const db = makeDb();
  const { effective, meta } = await getEffectiveConfig(db, {});
  expect(effective).toBeTruthy();
  expect(Array.isArray(effective.eventSchema.required)).toBe(true);
  expect(effective.policies.requireConfirm).toBe(true);
  expect(meta).toHaveProperty('hash');
  expect(meta.isFallback).toBe(false);
});

test('override wins over global', async () => {
  const db = makeDb({
    globalDoc: { version: 1, policies: { requireConfirm: true }, eventSchema: { required: ['date'] } },
    globalPrivateDoc: { version: 9, systemPromptAppend: 'PRIVATE' },
    overrideDoc: {
      version: 2,
      overrides: { policies: { requireConfirm: false }, eventSchema: { required: ['date', 'address'] } },
    },
  });
  const { effective, meta } = await getEffectiveConfig(db, { eventId: 'evt1' });
  expect(effective.policies.requireConfirm).toBe(false);
  expect(effective.eventSchema.required).toEqual(['date', 'address']);
  expect(meta.global.public.version).toBe(1);
  expect(meta.global.private.version).toBe(9);
  expect(meta.override.legacy.version).toBe(2);
});

