const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'superparty-frontend.appspot.com'
});

const bucket = admin.storage().bucket();

async function uploadAPK() {
  try {
    const apkPath = 'superparty_flutter/build/app/outputs/flutter-apk/app-release.apk';
    const destination = 'apk/superparty-signed.apk';

    console.log('📦 Uploading APK to Firebase Storage...');
    console.log('Source:', apkPath);
    console.log('Destination:', destination);

    // Check if bucket exists, if not create it
    const [exists] = await bucket.exists();
    if (!exists) {
      console.log('⚠️  Bucket does not exist, creating...');
      await bucket.create({
        location: 'EUROPE-WEST1',
        storageClass: 'STANDARD',
      });
      console.log('✅ Bucket created');
    }

    // Upload file
    await bucket.upload(apkPath, {
      destination: destination,
      metadata: {
        contentType: 'application/vnd.android.package-archive',
        cacheControl: 'public, max-age=0',
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
