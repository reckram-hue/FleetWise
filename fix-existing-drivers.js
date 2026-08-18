// fix-existing-drivers.js
// Run this script to add default PIN (1234) to all existing drivers

const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

// Initialize Firebase Admin
// You need a service account key file
// Download it from: Firebase Console → Project Settings → Service Accounts → Generate New Private Key
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Make sure this matches your Firebase project
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

const db = admin.firestore();

async function fixDriverPins() {
  console.log('🔧 Fixing driver PINs...\n');

  try {
    // Get all users with role 'driver'
    const usersSnapshot = await db.collection('users')
      .where('role', '==', 'driver')
      .get();

    if (usersSnapshot.empty) {
      console.log('❌ No drivers found in the database');
      process.exit(0);
    }

    console.log(`📋 Found ${usersSnapshot.size} driver(s)\n`);

    // Hash the default PIN once
    const defaultPin = '1234';
    const defaultPinHash = await bcrypt.hash(defaultPin, 10);
    console.log(`🔐 Generated hash for default PIN (1234)\n`);

    let fixed = 0;
    let skipped = 0;

    // Process each driver
    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const driverName = `${data.firstName || 'Unknown'} ${data.surname || 'Unknown'}`;

      if (!data.pinHash) {
        // Driver doesn't have a PIN, set it
        await doc.ref.update({
          pinHash: defaultPinHash,
          pinLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`✅ Set PIN for: ${driverName} (ID: ${doc.id})`);
        fixed++;
      } else {
        console.log(`⏭️  Already has PIN: ${driverName} (ID: ${doc.id})`);
        skipped++;
      }
    }

    console.log(`\n====================================`);
    console.log(`✨ Complete!`);
    console.log(`   Fixed: ${fixed} driver(s)`);
    console.log(`   Skipped: ${skipped} driver(s)`);
    console.log(`====================================\n`);
    console.log(`All drivers now have PIN: 1234`);
    console.log(`They will be forced to change it on first login.\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the script
fixDriverPins();
