# FleetWise Shift Management with PIN Authentication

This document explains how to deploy and use the PIN-based shift management system for FleetWise.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setup & Deployment](#setup--deployment)
4. [Usage](#usage)
5. [Security](#security)
6. [Troubleshooting](#troubleshooting)

---

## Overview

The FleetWise shift management system provides a secure, vehicle-first workflow for drivers to start and end their shifts using a 4-digit PIN. Key features include:

- **Vehicle-first selection**: Choose vehicle first, then select driver
- **PIN Authentication**: Secure 4-digit PIN with bcrypt hashing (never sent to client)
- **One driver per vehicle**: Enforced at the database level via Cloud Functions
- **Rate limiting**: Maximum 6 failed PIN attempts in 10 minutes per driver/device
- **Real-time validation**: Checks driver and vehicle availability before starting shift
- **Optional fields**: Support for odometer readings and EV charge percentages

---

## Architecture

### Components

1. **Cloud Functions** (`functions/src/index.ts`)
   - `startShiftWithPin`: Validates PIN, creates shift in transaction
   - `endShift`: Ends active shift, updates vehicle odometer
   - `adminSetDriverPin`: Admin-only function to set/reset driver PINs
   - `getActiveShift`: Retrieves driver's active shift with vehicle details

2. **Firestore Security Rules** (`firestore.rules`)
   - Prevents client access to `pinHash` field
   - Prevents client writes to `activeShiftId` pointers
   - Restricts shift creation/updates to Cloud Functions only

3. **Frontend Pages**
   - `src/pages/ShiftStart.tsx`: Three-card wizard for shift start
   - `src/pages/ActiveShift.tsx`: View and end active shift

4. **State Management** (`src/store/shift.ts`)
   - Local shift state with localStorage persistence
   - React hooks for easy integration

5. **API Service** (`services/firebaseApi.ts`)
   - Wrapper functions for Cloud Functions callable endpoints

---

## Setup & Deployment

### Prerequisites

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase project with Firestore and Cloud Functions enabled
- Admin SDK credentials configured

### Step 1: Install Dependencies

```bash
# Install Cloud Functions dependencies
cd functions
npm install

# Build TypeScript
npm run build
```

### Step 2: Configure Firebase

Ensure your `.firebaserc` contains your project ID:

```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```

### Step 3: Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

This deploys the security rules that:
- Hide the `pinHash` field from all clients
- Restrict `activeShiftId` writes to Cloud Functions only
- Enforce proper read/write permissions for shifts

### Step 4: Deploy Cloud Functions

```bash
firebase deploy --only functions
```

This deploys four Cloud Functions:
- `startShiftWithPin`
- `endShift`
- `adminSetDriverPin`
- `getActiveShift`

**Deployment time**: ~3-5 minutes on first deploy, ~1-2 minutes on subsequent deploys.

### Step 5: Verify Deployment

After deployment, verify functions are live:

```bash
firebase functions:list
```

You should see all four functions with status "ACTIVE".

---

## Usage

### For Administrators

#### 1. Set Driver PINs

Before a driver can start shifts, an admin must set their PIN:

1. Navigate to **Admin Dashboard** → **Manage Drivers**
2. Find the driver in the list
3. Click the **Key icon** (Set/Reset PIN) in the Actions column
4. Enter a 4-digit PIN twice to confirm
5. Click **Set PIN**

The PIN is immediately hashed with bcrypt (10 salt rounds) and stored securely in Firestore. The plaintext PIN is never logged or stored.

**Best Practices**:
- Use unique PINs for each driver
- Communicate PINs securely (in person, encrypted channel)
- Reset PINs immediately if compromised
- Change PINs periodically (e.g., every 90 days)

#### 2. Monitor Active Shifts

Admins can view all active shifts in real-time:
- Check `drivers/{id}.activeShiftId`
- Check `vehicles/{id}.activeShiftId`
- Query `shifts` collection where `status == 'active'`

### For Drivers

#### 1. Starting a Shift

1. Navigate to **Start Shift** page
2. **Step 1 - Select Vehicle**:
   - Search or browse available vehicles
   - Only vehicles with status "Active" and no active shift are shown
   - Click on a vehicle to select it
3. **Step 2 - Select Driver**:
   - Search or browse active drivers
   - Only drivers with status "Active" and no active shift are shown
   - Click on your name to select yourself
4. **Step 3 - Enter PIN**:
   - Enter your 4-digit PIN
   - Optionally enter starting odometer and charge percentage (for EVs)
   - Click **Start Shift**

If successful, you'll be redirected to your dashboard with the shift active.

**Error Handling**:
- **"Invalid PIN"**: The PIN you entered is incorrect. Try again.
- **"Too many failed attempts"**: You've exceeded 6 attempts in 10 minutes. Wait before trying again.
- **"Vehicle is already in use"**: Another driver started a shift with this vehicle first. Choose a different vehicle.
- **"Driver already has an active shift"**: You already have an active shift. End it first before starting a new one.
- **"Driver does not have a PIN set"**: Contact your administrator to set your PIN.

#### 2. Ending a Shift

1. Navigate to **Active Shift** page (from your dashboard)
2. Review shift details (vehicle, start time, duration)
3. Enter **required** ending odometer reading
4. If driving an EV, optionally enter ending charge percentage
5. Optionally add notes about the shift
6. Click **End Shift**

The shift will be marked as ended, and both the driver and vehicle will be available for new shifts.

---

## Security

### PIN Storage

- PINs are **never** sent to or accessible from the client
- PINs are hashed using bcrypt with 10 salt rounds before storage
- Firestore security rules prevent any client from reading `pinHash`
- PIN verification happens entirely in Cloud Functions (server-side)

### Rate Limiting

To prevent brute-force attacks:
- Maximum **6 failed attempts** per driver/device in a **10-minute window**
- Rate limit counters stored in `rateLimits/{driverId}_{deviceId}` collection
- Device ID is based on browser fingerprint + localStorage
- Successful authentication clears the rate limit counter
- Admin PIN resets also clear all rate limits for that driver

### Shift Integrity

- All shift operations (start/end) go through Cloud Functions
- Firestore transactions ensure atomic updates
- Double-checking of availability within transactions prevents race conditions
- Security rules block all direct client writes to shifts collection

### Data Validation

Cloud Functions use **Zod** schemas to validate all inputs:
- PIN must be exactly 4 digits
- Driver ID, vehicle ID, shift ID must be non-empty strings
- Odometer values must be positive numbers
- Charge percentages must be between 0-100
- End odometer must be ≥ start odometer

---

## Troubleshooting

### "Cloud Function not found"

**Problem**: Frontend can't call Cloud Functions

**Solutions**:
1. Verify functions are deployed: `firebase functions:list`
2. Check function names match exactly (case-sensitive)
3. Ensure Firebase Functions SDK is initialized in `src/lib/firebase.ts`
4. Check browser console for CORS errors

### "Permission denied" on PIN set

**Problem**: Non-admin user trying to set PIN

**Solutions**:
1. Ensure user document has `role: 'admin'` in Firestore
2. Check Firestore security rules are deployed
3. Verify user is authenticated (not anonymous)

### "Driver already has an active shift"

**Problem**: Shift wasn't properly ended last time

**Solutions**:
1. Admin can manually update `drivers/{id}.activeShiftId = null`
2. Admin can manually update `shifts/{shiftId}.status = 'ended'`
3. Use Cloud Functions console to call `endShift` with correct parameters

### Rate limit stuck / false positive

**Problem**: Driver locked out due to rate limiting

**Solutions**:
1. Wait 10 minutes for automatic reset
2. Admin can manually delete `rateLimits/{driverId}_{deviceId}` document
3. Admin can reset driver's PIN (automatically clears all rate limits)

### Shift state lost after browser refresh

**Problem**: Shift state stored in localStorage not loading

**Solutions**:
1. Check browser's localStorage is enabled (not in private/incognito mode)
2. Verify `fleetwise_active_shift` key exists in localStorage
3. Call `getActiveShift` Cloud Function to re-sync from Firestore

### "End odometer must be greater than start odometer"

**Problem**: Validation error when ending shift

**Solutions**:
1. Ensure end odometer is actually higher than start
2. Check for typos (e.g., missing digits)
3. If odometer was reset (rare), admin can manually end shift via Cloud Function

---

## Database Schema

### Firestore Collections

#### `drivers/{driverId}`
```typescript
{
  firstName: string,
  surname: string,
  email: string,
  role: 'driver' | 'admin',
  employmentStatus: 'Active' | 'Inactive' | 'Terminated',
  pinHash: string,  // bcrypt hash (NEVER accessible from client)
  pinLastUpdated: Timestamp,
  pinLastUpdatedBy: string,  // admin user ID
  activeShiftId: string | null,  // ONLY writable by Cloud Functions
  allowedVehicles?: string[],  // Optional: restrict driver to specific vehicles
}
```

#### `vehicles/{vehicleId}`
```typescript
{
  registration: string,
  alias?: string,
  make: string,
  model: string,
  vehicleType: 'ICE' | 'EV',
  status: 'Active' | 'Inactive' | 'InService' | 'Repairs' | 'Sold',
  activeShiftId: string | null,  // ONLY writable by Cloud Functions
  currentOdometer?: number,
}
```

#### `shifts/{shiftId}`
```typescript
{
  driverId: string,
  vehicleId: string,
  startAt: Timestamp,
  endAt: Timestamp | null,
  status: 'active' | 'ended',
  startOdo?: number,
  endOdo?: number,
  startChargePercent?: number,  // EVs only
  endChargePercent?: number,    // EVs only
  notes?: string,
}
```

#### `rateLimits/{driverId}_{deviceId}`
```typescript
{
  attempts: number,         // Count of failed attempts
  firstAttempt: Timestamp,  // Time of first attempt in window
  lastAttempt: Timestamp,   // Time of most recent attempt
}
```

---

## Cost Considerations

### Cloud Functions Pricing

- **Free tier**: 2M invocations/month, 400K GB-seconds/month, 200K CPU-seconds/month
- **Per invocation**: $0.40 per million invocations
- **Compute time**: Minimal (most calls complete in <1 second)

**Estimated monthly cost** for 100 drivers with 2 shifts/day:
- 6,000 shift starts + 6,000 shift ends = 12,000 invocations
- Well within free tier

### Firestore Pricing

- **Free tier**: 50K reads/day, 20K writes/day, 20K deletes/day, 1GB storage
- Each shift start: 3 reads + 3 writes
- Each shift end: 2 reads + 3 writes
- Each PIN set: 1 read + 1 write + (1-10 deletes for rate limits)

**Estimated monthly cost** for 100 drivers with 2 shifts/day:
- ~12,000 shift operations = ~60,000 reads + 36,000 writes
- Slightly above free tier: ~$0.10-0.20/month

**Total estimated cost**: **$0.10-0.30/month** for typical fleet usage

---

## Development & Testing

### Running Functions Locally

```bash
cd functions
npm run serve
```

This starts the Firebase emulator suite. Update your frontend to point to local functions:

```typescript
// In firebase.ts (for development only)
import { connectFunctionsEmulator } from 'firebase/functions';
const functions = getFunctions();
connectFunctionsEmulator(functions, 'localhost', 5001);
```

### Testing PIN Authentication

```bash
# Test setting a PIN
curl -X POST http://localhost:5001/your-project/us-central1/adminSetDriverPin \
  -H "Content-Type: application/json" \
  -d '{"data": {"driverId": "test-driver-id", "newPin": "1234"}}'

# Test starting a shift
curl -X POST http://localhost:5001/your-project/us-central1/startShiftWithPin \
  -H "Content-Type: application/json" \
  -d '{"data": {"driverId": "test-driver-id", "vehicleId": "test-vehicle-id", "pin": "1234"}}'
```

---

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review Firebase console logs: `firebase functions:log`
3. Check browser console for client-side errors
4. Open an issue on the project repository

---

## License

This implementation is part of the FleetWise project. All rights reserved.
