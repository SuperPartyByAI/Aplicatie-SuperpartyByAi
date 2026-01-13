/**
 * Seed /ai_config/global with a production-safe baseline config.
 *
 * Usage:
 * - Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON
 * - Optionally set FIRESTORE_EMULATOR_HOST for local emulator
 * - Optionally set FIREBASE_PROJECT_ID (or rely on ADC)
 *
 * Run:
 *   node seed_ai_config_global.js
 */
'use strict';

const admin = require('firebase-admin');

function getProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    null
  );
}

const GLOBAL_PUBLIC = {
  eventSchema: {
    required: ['date', 'address'],
    fields: {
      date: { type: 'string', label: 'Data (DD-MM-YYYY)' },
      address: { type: 'string', label: 'Adresă / Locație' },
      clientPhone: { type: 'string', label: 'Telefon client' },
      clientName: { type: 'string', label: 'Nume client' },
    },
  },
  rolesCatalog: {
    ANIMATOR: {
      defaultDurationMin: 120,
      requiredFields: ['characterName'],
      optionalFields: ['notes'],
      synonyms: ['animator', 'mc', 'host'],
      detailsSchema: {
        characterName: { type: 'string', label: 'Personaj' },
        notes: { type: 'string', label: 'Observații' },
      },
    },
    URSITOARE: {
      defaultDurationMin: 120,
      requiredFields: ['count'],
      optionalFields: ['rea', 'notes'],
      synonyms: ['ursitoare', 'ursitoare 3', 'ursitoare 4', 'ursitoare rea'],
      detailsSchema: {
        count: { type: 'number', label: 'Număr ursitoare (3/4)' },
        rea: { type: 'boolean', label: 'Include Ursitoarea Rea' },
        notes: { type: 'string', label: 'Observații' },
      },
    },
    COTTON_CANDY: {
      defaultDurationMin: 120,
      requiredFields: [],
      optionalFields: ['notes'],
      synonyms: ['vata', 'vata de zahar', 'cotton candy'],
      detailsSchema: { notes: { type: 'string', label: 'Observații' } },
    },
    POPCORN: {
      defaultDurationMin: 120,
      requiredFields: [],
      optionalFields: ['notes'],
      synonyms: ['popcorn'],
      detailsSchema: { notes: { type: 'string', label: 'Observații' } },
    },
    ARCADE: {
      defaultDurationMin: 180,
      requiredFields: [],
      optionalFields: ['notes'],
      synonyms: ['arcade', 'jocuri', 'console'],
      detailsSchema: { notes: { type: 'string', label: 'Observații' } },
    },
    DECORATIONS: {
      defaultDurationMin: 0,
      requiredFields: [],
      optionalFields: ['theme', 'notes'],
      synonyms: ['decor', 'decoratiuni', 'decorations'],
      detailsSchema: {
        theme: { type: 'string', label: 'Temă' },
        notes: { type: 'string', label: 'Observații' },
      },
    },
    BALLOONS: {
      defaultDurationMin: 0,
      requiredFields: [],
      optionalFields: ['count', 'notes'],
      synonyms: ['baloane', 'balloons'],
      detailsSchema: {
        count: { type: 'number', label: 'Nr. baloane' },
        notes: { type: 'string', label: 'Observații' },
      },
    },
    HELIUM_BALLOONS: {
      defaultDurationMin: 0,
      requiredFields: [],
      optionalFields: ['count', 'notes'],
      synonyms: ['baloane cu heliu', 'helium balloons'],
      detailsSchema: {
        count: { type: 'number', label: 'Nr. baloane cu heliu' },
        notes: { type: 'string', label: 'Observații' },
      },
    },
    SANTA_CLAUS: {
      defaultDurationMin: 60,
      requiredFields: [],
      optionalFields: ['notes'],
      synonyms: ['mos craciun', 'santa'],
      detailsSchema: { notes: { type: 'string', label: 'Observații' } },
    },
    DRY_ICE: {
      defaultDurationMin: 0,
      requiredFields: [],
      optionalFields: ['notes'],
      synonyms: ['gheata carbonica', 'dry ice'],
      detailsSchema: { notes: { type: 'string', label: 'Observații' } },
    },
  },
  uiTemplates: {},
};

const GLOBAL_PRIVATE = {
  policies: { requireConfirm: true, askOneQuestion: true },
  systemPrompt: null,
  systemPromptAppend: null,
};

async function main() {
  const projectId = getProjectId();
  if (!admin.apps.length) {
    admin.initializeApp(projectId ? { projectId } : undefined);
  }

  const db = admin.firestore();
  const publicRef = db.collection('ai_config').doc('global');
  const privateRef = db.collection('ai_config_private').doc('global');

  const [pubSnap, privSnap] = await Promise.all([publicRef.get(), privateRef.get()]);
  const pubVer =
    pubSnap.exists && pubSnap.data() && typeof pubSnap.data().version === 'number'
      ? pubSnap.data().version
      : 0;
  const privVer =
    privSnap.exists && privSnap.data() && typeof privSnap.data().version === 'number'
      ? privSnap.data().version
      : 0;

  const publicNext = {
    ...GLOBAL_PUBLIC,
    version: pubVer + 1,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'seed_script',
  };
  const privateNext = {
    ...GLOBAL_PRIVATE,
    version: privVer + 1,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'seed_script',
  };

  await Promise.all([
    publicRef.set(publicNext, { merge: true }),
    privateRef.set(privateNext, { merge: true }),
  ]);

  // eslint-disable-next-line no-console
  console.log('Seeded /ai_config/global and /ai_config_private/global.');
  // eslint-disable-next-line no-console
  console.log('Written versions:', { public: publicNext.version, private: privateNext.version });
  // eslint-disable-next-line no-console
  console.log('Template JSON (for console paste):');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ public: publicNext, private: privateNext }, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exitCode = 1;
});

