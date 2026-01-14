const fs = require('node:fs');
const path = require('node:path');

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
      await db.collection('whatsapp_accounts').doc('wa_acc1').set({ id: 'wa_acc1', status: 'connected', name: 'A' });
      await db
        .collection('whatsapp_accounts')
        .doc('wa_acc1')
        .collection('private')
        .doc('state')
        .set({ qrCodeDataUrl: 'data:image/png;base64,AAA', pairingCode: '123-456' });

      // Seed WAL / leases / outbox
      await db.collection('whatsapp_ingest').doc('wa_acc1_c1_k1').set({ accountId: 'wa_acc1', chatId: 'c1', eventType: 'message', waMessageKey: 'k1', payload: { x: 1 }, receivedAt: new Date(), processed: false, processedAt: null, processAttempts: 0, lastProcessError: null });
      await db.collection('whatsapp_account_leases').doc('wa_acc1').set({ ownerInstanceId: 'i1', leaseUntil: new Date(Date.now() + 60_000), updatedAt: new Date() });
      await db.collection('whatsapp_outbox').doc('cmd1').set({ threadId: 'wa_acc1_c1', accountId: 'wa_acc1', chatId: 'c1', to: 'c1', text: 'hi', createdAt: new Date(), createdByUid: 'u', status: 'queued', attempts: 0, lastError: null, dedupeKey: 'd', waMessageKey: null, lastTriedAt: null });
      await db.collection('whatsapp_alerts').doc('a1').set({ type: 'degraded', createdAt: new Date() });
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

  test('whatsapp_accounts public doc is employee-readable; private QR is super-admin only', async () => {
    const empDb = ctxEmployee(uidEmp).firestore();
    const superDb = ctxSuperAdmin().firestore();

    await assertSucceeds(empDb.collection('whatsapp_accounts').doc('wa_acc1').get());
    await assertFails(empDb.collection('whatsapp_accounts').doc('wa_acc1').collection('private').doc('state').get());

    await assertSucceeds(superDb.collection('whatsapp_accounts').doc('wa_acc1').get());
    await assertSucceeds(superDb.collection('whatsapp_accounts').doc('wa_acc1').collection('private').doc('state').get());
  });

  test('WAL / leases / outbox are server-only (super-admin read), no employee access', async () => {
    const empDb = ctxEmployee(uidEmp).firestore();
    const superDb = ctxSuperAdmin().firestore();

    await assertFails(empDb.collection('whatsapp_ingest').doc('wa_acc1_c1_k1').get());
    await assertFails(empDb.collection('whatsapp_account_leases').doc('wa_acc1').get());
    await assertFails(empDb.collection('whatsapp_outbox').doc('cmd1').get());
    await assertFails(empDb.collection('whatsapp_alerts').doc('a1').get());

    await assertSucceeds(superDb.collection('whatsapp_ingest').doc('wa_acc1_c1_k1').get());
    await assertSucceeds(superDb.collection('whatsapp_account_leases').doc('wa_acc1').get());
    await assertSucceeds(superDb.collection('whatsapp_outbox').doc('cmd1').get());
    await assertSucceeds(superDb.collection('whatsapp_alerts').doc('a1').get());

    await assertFails(empDb.collection('whatsapp_outbox').doc('x').set({ status: 'queued' }));
    await assertFails(empDb.collection('whatsapp_ingest').doc('x').set({ processed: false }));
    await assertFails(empDb.collection('whatsapp_account_leases').doc('wa_acc1').set({ ownerInstanceId: 'x' }));
  });

  test('users/{uid}/whatsapp_thread_prefs is owner-only read/write', async () => {
    const empDb = ctxEmployee(uidEmp).firestore();
    const otherDb = ctxEmployee(uidOther).firestore();

    await assertSucceeds(empDb.collection('users').doc(uidEmp).collection('whatsapp_thread_prefs').doc('t1').set({ pinned: true, lastReadAt: new Date() }));
    await assertSucceeds(empDb.collection('users').doc(uidEmp).collection('whatsapp_thread_prefs').doc('t1').get());
    await assertFails(otherDb.collection('users').doc(uidEmp).collection('whatsapp_thread_prefs').doc('t1').get());
  });

  test('whatsapp_thread_notes are employee-readable and employee-creatable (immutable)', async () => {
    const empDb = ctxEmployee(uidEmp).firestore();
    const superDb = ctxSuperAdmin().firestore();

    await assertSucceeds(
      empDb
        .collection('whatsapp_thread_notes')
        .doc('t1')
        .collection('notes')
        .doc('n1')
        .set({ threadId: 't1', uid: uidEmp, text: 'note', createdAt: new Date() })
    );
    await assertSucceeds(
      empDb
        .collection('whatsapp_thread_notes')
        .doc('t1')
        .collection('notes')
        .doc('n1')
        .get()
    );

    // immutable
    await assertFails(
      empDb
        .collection('whatsapp_thread_notes')
        .doc('t1')
        .collection('notes')
        .doc('n1')
        .update({ text: 'x' })
    );

    // super-admin can read too (as employee)
    await assertSucceeds(
      superDb
        .collection('whatsapp_thread_notes')
        .doc('t1')
        .collection('notes')
        .doc('n1')
        .get()
    );
  });
});

