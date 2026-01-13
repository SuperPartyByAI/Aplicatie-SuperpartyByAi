const fs = require('fs');
const path = require('path');

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');

const shouldRun = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

(shouldRun ? describe : describe.skip)('Firestore security rules (emulator)', () => {
  /** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
  let testEnv;

  const projectId = 'demo-superparty-rules';
  const superEmail = 'ursache.andrei1995@gmail.com';

  const uidEmp = 'emp_uid_1';
  const uidOther = 'emp_uid_2';
  const uidSuper = 'super_uid';

  beforeAll(async () => {
    const rulesPath = path.join(__dirname, '..', '..', 'firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { rules },
    });

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Seed staff profiles so isEmployee() works.
      await db.collection('staffProfiles').doc(uidEmp).set({ role: 'staff', code: 'A1' });
      await db.collection('staffProfiles').doc(uidOther).set({ role: 'staff', code: 'B1' });

      // Seed an event to prove employee read works.
      await db.collection('evenimente').doc('event1').set({ date: '15-01-2026', address: 'Test', isArchived: false });

      // Seed WhatsApp flat data plane
      await db.collection('whatsapp_threads').doc('acc1_chat1').set({ id: 'acc1_chat1', accountId: 'acc1' });
      await db.collection('whatsapp_messages').doc('m1').set({ id: 'm1', threadId: 'acc1_chat1', accountId: 'acc1', body: 'hi' });

      // Seed control plane
      await db.collection('accounts').doc('acc1').set({ id: 'acc1', name: 'acc' });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  function ctxEmployee(uid) {
    return testEnv.authenticatedContext(uid, { email: `${uid}@example.com` });
  }
  function ctxSuperAdmin() {
    return testEnv.authenticatedContext(uidSuper, { email: superEmail });
  }

  test('ai_config is super-admin only', async () => {
    const empDb = ctxEmployee(uidEmp).firestore();
    await assertFails(empDb.collection('ai_config').doc('global').get());

    const superDb = ctxSuperAdmin().firestore();
    await assertSucceeds(superDb.collection('ai_config').doc('global').get());
  });

  test('conversationStates are owner-only', async () => {
    const empDb = ctxEmployee(uidEmp).firestore();
    const otherDb = ctxEmployee(uidOther).firestore();

    await assertSucceeds(empDb.collection('conversationStates').doc('s1').set({ ownerUid: uidEmp }));
    await assertSucceeds(empDb.collection('conversationStates').doc('s1').get());
    await assertFails(otherDb.collection('conversationStates').doc('s1').get());
  });

  test('conversations create/read are owner-only and userId is immutable', async () => {
    const empDb = ctxEmployee(uidEmp).firestore();
    const otherDb = ctxEmployee(uidOther).firestore();

    await assertSucceeds(empDb.collection('conversations').doc('c1').set({ userId: uidEmp, x: 1 }));
    await assertSucceeds(empDb.collection('conversations').doc('c1').get());
    await assertFails(otherDb.collection('conversations').doc('c1').get());

    // userId must not be changeable
    await assertFails(empDb.collection('conversations').doc('c1').update({ userId: uidOther }));
  });

  test('evenimente: employees can read but cannot write', async () => {
    const empDb = ctxEmployee(uidEmp).firestore();
    await assertSucceeds(empDb.collection('evenimente').doc('event1').get());
    await assertFails(empDb.collection('evenimente').doc('event2').set({ date: '15-01-2026', address: 'X' }));
    await assertFails(empDb.collection('evenimente').doc('event1').update({ address: 'Y' }));
  });

  test('WhatsApp data plane: employees can read, cannot write', async () => {
    const empDb = ctxEmployee(uidEmp).firestore();
    await assertSucceeds(empDb.collection('whatsapp_threads').doc('acc1_chat1').get());
    await assertSucceeds(empDb.collection('whatsapp_messages').doc('m1').get());

    await assertFails(empDb.collection('whatsapp_threads').doc('t2').set({ id: 't2' }));
    await assertFails(empDb.collection('whatsapp_messages').doc('m2').set({ id: 'm2' }));
  });

  test('WhatsApp control plane (accounts) is super-admin only', async () => {
    const empDb = ctxEmployee(uidEmp).firestore();
    const superDb = ctxSuperAdmin().firestore();

    await assertFails(empDb.collection('accounts').doc('acc1').get());
    await assertSucceeds(superDb.collection('accounts').doc('acc1').get());
  });
});

