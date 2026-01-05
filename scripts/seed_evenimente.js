#!/usr/bin/env node

/**
 * Script pentru popularea colecției 'evenimente' cu date reale
 *
 * Rulare:
 * node scripts/seed_evenimente.js
 *
 * Necesită:
 * - firebase-admin configurat
 * - firebase-adminsdk.json în root
 */

const admin = require('firebase-admin');
const path = require('path');

// Inițializare Firebase Admin
const serviceAccount = require(path.join(__dirname, '..', 'firebase-adminsdk.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Date seed pentru evenimente
const evenimente = [
  {
    nume: 'Petrecere Maria - 5 ani',
    locatie: 'București, Sector 3, Str. Florilor nr. 10',
    data: new Date('2026-01-15T14:00:00'),
    tipEveniment: 'petrecere_copii',
    tipLocatie: 'acasa',
    requiresSofer: false,
    alocari: {
      animator_principal: {
        userId: null,
        status: 'unassigned',
      },
      asistent: {
        userId: null,
        status: 'unassigned',
      },
    },
    sofer: {
      required: false,
      userId: null,
      status: 'not_required',
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: 'seed_script',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'seed_script',
  },
  {
    nume: 'Petrecere Andrei - 6 ani',
    locatie: 'Cluj-Napoca, Str. Memorandumului nr. 28',
    data: new Date('2026-01-20T18:30:00'),
    tipEveniment: 'petrecere_copii',
    tipLocatie: 'local',
    requiresSofer: true,
    alocari: {
      animator_principal: {
        userId: null,
        status: 'unassigned',
      },
    },
    sofer: {
      required: true,
      userId: null,
      status: 'unassigned',
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: 'seed_script',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'seed_script',
  },
  {
    nume: 'Petrecere Sofia - 4 ani',
    locatie: 'Iași, Str. Lăpușneanu nr. 15',
    data: new Date('2026-01-28T16:00:00'),
    tipEveniment: 'petrecere_copii',
    tipLocatie: 'sala',
    requiresSofer: true,
    alocari: {
      animator_principal: {
        userId: null,
        status: 'unassigned',
      },
      asistent: {
        userId: null,
        status: 'unassigned',
      },
    },
    sofer: {
      required: true,
      userId: null,
      status: 'unassigned',
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: 'seed_script',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'seed_script',
  },
  {
    nume: 'Petrecere Daria - 7 ani',
    locatie: 'Ploiești, Str. Republicii nr. 45',
    data: new Date('2026-02-05T12:00:00'),
    tipEveniment: 'petrecere_copii',
    tipLocatie: 'acasa',
    requiresSofer: false,
    alocari: {
      animator_principal: {
        userId: null,
        status: 'unassigned',
      },
      vata_zahar: {
        userId: null,
        status: 'unassigned',
      },
    },
    sofer: {
      required: false,
      userId: null,
      status: 'not_required',
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: 'seed_script',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'seed_script',
  },
  {
    nume: 'Petrecere Rareș - 5 ani',
    locatie: 'București, Sector 2, Str. Dorobanți nr. 88',
    data: new Date('2026-01-18T11:00:00'),
    tipEveniment: 'petrecere_copii',
    tipLocatie: 'sala',
    requiresSofer: false,
    alocari: {
      animator_principal: {
        userId: null,
        status: 'unassigned',
      },
    },
    sofer: {
      required: false,
      userId: null,
      status: 'not_required',
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: 'seed_script',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'seed_script',
  },
  {
    nume: 'Petrecere Elena - 6 ani',
    locatie: 'Brașov, Str. Republicii nr. 12',
    data: new Date('2026-01-22T15:00:00'),
    tipEveniment: 'petrecere_copii',
    tipLocatie: 'local',
    requiresSofer: true,
    alocari: {
      animator_principal: {
        userId: null,
        status: 'unassigned',
      },
    },
    sofer: {
      required: true,
      userId: null,
      status: 'unassigned',
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: 'seed_script',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'seed_script',
  },
  {
    nume: 'Petrecere Matei - 8 ani',
    locatie: 'Constanța, Str. Traian nr. 34',
    data: new Date('2026-01-25T19:00:00'),
    tipEveniment: 'petrecere_copii',
    tipLocatie: 'acasa',
    requiresSofer: false,
    alocari: {
      animator_principal: {
        userId: null,
        status: 'unassigned',
      },
    },
    sofer: {
      required: false,
      userId: null,
      status: 'not_required',
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: 'seed_script',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'seed_script',
  },
];

async function seedEvenimente() {
  try {
    console.log('🌱 Începem seed-ul pentru evenimente...\n');

    const batch = db.batch();
    const colRef = db.collection('evenimente');

    // Verificăm dacă există deja evenimente
    const existingDocs = await colRef.limit(1).get();
    if (!existingDocs.empty) {
      console.log('⚠️  Colecția "evenimente" conține deja date.');
      console.log('   Dorești să continui? (va adăuga evenimente noi)\n');
      // În producție, aici ai putea adăuga un prompt pentru confirmare
    }

    evenimente.forEach(eveniment => {
      const docRef = colRef.doc();
      batch.set(docRef, eveniment);
      console.log(`✅ Pregătit eveniment: ${eveniment.nume}`);
    });

    await batch.commit();

    console.log(`\n🎉 Seed complet! ${evenimente.length} evenimente adăugate în Firestore.`);
    console.log('\n📊 Statistici:');
    console.log(
      `   - Evenimente cu șofer necesar: ${evenimente.filter(e => e.requiresSofer).length}`
    );
    console.log(`   - Evenimente fără șofer: ${evenimente.filter(e => !e.requiresSofer).length}`);
    console.log(
      `   - Total roluri nealocate: ${evenimente.reduce((sum, e) => sum + Object.keys(e.alocari).length, 0)}`
    );

    process.exit(0);
  } catch (error) {
    console.error('❌ Eroare la seed:', error);
    process.exit(1);
  }
}

// Rulare
seedEvenimente();
