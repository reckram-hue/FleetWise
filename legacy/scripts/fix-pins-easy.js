// fix-pins-easy.js - Simple script to fix driver PINs
// No service account needed - uses your Firebase config

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc, query, where, serverTimestamp } = require('firebase/firestore');
const bcrypt = require('bcryptjs');

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDU_jLgRLba1Kvb8ZytGH45UqlR6494y24",
  authDomain: "fleetwise-9ab3a.firebaseapp.com",
  projectId: "fleetwise-9ab3a",
  storageBucket: "fleetwise-9ab3a.appspot.com",
  messagingSenderId: "152244336755",
  appId: "1:152244336755:web:d45ac6cd98eacf46785206"
};

async function fixDriverPins() {
  console.log('🔧 Fixing driver PINs...\n');

  try {
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    console.log('📋 Loading drivers from Firestore...');

    // Get all drivers
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', '==', 'driver'));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('❌ No drivers found in database');
      process.exit(0);
    }

    console.log(`📊 Found ${querySnapshot.size} driver(s)\n`);
    console.log('🔐 Generating PIN hash for default PIN (1234)...');

    // Hash the default PIN
    const salt = bcrypt.genSaltSync(10);
    const defaultPinHash = bcrypt.hashSync('1234', salt);

    console.log('✅ PIN hash generated\n');

    let fixed = 0;
    let skipped = 0;

    // Process each driver
    for (const docSnapshot of querySnapshot.docs) {
      const data = docSnapshot.data();
      const driverName = `${data.firstName || 'Unknown'} ${data.surname || 'Unknown'}`;

      if (!data.pinHash) {
        // Set PIN
        await updateDoc(doc(db, 'users', docSnapshot.id), {
          pinHash: defaultPinHash,
          pinLastUpdated: serverTimestamp(),
        });
        console.log(`✅ Set PIN for: ${driverName} (ID: ${docSnapshot.id})`);
        fixed++;
      } else {
        console.log(`⏭️  Already has PIN: ${driverName} (ID: ${docSnapshot.id})`);
        skipped++;
      }
    }

    console.log('\n====================================');
    console.log('✨ Complete!');
    console.log(`   Fixed: ${fixed} driver(s)`);
    console.log(`   Skipped: ${skipped} driver(s)`);
    console.log('====================================\n');
    console.log('All drivers now have PIN: 1234');
    console.log('They will be forced to change it on first login.\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run the script
fixDriverPins();
