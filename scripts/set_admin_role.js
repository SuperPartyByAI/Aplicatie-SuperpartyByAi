#!/usr/bin/env node
/**
 * Auto-detect current user and set admin role
 * Uses Firebase Admin SDK locally
 * 
 * Usage: node scripts/set_admin_role.js
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Admin SDK (requires GOOGLE_APPLICATION_CREDENTIALS or gcloud auth)
try {
  admin.initializeApp({
    projectId: 'superparty-frontend',
  });
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
  console.error('\nℹ️  Make sure you have authenticated:');
  console.error('   gcloud auth application-default login');
  console.error('   OR set GOOGLE_APPLICATION_CREDENTIALS environment variable');
  process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();

// Allowlist: only these emails can become admin
const ADMIN_ALLOWLIST = [
  'superpartybyai@gmail.com',
  'ursache.andrei1995@gmail.com',
];

/**
 * Auto-detect user from Firebase Auth by email
 */
async function detectUser(email) {
  try {
    const userRecord = await auth.getUserByEmail(email);
    return userRecord;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

/**
 * Set admin role for user (Firestore + Custom Claims)
 */
async function setAdminRole(uid, email) {
  console.log(`\n🔧 Setting admin role for ${email} (${uid})...`);

  // 1. Set Firestore role
  await db.collection('users').doc(uid).set(
    {
      role: 'admin',
      email: email,
      adminSetAt: admin.firestore.FieldValue.serverTimestamp(),
      adminSetBy: 'auto-script',
    },
    { merge: true }
  );
  console.log('✅ Firestore: users/' + uid + '.role = "admin"');

  // 2. Set custom claims
  try {
    await auth.setCustomUserClaims(uid, { admin: true });
    console.log('✅ Custom claim: admin=true');
  } catch (error) {
    console.warn('⚠️  Could not set custom claim:', error.message);
    console.warn('   (Firestore role is sufficient for most cases)');
  }

  console.log('\n🎉 Admin access granted successfully!');
}

/**
 * Verify admin role is set
 */
async function verifyAdminRole(uid) {
  // Check Firestore
  const userDoc = await db.collection('users').doc(uid).get();
  const userData = userDoc.data() || {};
  const firestoreRole = userData.role;

  // Check custom claims
  let customClaim = null;
  try {
    const userRecord = await auth.getUser(uid);
    customClaim = userRecord.customClaims?.admin;
  } catch (error) {
    console.warn('⚠️  Could not read custom claims:', error.message);
  }

  console.log('\n📊 Verification:');
  console.log('   Firestore role:', firestoreRole === 'admin' ? '✅ admin' : '❌ ' + (firestoreRole || 'not set'));
  console.log('   Custom claim:', customClaim === true ? '✅ true' : '⚠️  ' + (customClaim || 'not set'));

  return firestoreRole === 'admin';
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Auto-detecting user for admin setup...\n');

  // Try to detect user from allowlist
  let targetUser = null;
  for (const email of ADMIN_ALLOWLIST) {
    const user = await detectUser(email);
    if (user) {
      console.log(`✅ Found: ${email} (UID: ${user.uid})`);
      targetUser = user;
      break;
    } else {
      console.log(`❌ Not found: ${email}`);
    }
  }

  if (!targetUser) {
    console.error('\n❌ No allowlisted users found in Firebase Auth.');
    console.error('   Users must sign in at least once in the app first.');
    process.exit(1);
  }

  // Confirm before proceeding
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question(`\n⚠️  Set admin role for ${targetUser.email}? (y/N): `, resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'y') {
    console.log('❌ Cancelled by user.');
    process.exit(0);
  }

  // Set admin role
  await setAdminRole(targetUser.uid, targetUser.email);

  // Verify
  const success = await verifyAdminRole(targetUser.uid);
  if (!success) {
    console.error('\n❌ Verification failed. Admin role not set correctly.');
    process.exit(1);
  }

  console.log('\n✅ All done! User can now access admin features.');
  console.log('   Sign out and sign in again in the app to refresh token.');
}

// Run
main().catch((error) => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
