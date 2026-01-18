// Temporary script to set admin role
const admin = require('firebase-admin');

// Initialize with application default credentials
admin.initializeApp({
  projectId: 'superparty-frontend'
});

const uid = 'FBQUjlK2dFNjv9uvUOseV85uXmE3';
const email = 'ursache.andrei1995@gmail.com';

(async () => {
  try {
    console.log(`Setting admin role for ${email} (uid: ${uid})...`);
    
    // Set Firestore role field
    await admin.firestore().collection('users').doc(uid).set({
      role: 'admin',
      email: email
    }, { merge: true });
    
    console.log('✅ SUCCESS: Set role=admin in Firestore users/' + uid);
    
    // Try to set custom claim (may fail without service account key, but Firestore is enough)
    try {
      await admin.auth().setCustomUserClaims(uid, { admin: true });
      console.log('✅ SUCCESS: Set admin custom claim');
    } catch (err) {
      console.log('⚠️  Could not set custom claim (Firestore role is sufficient):', err.message);
    }
    
    console.log('\n🎉 User is now admin! Restart the Flutter app to see changes.');
    process.exit(0);
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
})();
