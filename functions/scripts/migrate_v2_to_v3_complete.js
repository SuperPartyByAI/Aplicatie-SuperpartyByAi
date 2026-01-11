#!/usr/bin/env node

/**
 * COMPLETE V2 → V3 Migration Script
 * 
 * Handles REAL v2 documents with:
 * - Keys with spaces/diacritics ("Versiune schemă", "creat de", etc.)
 * - roles[] array with slot letters ("B", "C", "O")
 * - incasare with Romanian fields
 * - Deterministic eventShortId allocation
 * - Idempotent (can run multiple times)
 * - DRY_RUN mode for testing
 * 
 * Usage:
 *   DRY_RUN=true node scripts/migrate_v2_to_v3_complete.js
 *   node scripts/migrate_v2_to_v3_complete.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../functions/serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const DRY_RUN = process.env.DRY_RUN === 'true';

console.log('═'.repeat(80));
console.log('🔄 V2 → V3 MIGRATION SCRIPT');
console.log('═'.repeat(80));
console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '✍️  WRITE MODE'}`);
console.log('');

// Statistics
const stats = {
  total: 0,
  migrated: 0,
  skipped: 0,
  errors: 0,
  examples: [],
};

/**
 * Get or create eventShortId counter
 */
async function getNextEventShortId() {
  const counterRef = db.collection('counters').doc('eventShortCode');
  
  return db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    
    let currentValue = 0;
    if (counterDoc.exists) {
      currentValue = counterDoc.data().value || 0;
    }
    
    const nextValue = currentValue + 1;
    
    if (!DRY_RUN) {
      if (counterDoc.exists) {
        transaction.update(counterRef, {
          value: nextValue,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.set(counterRef, {
          value: nextValue,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
    
    return nextValue;
  });
}

/**
 * Normalize field name (handle keys with spaces/diacritics)
 */
function normalizeFieldName(obj, possibleKeys) {
  for (const key of possibleKeys) {
    if (obj[key] !== undefined) {
      return obj[key];
    }
  }
  return null;
}

/**
 * Convert roles[] array to rolesBySlot map
 */
function convertRolesToRolesBySlot(roles, eventShortId) {
  if (!Array.isArray(roles) || roles.length === 0) {
    return {};
  }
  
  const rolesBySlot = {};
  const prefix = String(eventShortId).padStart(2, '0');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  roles.forEach((role, index) => {
    // Get slot letter from role or generate from index
    let letter = role.slot || role.Slot || alphabet[index];
    
    // Ensure single letter
    if (letter && letter.length > 1) {
      letter = letter[0].toUpperCase();
    } else if (letter) {
      letter = letter.toUpperCase();
    } else {
      letter = alphabet[index];
    }
    
    const slotKey = `${prefix}${letter}`;
    
    // Map role fields (handle keys with spaces)
    rolesBySlot[slotKey] = {
      slot: slotKey,
      roleType: role.roleType || role.tip || role.type || 'UNKNOWN',
      label: role.label || role.eticheta || role.etichetă || role.Label || '',
      startTime: role.startTime || role.timp || role.time || role.oraStart || null,
      durationMin: role.durationMin || role.durataMin || role['durată min'] || role.duratăMin || 0,
      status: role.status || role.stare || 'PENDING',
      assigneeUid: role.assigneeUid || role.asignatUid || null,
      assigneeCode: role.assigneeCode || role.asignatCod || null,
      assignedCode: role.assignedCode || role['Cod atribuit'] || role.codAtribuit || null,
      pendingCode: role.pendingCode || role['Cod în așteptare'] || role['Cod in asteptare'] || role.codInAsteptare || null,
      details: role.details || role.detalii || {},
      note: role.note || role.nota || role.notă || null,
      resources: role.resources || role.resurse || [],
    };
  });
  
  return rolesBySlot;
}

/**
 * Migrate single event document
 */
async function migrateEvent(doc) {
  const docId = doc.id;
  const data = doc.data();
  
  try {
    // Check if already v3
    const schemaVersion = data.schemaVersion || data['Versiune schemă'] || data.versiuneSchema || 0;
    
    if (schemaVersion === 3) {
      stats.skipped++;
      return { success: true, skipped: true, reason: 'Already v3' };
    }
    
    // Get or generate eventShortId
    let eventShortId = data.eventShortId;
    if (!eventShortId || typeof eventShortId !== 'number') {
      eventShortId = await getNextEventShortId();
    }
    
    // Convert roles[] to rolesBySlot
    const roles = data.roles || data.roluri || [];
    const rolesBySlot = convertRolesToRolesBySlot(roles, eventShortId);
    
    // Map payment fields
    const incasare = data.incasare || data.payment || {};
    const payment = {
      status: incasare.stare === 'NEINCASAT' ? 'UNPAID' : 
              incasare.stare === 'INCASAT' ? 'PAID' :
              incasare.stare === 'ANULAT' ? 'CANCELLED' :
              incasare.status || 'UNPAID',
      method: incasare.metoda || incasare.metodă || incasare.method || null,
      amount: incasare.suma || incasare.sumă || incasare.amount || 0,
    };
    
    // Build v3 document
    const v3Doc = {
      schemaVersion: 3,
      eventShortId,
      
      // Event details
      date: data.date || data.data || null,
      address: data.address || data.adresa || null,
      
      // Phone
      phoneE164: data.phoneE164 || data.telefonClientE164 || null,
      phoneRaw: data.phoneRaw || data.telefonClientRaw || null,
      
      // Child details
      childName: data.childName || data.sarbatoritNume || data.sărbătoritNume || null,
      childAge: data.childAge || data.sarbatoritVarsta || data.sărbătoritVârstă || 0,
      childDob: data.childDob || data.sarbatoritDataNastere || data.sărbătoritDataNaștere || null,
      
      // Parent details
      parentName: data.parentName || data.numeParinte || data.numeParinte || null,
      parentPhone: data.parentPhone || data.telefonParinte || data.telefonParinte || null,
      numChildren: data.numChildren || data.nrCopiiAprox || data.numarCopii || null,
      
      // Roles and payment
      rolesBySlot,
      payment,
      
      // Archive status
      isArchived: data.isArchived || data.esteArhivat || data['este arhivat'] || false,
      archivedAt: data.archivedAt || data.arhivatLa || null,
      archivedBy: data.archivedBy || data.arhivatDe || data['arhivat de'] || null,
      archiveReason: data.archiveReason || data.motivArhivare || null,
      
      // Staff
      notedByCode: data.notedByCode || data.notatDeCod || data.cineNoteaza || null,
      
      // Audit fields
      createdAt: data.createdAt || data.creatLa || data['creat la'] || admin.firestore.FieldValue.serverTimestamp(),
      createdBy: data.createdBy || data.creatDe || data['creat de'] || null,
      createdByEmail: data.createdByEmail || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: data.updatedBy || data.actualizatDe || data['actualizat de'] || 'migration_script',
      
      // Client request ID
      clientRequestId: data.clientRequestId || null,
    };
    
    // Track missing fields
    const missingFields = [];
    if (!v3Doc.phoneE164) missingFields.push('phoneE164');
    if (!v3Doc.date) missingFields.push('date');
    if (!v3Doc.address) missingFields.push('address');
    
    // Write to Firestore
    if (!DRY_RUN) {
      await db.collection('evenimente').doc(docId).set(v3Doc, { merge: false });
      
      // Log migration in history
      await db.collection('evenimente').doc(docId).collection('history').add({
        type: 'DATA_CHANGE',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        action: 'MIGRATION_V2_TO_V3',
        eventShortId,
        roleSlots: Object.keys(rolesBySlot),
        before: { schemaVersion: schemaVersion || 2 },
        after: { schemaVersion: 3, eventShortId },
        missingFields,
        sourceMessageIds: [],
      });
    }
    
    stats.migrated++;
    
    // Save example
    if (stats.examples.length < 3) {
      stats.examples.push({
        docId,
        eventShortId,
        before: {
          schemaVersion: schemaVersion || 2,
          rolesCount: roles.length,
          hasSpaceKeys: Object.keys(data).some(k => k.includes(' ')),
        },
        after: {
          schemaVersion: 3,
          eventShortId,
          rolesBySlotKeys: Object.keys(rolesBySlot),
        },
        missingFields,
      });
    }
    
    return { success: true, eventShortId, missingFields };
    
  } catch (error) {
    stats.errors++;
    console.error(`❌ Error migrating ${docId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main migration function
 */
async function main() {
  try {
    // Get all events
    const snapshot = await db.collection('evenimente').get();
    stats.total = snapshot.size;
    
    console.log(`📊 Found ${stats.total} events to process`);
    console.log('');
    
    // Process each event
    for (const doc of snapshot.docs) {
      const result = await migrateEvent(doc);
      
      if (result.success && !result.skipped) {
        console.log(`✅ Migrated: ${doc.id} → eventShortId: ${result.eventShortId}`);
        if (result.missingFields && result.missingFields.length > 0) {
          console.log(`   ⚠️  Missing fields: ${result.missingFields.join(', ')}`);
        }
      } else if (result.skipped) {
        console.log(`⏭️  Skipped: ${doc.id} (${result.reason})`);
      } else {
        console.log(`❌ Failed: ${doc.id} - ${result.error}`);
      }
    }
    
    console.log('');
    console.log('═'.repeat(80));
    console.log('📊 MIGRATION SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Total events:     ${stats.total}`);
    console.log(`✅ Migrated:      ${stats.migrated}`);
    console.log(`⏭️  Skipped:       ${stats.skipped}`);
    console.log(`❌ Errors:        ${stats.errors}`);
    console.log('');
    
    if (stats.examples.length > 0) {
      console.log('📝 EXAMPLES:');
      console.log('─'.repeat(80));
      stats.examples.forEach((ex, i) => {
        console.log(`\nExample ${i + 1}: ${ex.docId}`);
        console.log(`  Before: schemaVersion=${ex.before.schemaVersion}, roles=${ex.before.rolesCount}, spaceKeys=${ex.before.hasSpaceKeys}`);
        console.log(`  After:  schemaVersion=${ex.after.schemaVersion}, eventShortId=${ex.after.eventShortId}`);
        console.log(`  Slots:  ${ex.after.rolesBySlotKeys.join(', ')}`);
        if (ex.missingFields.length > 0) {
          console.log(`  ⚠️  Missing: ${ex.missingFields.join(', ')}`);
        }
      });
    }
    
    console.log('');
    console.log('═'.repeat(80));
    
    if (DRY_RUN) {
      console.log('🔍 DRY RUN COMPLETE - No changes written');
      console.log('   Run without DRY_RUN=true to apply changes');
    } else {
      console.log('✅ MIGRATION COMPLETE');
    }
    
    console.log('═'.repeat(80));
    console.log('');
    
    process.exit(0);
    
  } catch (error) {
    console.error('');
    console.error('❌ FATAL ERROR:', error);
    console.error('');
    process.exit(1);
  }
}

// Run migration
main();
