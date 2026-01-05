#!/usr/bin/env node

/**
 * Setup Evenimente Collection in Firestore
 *
 * This script creates the evenimente collection with sample data
 * and proper structure for the SuperParty app.
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
// Try multiple initialization methods
let initialized = false;

// Method 1: Use existing app if available
if (admin.apps.length > 0) {
  console.log('✅ Using existing Firebase Admin app');
  initialized = true;
} else {
  // Method 2: Try service account file
  let serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!serviceAccountPath) {
    // Try multiple locations
    const possiblePaths = [
      path.join(__dirname, '../firebase-adminsdk.json'),
      path.join(__dirname, '../../firebase-adminsdk.json'),
      path.join(process.cwd(), 'firebase-adminsdk.json'),
    ];

    for (const p of possiblePaths) {
      if (require('fs').existsSync(p)) {
        serviceAccountPath = p;
        break;
      }
    }
  }

  if (serviceAccountPath) {
    try {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'superparty-frontend',
      });
      console.log('✅ Firebase Admin initialized with service account');
      initialized = true;
    } catch (error) {
      console.error('❌ Error with service account:', error.message);
    }
  }

  if (!initialized) {
    // Method 3: Try default credentials (works in Cloud Functions)
    try {
      admin.initializeApp({
        projectId: 'superparty-frontend',
      });
      console.log('✅ Firebase Admin initialized with default credentials');
      initialized = true;
    } catch (error2) {
      console.error('❌ Error initializing Firebase Admin:', error2.message);
      console.log('\nTry one of these methods:');
      console.log('1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable');
      console.log('2. Place firebase-adminsdk.json in project root');
      console.log('3. Run from Firebase Functions environment');
      process.exit(1);
    }
  }
}

const db = admin.firestore();

/**
 * Sample evenimente data
 * Structure matches the Flutter app expectations:
 * - nume: string (event name)
 * - data: Timestamp (event date/time)
 * - locatie: string (location)
 * - participanti: number (number of participants)
 * - status: string ('activ' | 'viitor' | 'trecut')
 * - descriere: string (optional description)
 */
const sampleEvents = [
  {
    nume: 'Petrecere Revelion 2024',
    data: admin.firestore.Timestamp.fromDate(new Date('2024-12-31T22:00:00')),
    locatie: 'Grand Hotel Bucharest',
    participanti: 250,
    status: 'viitor',
    descriere: 'Petrecere de Revelion cu DJ live și show de artificii',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    nume: 'Nuntă Maria & Ion',
    data: admin.firestore.Timestamp.fromDate(new Date('2024-06-15T18:00:00')),
    locatie: 'Conacul din Parc',
    participanti: 150,
    status: 'trecut',
    descriere: 'Eveniment privat - nuntă cu ceremonie în aer liber',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    nume: 'Corporate Party TechCorp',
    data: admin.firestore.Timestamp.fromDate(new Date('2024-12-20T19:00:00')),
    locatie: 'Sala Palatului',
    participanti: 500,
    status: 'activ',
    descriere: 'Petrecere corporativă de final de an cu catering premium',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    nume: 'Botez Andrei',
    data: admin.firestore.Timestamp.fromDate(new Date('2024-11-10T12:00:00')),
    locatie: 'Restaurant Belvedere',
    participanti: 80,
    status: 'trecut',
    descriere: 'Botez cu animatori pentru copii și meniu special',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    nume: 'Petrecere Crăciun',
    data: admin.firestore.Timestamp.fromDate(new Date('2024-12-24T20:00:00')),
    locatie: 'Club Vintage',
    participanti: 200,
    status: 'viitor',
    descriere: 'Petrecere tematică de Crăciun cu Moș Crăciun și cadouri',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    nume: 'Aniversare 30 ani Alexandra',
    data: admin.firestore.Timestamp.fromDate(new Date('2025-01-15T21:00:00')),
    locatie: 'Terasa Panoramic',
    participanti: 120,
    status: 'viitor',
    descriere: 'Petrecere privată cu DJ și bar deschis',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    nume: 'Team Building StartupHub',
    data: admin.firestore.Timestamp.fromDate(new Date('2024-10-05T10:00:00')),
    locatie: 'Baza Sportivă Snagov',
    participanti: 60,
    status: 'trecut',
    descriere: 'Activități outdoor și grătar pentru echipă',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    nume: 'Gală Premiilor SuperParty',
    data: admin.firestore.Timestamp.fromDate(new Date('2025-02-14T19:00:00')),
    locatie: 'Ateneul Român',
    participanti: 300,
    status: 'viitor',
    descriere: 'Eveniment anual de premiere a celor mai bune evenimente',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
];

async function setupEvenimente() {
  console.log('\n🚀 Starting Evenimente collection setup...\n');

  try {
    // Check if collection exists and has data
    const existingEvents = await db.collection('evenimente').limit(1).get();

    if (!existingEvents.empty) {
      console.log('⚠️  Evenimente collection already has data.');
      console.log('Do you want to:');
      console.log('  1. Skip (keep existing data)');
      console.log('  2. Add sample data alongside existing');
      console.log('  3. Clear and recreate (DESTRUCTIVE)');
      console.log('\nDefaulting to option 2 (add sample data)...\n');
    }

    // Add sample events
    console.log('📝 Adding sample evenimente...\n');

    const batch = db.batch();
    let count = 0;

    for (const event of sampleEvents) {
      const docRef = db.collection('evenimente').doc();
      batch.set(docRef, event);
      count++;
      console.log(`  ✓ ${event.nume} (${event.status})`);
    }

    await batch.commit();

    console.log(`\n✅ Successfully added ${count} evenimente to Firestore`);
    console.log('\n📊 Collection structure:');
    console.log('  Collection: evenimente');
    console.log('  Fields:');
    console.log('    - nume: string (required)');
    console.log('    - data: Timestamp (required)');
    console.log('    - locatie: string (required)');
    console.log('    - participanti: number (required)');
    console.log('    - status: string (required: activ|viitor|trecut)');
    console.log('    - descriere: string (optional)');
    console.log('    - createdAt: Timestamp (auto)');
    console.log('    - updatedAt: Timestamp (auto)');

    console.log('\n🔒 Security Rules:');
    console.log('  - Read: All authenticated users');
    console.log('  - Write: Admin only');

    console.log('\n✨ Setup complete! Check Firebase Console:');
    console.log(
      '  https://console.firebase.google.com/project/superparty-frontend/firestore/data/evenimente'
    );
  } catch (error) {
    console.error('\n❌ Error setting up evenimente:', error);
    process.exit(1);
  }
}

// Run setup
setupEvenimente()
  .then(() => {
    console.log('\n👋 Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
