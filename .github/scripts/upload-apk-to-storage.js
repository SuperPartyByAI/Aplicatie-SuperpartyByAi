const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'superparty-frontend.firebasestorage.app'
});

const bucket = admin.storage().bucket();

async function uploadAPK() {
  try {
    const apkPath = 'superparty_flutter/build/app/outputs/flutter-apk/app-release.apk';
    const destination = 'apk/app-release.apk'; // Changed to match documentation

    console.log('📦 Uploading APK to Firebase Storage...');
    console.log('Source:', apkPath);
    console.log('Destination:', destination);
    console.log('Bucket:', bucket.name);

    // Check if APK file exists
    if (!fs.existsSync(apkPath)) {
      throw new Error(`APK file not found at: ${apkPath}`);
    }

    const stats = fs.statSync(apkPath);
    console.log(`📊 APK size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Check if bucket exists
    try {
      const [exists] = await bucket.exists();
      if (!exists) {
        console.log('⚠️  Bucket does not exist');
        throw new Error('Storage bucket does not exist. Please create it in Firebase Console.');
      }
      console.log('✅ Bucket exists');
    } catch (bucketError) {
      console.error('❌ Error checking bucket:', bucketError.message);
      throw bucketError;
    }

    // Upload file
    console.log('⬆️  Starting upload...');
    await bucket.upload(apkPath, {
      destination: destination,
      metadata: {
        contentType: 'application/vnd.android.package-archive',
        cacheControl: 'public, max-age=0',
        metadata: {
          uploadedAt: new Date().toISOString(),
          uploadedBy: 'GitHub Actions',
        },
      },
      public: true,
    });

    console.log('✅ APK uploaded successfully!');
    
    // Get public URL
    const file = bucket.file(destination);
    const [metadata] = await file.getMetadata();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;
    
    console.log('📍 Public URL:', publicUrl);
    console.log('📍 Firebase URL:', `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error uploading APK:', error.message);
    console.error(error);
    process.exit(1);
  }
}

uploadAPK();
