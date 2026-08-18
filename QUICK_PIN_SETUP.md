# Quick PIN System Setup & Troubleshooting

## 🚀 Step-by-Step Setup

### Step 1: Deploy Cloud Functions (REQUIRED)
```bash
cd functions
firebase deploy --only functions
```

**Wait for this to complete!** You should see:
```
✔ functions[validateDriverPin] Deployed
✔ functions[driverChangePin] Deployed
✔ functions[startShiftWithPin] Deployed
✔ functions[endShift] Deployed
```

### Step 2: Rebuild Frontend App (REQUIRED)
```bash
# Stop your dev server (Ctrl+C)
npm run build
npm run dev
```

OR if using Vite directly:
```bash
npm run dev
```

### Step 3: Test Driver Creation
1. Login as admin (use Firebase Auth or mock admin for now)
2. Create a new test driver
3. Check browser console - should see: "Driver created with default PIN (1234)"

### Step 4: Test Driver Login
1. Refresh the page
2. Click "I'm a Driver"
3. Select your test driver
4. Enter PIN: `1234`
5. Should work and force PIN change

## 🐛 Troubleshooting

### Issue: "PIN not set" error

**Check 1**: Look at browser console for errors
```javascript
// Open browser DevTools (F12)
// Check Console tab for errors
```

**Check 2**: Verify driver has pinHash in Firestore
```
1. Firebase Console → Firestore → users collection
2. Find your driver document
3. Should have field: pinHash: "$2a$10$..."
```

**Fix**: If driver missing pinHash, use this script:

### Issue: "Failed to validate PIN" error

**Check 1**: Are Cloud Functions deployed?
```bash
firebase functions:list
```

Should show:
- validateDriverPin
- driverChangePin
- startShiftWithPin
- endShift

**Check 2**: Check Firebase Functions logs
```bash
firebase functions:log
```

Look for errors from validateDriverPin

### Issue: Driver login shows "No active drivers found"

**Check**: Verify drivers in Firestore
```
1. Firebase Console → Firestore → users collection
2. Find drivers with:
   - role: "driver"
   - employmentStatus: "Active"
```

## 🔧 Quick Fix Script

If you have existing drivers without PINs, create this file:

**`fix-driver-pins.js`**
```javascript
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

// Initialize with your service account
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixDriverPins() {
  console.log('🔧 Fixing driver PINs...\n');

  // Get all drivers without pinHash
  const driversSnapshot = await db.collection('users')
    .where('role', '==', 'driver')
    .get();

  const defaultPinHash = await bcrypt.hash('1234', 10);
  let fixed = 0;

  for (const doc of driversSnapshot.docs) {
    const data = doc.data();

    if (!data.pinHash) {
      await doc.ref.update({
        pinHash: defaultPinHash,
        pinLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✅ Set PIN for: ${data.firstName} ${data.surname}`);
      fixed++;
    } else {
      console.log(`⏭️  Already has PIN: ${data.firstName} ${data.surname}`);
    }
  }

  console.log(`\n✨ Fixed ${fixed} drivers`);
  process.exit(0);
}

fixDriverPins().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
```

Run it:
```bash
cd functions
node fix-driver-pins.js
```

## 📱 Complete Test Flow

### Test 1: Create New Driver (Admin)
```
1. Login as admin
2. Go to "Manage Drivers"
3. Click "Add Driver"
4. Fill in details: John Test, etc.
5. Save
6. Check console: "Driver created with default PIN (1234)"
```

### Test 2: Driver Login
```
1. Logout or open incognito window
2. Click "I'm a Driver"
3. Should see list of active drivers
4. Select "John Test"
5. Enter PIN: 1234
6. Should redirect to PIN change screen
```

### Test 3: Change PIN
```
1. On PIN change screen
2. New PIN: 5827 (not weak pattern)
3. Confirm: 5827
4. Should redirect to driver dashboard
5. Success!
```

### Test 4: Login with New PIN
```
1. Logout
2. Click "I'm a Driver"
3. Select "John Test"
4. Enter PIN: 5827
5. Should go directly to dashboard (no PIN change)
```

## 🔍 Debug Checklist

Before asking for help, check:

- [ ] Cloud Functions deployed (`firebase deploy --only functions`)
- [ ] App rebuilt and restarted (`npm run dev`)
- [ ] bcryptjs installed (`npm list bcryptjs` shows version)
- [ ] Browser console clear of errors (F12 → Console)
- [ ] Driver has `pinHash` in Firestore
- [ ] Driver has `employmentStatus: "Active"`
- [ ] Driver has `role: "driver"`
- [ ] Firebase Functions logs show no errors (`firebase functions:log`)

## 💡 Common Mistakes

1. **Forgot to deploy Cloud Functions**
   - PINs won't validate without `validateDriverPin` function
   - Deploy: `cd functions && firebase deploy --only functions`

2. **Forgot to rebuild app**
   - Changes to firebaseApi.ts need rebuild
   - Restart: Stop server, then `npm run dev`

3. **Old driver without pinHash**
   - Use fix script above
   - Or delete and recreate driver

4. **Wrong PIN format**
   - Must be exactly 4 digits
   - Numbers only (0-9)

## 🎯 Expected Behavior

### When Creating Driver:
```
Browser Console:
"Driver created with default PIN (1234): driverXYZ123"

Firestore (users/driverXYZ123):
{
  firstName: "John",
  pinHash: "$2a$10$...",
  role: "driver",
  ...
}
```

### When Logging In:
```
Browser Console:
"Validating PIN for driver: driverXYZ123"
"PIN validation successful"

If PIN = 1234:
  → Redirect to PIN change screen

If PIN = custom:
  → Redirect to driver dashboard
```

## 📞 Still Not Working?

Check Firebase Functions logs for detailed errors:
```bash
firebase functions:log --only validateDriverPin
```

Look for:
- "PIN validation failed"
- "Driver not found"
- "bcrypt error"

Share the error message for more specific help!

---

**Quick Commands**:
```bash
# Deploy everything fresh
cd functions && firebase deploy --only functions && cd .. && npm run dev

# Check logs
firebase functions:log

# List deployed functions
firebase functions:list
```
