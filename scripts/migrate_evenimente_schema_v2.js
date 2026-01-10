#!/usr/bin/env node

/**
 * Migrare evenimente: RO → EN schema v2
 * 
 * Normalizează:
 * - adresa → address
 * - data (string) → date
 * - roluri[] → roles[] cu chei EN (eticheta→label, timp→time, etc.)
 * - incasare.stare → incasare.status
 * - este arhivat → isArchived
 * - slot: 01A→A, 01S→S (ultimul caracter)
 * 
 * Idempotent: rulează de 2 ori, a doua oară nu schimbă nimic.
 * DRY_RUN=1: afișează diff fără a scrie în Firestore.
 * 
 * Rulare:
 * DRY_RUN=1 node scripts/migrate_evenimente_schema_v2.js
 * node scripts/migrate_evenimente_schema_v2.js
 */

const admin = require('firebase-admin');
const path = require('path');

const DRY_RUN = process.env.DRY_RUN === '1';

// Initialize Firebase Admin
const serviceAccount = require(path.join(__dirname, '..', 'firebase-adminsdk.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Mapare chei RO → EN pentru roles
const ROLE_KEY_MAP = {
  'eticheta': 'label',
  'etichetă': 'label',
  'timp': 'time',
  'duratăMin': 'durationMin',
  'durataMin': 'durationMin',
  'Cod atribuit': 'assignedCode',
  'Cod în așteptare': 'pendingCode',
  'Cod in asteptare': 'pendingCode',
  'slot': 'slot',
};

function normalizeRole(role) {
  const normalized = {};
  
  for (const [key, value] of Object.entries(role)) {
    const normalizedKey = ROLE_KEY_MAP[key] || key;
    normalized[normalizedKey] = value;
  }
  
  // Normalizează slot: 01A → A, 01S → S (ultimul caracter)
  if (normalized.slot && normalized.slot.length > 1) {
    normalized.slot = normalized.slot.slice(-1);
  }
  
  return normalized;
}

function normalizeIncasare(incasare) {
  if (!incasare) return { status: 'NEINCASAT' };
  
  const normalized = { ...incasare };
  
  // stare → status
  if (incasare.stare && !incasare.status) {
    normalized.status = incasare.stare;
    delete normalized.stare;
  }
  
  return normalized;
}

async function migrateDocument(doc) {
  const data = doc.data();
  const updates = {};
  let hasChanges = false;
  
  // 1. adresa → address
  if (data.adresa && !data.address) {
    updates.address = data.adresa;
    updates.adresa = admin.firestore.FieldValue.delete();
    hasChanges = true;
  }
  
  // 2. data (string) → date (keep as string)
  if (data.data && !data.date) {
    updates.date = data.data;
    updates.data = admin.firestore.FieldValue.delete();
    hasChanges = true;
  }
  
  // 3. roluri[] → roles[]
  if (data.roluri && !data.roles) {
    updates.roles = data.roluri.map(normalizeRole);
    updates.roluri = admin.firestore.FieldValue.delete();
    hasChanges = true;
  } else if (data.roles) {
    // Normalizează roles existente (chei RO → EN)
    const normalizedRoles = data.roles.map(normalizeRole);
    const rolesChanged = JSON.stringify(normalizedRoles) !== JSON.stringify(data.roles);
    if (rolesChanged) {
      updates.roles = normalizedRoles;
      hasChanges = true;
    }
  }
  
  // 4. incasare.stare → incasare.status
  if (data.incasare) {
    const normalizedIncasare = normalizeIncasare(data.incasare);
    const incasareChanged = JSON.stringify(normalizedIncasare) !== JSON.stringify(data.incasare);
    if (incasareChanged) {
      updates.incasare = normalizedIncasare;
      hasChanges = true;
    }
  }
  
  // 5. este arhivat → isArchived
  if (data['este arhivat'] !== undefined && data.isArchived === undefined) {
    updates.isArchived = data['este arhivat'];
    updates['este arhivat'] = admin.firestore.FieldValue.delete();
    hasChanges = true;
  }
  
  return { hasChanges, updates };
}

async function migrate() {
  console.log('🔄 Migrare evenimente: RO → EN schema v2');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will write to Firestore)'}\n`);
  
  try {
    const snapshot = await db.collection('evenimente').get();
    console.log(`📋 Found ${snapshot.size} evenimente documents\n`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const doc of snapshot.docs) {
      const { hasChanges, updates } = await migrateDocument(doc);
      
      if (hasChanges) {
        console.log(`✏️  Event ${doc.id}:`);
        console.log('   Changes:');
        for (const [key, value] of Object.entries(updates)) {
          if (value === admin.firestore.FieldValue.delete()) {
            console.log(`     - DELETE ${key}`);
          } else if (Array.isArray(value)) {
            console.log(`     - ${key}: [${value.length} items]`);
          } else if (typeof value === 'object') {
            console.log(`     - ${key}: ${JSON.stringify(value)}`);
          } else {
            console.log(`     - ${key}: ${value}`);
          }
        }
        
        if (!DRY_RUN) {
          await doc.ref.update(updates);
          console.log('   ✅ Updated\n');
        } else {
          console.log('   ⏭️  Skipped (DRY_RUN)\n');
        }
        
        migratedCount++;
      } else {
        skippedCount++;
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   - Migrated: ${migratedCount}`);
    console.log(`   - Skipped (already v2): ${skippedCount}`);
    console.log(`   - Total: ${snapshot.size}`);
    
    if (DRY_RUN) {
      console.log('\n⚠️  DRY RUN mode - no changes written to Firestore');
      console.log('   Run without DRY_RUN=1 to apply changes');
    } else {
      console.log('\n✅ Migration complete!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

migrate();
