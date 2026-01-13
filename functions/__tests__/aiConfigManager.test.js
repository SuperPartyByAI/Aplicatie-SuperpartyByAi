const { getEffectiveConfig } = require('../aiConfigManager');

function makeDb({ globalDoc = null, overrideDoc = null } = {}) {
  const db = {
    collection: (name) => {
      if (name === 'ai_config') {
        return {
          doc: (id) => ({
            get: async () => ({
              exists: Boolean(globalDoc) && id === 'global',
              data: () => globalDoc,
            }),
          }),
        };
      }
      if (name === 'evenimente') {
        return {
          doc: (eventId) => ({
            collection: (sub) => ({
              doc: (docId) => ({
                get: async () => ({
                  exists: Boolean(overrideDoc) && sub === 'ai_overrides' && docId === 'current',
                  data: () => overrideDoc,
                }),
              }),
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
});

test('override wins over global', async () => {
  const db = makeDb({
    globalDoc: { version: 1, policies: { requireConfirm: true }, eventSchema: { required: ['date'] } },
    overrideDoc: {
      version: 2,
      overrides: { policies: { requireConfirm: false }, eventSchema: { required: ['date', 'address'] } },
    },
  });
  const { effective, meta } = await getEffectiveConfig(db, { eventId: 'evt1' });
  expect(effective.policies.requireConfirm).toBe(false);
  expect(effective.eventSchema.required).toEqual(['date', 'address']);
  expect(meta.global.version).toBe(1);
  expect(meta.override.version).toBe(2);
});

