# Driver PIN Authentication System - Implementation Guide

## Overview

Your FleetWise application now has a secure PIN-based authentication system for drivers. This guide explains how the system works and what you need to do to deploy it.

## System Features

### 1. Default PIN for New Drivers
- **All new drivers automatically get PIN: `1234`**
- This is set automatically when you create a driver in the admin panel
- Drivers cannot use the app until they change this default PIN

### 2. Forced PIN Change on First Login
- When a driver logs in with the default PIN (`1234`), they are **immediately** redirected to change it
- They cannot access the driver dashboard until they set a new secure PIN
- The system prevents weak PINs like:
  - `1234` (default)
  - `0000`, `1111`, `2222`, etc. (repeating digits)
  - `0123`, `2345`, `5678`, etc. (sequential digits)

### 3. Secure PIN Storage
- PINs are **hashed using bcrypt** before storage (never stored in plain text)
- Rate limiting: Maximum 6 failed PIN attempts per 10 minutes per driver/device
- Prevents brute-force attacks

### 4. PIN-Based Shift Management
- Drivers start shifts by entering their PIN (via `ShiftStart` page)
- Shifts are managed through Firebase Cloud Functions
- Full transaction support ensures data consistency

## How It Works

### Driver Login Flow

```
1. Driver opens app
   ↓
2. Selects their name from list of active drivers
   ↓
3. Enters 4-digit PIN
   ↓
4. System validates PIN via Cloud Function
   ↓
5a. If PIN is "1234" → Force PIN change screen
5b. If PIN is custom → Go to driver dashboard
```

### Admin Workflow

```
1. Admin creates new driver in admin panel
   ↓
2. System automatically sets PIN to "1234"
   ↓
3. Admin tells driver their default PIN
   ↓
4. Driver logs in for first time with "1234"
   ↓
5. Driver is forced to create new PIN
   ↓
6. Driver can now start/end shifts with their new PIN
```

## Deployment Steps

### Step 1: Deploy Firebase Cloud Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

This deploys the new Cloud Functions:
- `validateDriverPin` - Validates driver PIN during login
- `driverChangePin` - Allows drivers to change their PIN
- `startShiftWithPin` - Start shift with PIN authentication (already exists)
- `endShift` - End active shift (already exists)
- `adminSetDriverPin` - Admin can set/reset driver PINs (already exists)

### Step 2: Set Default PIN for Existing Drivers

For drivers already in your system, you need to set their default PIN manually:

**Option A: Via Firebase Console**
1. Go to Firebase Console → Firestore Database
2. Find each driver document in the `users` collection
3. Use the Admin panel's "Reset PIN" feature (recommended)

**Option B: Via Admin Panel**
The admin panel has functionality to set/reset driver PINs. Use this to set all existing drivers to PIN `1234`.

**Option C: Via Script** (Fastest for many drivers)
Create a one-time script to hash and set default PINs:

```javascript
// One-time migration script (run in Firebase Functions or locally with admin SDK)
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

admin.initializeApp();
const db = admin.firestore();

async function setDefaultPinsForAllDrivers() {
  const driversSnapshot = await db.collection('users')
    .where('role', '==', 'driver')
    .where('employmentStatus', '==', 'Active')
    .get();

  const defaultPinHash = await bcrypt.hash('1234', 10);

  const batch = db.batch();
  driversSnapshot.docs.forEach(doc => {
    if (!doc.data().pinHash) {  // Only set if not already set
      batch.update(doc.ref, {
        pinHash: defaultPinHash,
        pinLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  await batch.commit();
  console.log(`Set default PIN for ${driversSnapshot.size} drivers`);
}

setDefaultPinsForAllDrivers();
```

### Step 3: Build and Deploy Frontend

```bash
npm install
npm run build
firebase deploy --only hosting
```

### Step 4: Inform Drivers

Send a message to all drivers (via Telegram, email, or SMS):

```
📱 FleetWise System Update

We've upgraded to a secure PIN system.

Your default PIN is: 1234

When you log in for the first time:
1. Select your name
2. Enter PIN: 1234
3. You'll be asked to create your own personal PIN
4. Choose a 4-digit PIN (avoid simple patterns)
5. Confirm your new PIN

Keep your PIN private and secure!
```

## Testing the System

### Test with a New Driver

1. **Admin Panel**: Create a test driver (e.g., "Test Driver")
2. **Verify**: Driver should automatically get PIN `1234`
3. **Driver Login**:
   - Open app in incognito/private window
   - Select "Test Driver"
   - Enter PIN: `1234`
4. **PIN Change**:
   - Should be immediately redirected to PIN change screen
   - Try entering `1234` as new PIN → Should reject
   - Try entering `1111` → Should reject (weak PIN)
   - Enter a valid PIN like `5827` → Should accept
   - Confirm PIN
5. **Dashboard**:
   - Should be redirected to driver dashboard
   - Should be able to start shifts with new PIN

### Test Shift Management

1. Click "Start New Shift"
2. Select vehicle
3. Select driver (yourself)
4. Enter your PIN
5. Should create shift and update vehicle/driver status
6. Click "End Shift"
7. Enter end odometer
8. Should end shift successfully

## Security Features

### Rate Limiting
- Max 6 failed PIN attempts per 10 minutes per driver/device
- Uses device fingerprint + driver ID for tracking
- Rate limits automatically clear on successful login

### PIN Requirements
- Exactly 4 digits
- Cannot be `1234` (default)
- Cannot be repeating digits (`0000`, `1111`, etc.)
- Cannot be sequential (`0123`, `2345`, etc.)
- Must be different from previous PIN when changing

### Bcrypt Hashing
- Salt rounds: 10
- Industry-standard password hashing
- Computationally expensive to crack (resistant to brute force)

## Admin Functions

### Setting/Resetting Driver PIN

Admins can reset a driver's PIN to `1234` via the admin panel or programmatically:

```typescript
await api.adminSetDriverPin(driverId, '1234');
```

This is useful when:
- Driver forgets their PIN
- Driver leaves and returns (reset to default)
- New device needs setup

## Troubleshooting

### "PIN not set" error
**Problem**: Driver tries to login but sees "PIN not set" error.

**Solution**:
1. Go to Admin Panel → Manage Drivers
2. Find the driver
3. Click "Reset PIN" button (sets PIN to `1234`)
4. Tell driver their PIN is `1234`

### Driver can't change PIN from default
**Problem**: PIN change screen shows error when trying to change from `1234`.

**Solution**:
1. Check Firebase Functions logs for errors
2. Verify `driverChangePin` function is deployed
3. Check Firestore security rules allow PIN updates

### Too many failed attempts
**Problem**: Driver gets locked out after 6 failed PIN attempts.

**Solution**:
1. Wait 10 minutes for rate limit to reset
2. OR admin can delete the rate limit document from Firestore:
   - Collection: `rateLimits`
   - Document ID: `{driverId}_{deviceId}`

## Files Changed/Created

### New Files
- `src/components/auth/DriverPinLogin.tsx` - Driver PIN login screen
- `src/components/auth/ChangePinFlow.tsx` - PIN change/setup flow
- `functions/src/index.ts` - Added `validateDriverPin` and `driverChangePin` functions

### Modified Files
- `src/App.tsx` - Integrated PIN-based authentication
- `src/components/driver/DriverDashboard.tsx` - Uses new shift pages
- `src/services/firebaseApi.ts` - Auto-sets default PIN for new drivers, added helper methods
- `src/pages/ShiftStart.tsx` - Already existed, using PIN for shift start
- `src/pages/ActiveShift.tsx` - Already existed, for ending shifts

## Next Steps

After deployment:

1. ✅ **Test the system** with a test driver
2. ✅ **Set default PINs** for all existing drivers
3. ✅ **Notify drivers** about the new system
4. ✅ **Monitor Firebase Functions logs** for any errors
5. ✅ **Train admins** on PIN reset procedures

## Support

If drivers have issues:
1. Verify they're on the active drivers list
2. Confirm their employment status is "Active"
3. Check if PIN is set in Firestore (should see `pinHash` field)
4. Review Firebase Functions logs for specific errors

---

**System implemented on**: January 2026
**Default PIN**: 1234 (forced change on first login)
**Security**: Bcrypt hashing + rate limiting
