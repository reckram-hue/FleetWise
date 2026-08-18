# 🚨 FLEETWISE ERROR REFERENCE GUIDE

Complete error handling guide for Firebase deployment and runtime issues.

---

## 📋 TABLE OF CONTENTS

1. [Deployment Errors](#deployment-errors)
2. [Runtime Errors (Cloud Functions)](#runtime-errors-cloud-functions)
3. [Frontend Errors](#frontend-errors)
4. [Firestore Errors](#firestore-errors)
5. [Authentication Errors](#authentication-errors)

---

## 🚀 DEPLOYMENT ERRORS

| Error | Why It Happens | Exact Fix |
|-------|----------------|-----------|
| **"npm --prefix '' run build" failed** | Old firebase.json with empty prefix | Already fixed in firebase.json line 16 |
| **"Cannot find module 'firebase-functions'"** | functions/node_modules missing | `cd functions && npm install` |
| **"Property 'predeploy' must be array"** | Malformed firebase.json | Use the repaired firebase.json from this fix |
| **"TypeScript compilation failed"** | Syntax errors in functions/src/index.ts | Check functions build: `cd functions && npm run build` |
| **"Resource already exists"** | Function name conflict | `firebase deploy --force` |
| **"Insufficient permissions"** | Not logged into Firebase | `firebase login` |
| **"Project not found"** | Wrong project ID | `firebase use fleetwise-9ab3a` |
| **"Build failed: command not found"** | npm not in PATH | Restart PowerShell or reinstall Node.js |
| **"functions/lib not found"** | TypeScript not compiled | Functions build runs automatically during deploy |
| **"Hosting: dist folder not found"** | Frontend not built | Run `npm run build` first |

---

## ☁️ RUNTIME ERRORS (CLOUD FUNCTIONS)

### startShiftWithPin Errors

| Error | Why It Happens | Exact Fix |
|-------|----------------|-----------|
| **"Driver not found"** | Invalid driverId or driver doesn't exist | Check Firestore `users` collection for driver document |
| **"Driver is not active"** | Driver's `employmentStatus` is not "Active" | Update driver: `employmentStatus: "Active"` |
| **"Vehicle not found"** | Invalid vehicleId or vehicle doesn't exist | Check Firestore `vehicles` collection |
| **"Vehicle is Inactive"** | Vehicle status is not "Active" | Update vehicle: `status: "Active"` |
| **"Driver does not have a PIN set"** | Driver's `pinHash` field is null/missing | Run `adminSetDriverPin` Cloud Function |
| **"Invalid PIN"** | Wrong PIN entered | Enter correct 4-digit PIN or reset via admin |
| **"Too many failed PIN attempts"** | 6+ failed attempts in 10 minutes | Wait 10 mins OR delete doc from `rateLimits/{driverId}_{deviceId}` |
| **"Driver already has an active shift"** | Driver's `activeShiftId` is not null | End active shift first OR manually clear field |
| **"Vehicle is already in use"** | Vehicle's `activeShiftId` is not null | End other shift OR manually clear field |
| **"You are not authorized to use this vehicle"** | Driver's `allowedVehicles` doesn't include vehicleId | Add vehicleId to driver's `allowedVehicles` array OR remove restriction |
| **"Resource exhausted"** | Too many concurrent requests | Retry after a few seconds |

### endShift Errors

| Error | Why It Happens | Exact Fix |
|-------|----------------|-----------|
| **"Shift not found"** | Invalid shiftId | Check Firestore `shifts` collection for the shift |
| **"This shift has already been ended"** | Shift status is "ended" or "completed" | Cannot end a completed shift - start new shift instead |
| **"End odometer must be greater than start"** | endOdo < startOdo | Enter higher odometer reading |
| **"Invalid argument: endOdo required"** | Missing endOdometer parameter | Provide endOdometer value |

### adminSetDriverPin Errors

| Error | Why It Happens | Exact Fix |
|-------|----------------|-----------|
| **"Must be authenticated"** | User not logged in | Ensure Firebase Auth session is active |
| **"User not found"** | Caller's UID doesn't exist in `users` | Create user document in Firestore |
| **"Only administrators can set driver PINs"** | Caller's role is not "admin" | Set caller's `role` field to "admin" |
| **"Driver not found"** | Target driver doesn't exist | Create driver document first |
| **"PIN must be exactly 4 digits"** | PIN is not 4 digits or contains non-numbers | Use 4-digit PIN like "1234" |

### getActiveShift Errors

| Error | Why It Happens | Exact Fix |
|-------|----------------|-----------|
| **"Must be authenticated"** | User not logged in | Ensure Firebase Auth session is active |
| **"You can only view your own active shift"** | Non-admin trying to view another driver's shift | Login as admin OR request your own shift |
| **"Driver not found"** | driverId doesn't exist | Check `users` collection |

---

## 🌐 FRONTEND ERRORS

| Error | Why It Happens | Exact Fix |
|-------|----------------|-----------|
| **"Firebase: Error (auth/invalid-api-key)"** | Wrong API key in .env | Verify `VITE_FIREBASE_API_KEY` matches Firebase Console |
| **"Firebase: Error (auth/project-not-found)"** | Wrong project ID in .env | Verify `VITE_FIREBASE_PROJECT_ID=fleetwise-9ab3a` |
| **"Failed to get document: Missing or insufficient permissions"** | Firestore rules block access | Check if user is authenticated and rules allow access |
| **"Function not found: startShiftWithPin"** | Function not deployed or wrong region | Run `firebase deploy --only functions` |
| **"Network request failed"** | Offline or Firebase down | Check internet connection |
| **"fetch() to localhost:3001 failed"** | Old Express server calls (should be removed) | Already fixed - localhost calls are commented out |
| **"Cannot read property 'id' of undefined"** | User not found in Firestore | Create user document with matching Auth UID |
| **"Collection 'drivers' not found"** | Old code using wrong collection | Already fixed - updated to 'users' |

---

## 🔥 FIRESTORE ERRORS

| Error | Why It Happens | Exact Fix |
|-------|----------------|-----------|
| **"Missing or insufficient permissions"** | Firestore rules deny access | Check rules - user must be authenticated |
| **"Document not found"** | Trying to read non-existent document | Use `.get()` and check `.exists` before accessing `.data()` |
| **"PERMISSION_DENIED: Missing or insufficient permissions"** | Client trying to write to restricted collection | Shifts are server-only - use Cloud Functions |
| **"Cannot write to field 'activeShiftId'"** | Rules prevent client writes | Only Cloud Functions can modify this field |
| **"Index required for query"** | Firestore composite index missing | Firebase will show link to create index OR fetch all and filter in code |

---

## 🔐 AUTHENTICATION ERRORS

| Error | Why It Happens | Exact Fix |
|-------|----------------|-----------|
| **"auth/user-not-found"** | Email doesn't exist in Firebase Auth | Create user in Firebase Console → Authentication |
| **"auth/wrong-password"** | Incorrect password | Reset password via Firebase Auth |
| **"auth/invalid-email"** | Malformed email | Use valid email format |
| **"auth/user-disabled"** | Account disabled in Firebase Console | Re-enable user in Firebase Console |
| **"auth/email-already-in-use"** | Email exists in another account | Use different email OR sign in to existing account |
| **"auth/weak-password"** | Password too short (< 6 chars) | Use stronger password (6+ characters) |
| **"auth/requires-recent-login"** | Sensitive operation needs re-auth | Logout and login again |

---

## 🛠️ DEBUGGING COMMANDS

### Check Cloud Function Logs
```powershell
# All logs
firebase functions:log

# Last 100 lines
firebase functions:log --lines 100

# Specific function
firebase functions:log --only startShiftWithPin

# Follow real-time
firebase functions:log --follow
```

### Test Functions Locally
```powershell
# Start emulators
firebase emulators:start

# Access emulator UI
start http://localhost:4000
```

### Clear Rate Limits Manually
```javascript
// In Firebase Console → Firestore
// Delete documents in: rateLimits/{driverId}_{deviceId}
```

### Manually Fix Stuck Shift
```javascript
// In Firebase Console → Firestore

// 1. Find shift in `shifts` collection
// 2. Update: status = "ended", endAt = [current timestamp]

// 3. Find driver in `users` collection
// 4. Update: activeShiftId = null

// 5. Find vehicle in `vehicles` collection
// 6. Update: activeShiftId = null
```

---

## 🔍 DIAGNOSTIC CHECKLIST

When something goes wrong, check these in order:

### 1. Firebase Console
- [ ] Go to https://console.firebase.google.com/project/fleetwise-9ab3a
- [ ] Check Functions → Logs for errors
- [ ] Check Firestore → Data for correct structure
- [ ] Check Authentication → Users for user existence

### 2. Browser Console (F12)
- [ ] Check for red errors
- [ ] Check Network tab for failed requests
- [ ] Check Application tab → Local Storage for Firebase tokens

### 3. PowerShell
```powershell
# Check Firebase CLI version
firebase --version

# Check Node version (should be 18+)
node --version

# Check if logged in
firebase login:list

# Check current project
firebase use
```

### 4. Firestore Structure Check
```
✓ users/
  ├─ {userId}/
     ├─ firstName: string
     ├─ surname: string
     ├─ role: "admin" | "driver"
     ├─ employmentStatus: "Active" | "Inactive"
     ├─ pinHash: string (bcrypt hash)
     └─ activeShiftId: string | null

✓ vehicles/
  ├─ {vehicleId}/
     ├─ registration: string
     ├─ alias: string
     ├─ status: "Active" | "Inactive"
     ├─ vehicleType: "ICE" | "EV"
     └─ activeShiftId: string | null

✓ shifts/
  ├─ {shiftId}/
     ├─ driverId: string
     ├─ vehicleId: string
     ├─ startAt: timestamp
     ├─ endAt: timestamp | null
     ├─ status: "active" | "ended"
     ├─ startOdo: number
     └─ endOdo: number | null
```

---

## 🆘 EMERGENCY FIXES

### Nuclear Option: Complete Redeploy
```powershell
# 1. Delete all functions
firebase functions:delete --force startShiftWithPin
firebase functions:delete --force endShift
firebase functions:delete --force adminSetDriverPin
firebase functions:delete --force getActiveShift

# 2. Clear local build
Remove-Item -Recurse -Force dist
Remove-Item -Recurse -Force functions/lib

# 3. Rebuild everything
cd functions
npm install
cd ..
npm run build

# 4. Redeploy
firebase deploy --force
```

### Reset Firestore Security Rules
```powershell
firebase deploy --only firestore:rules
```

### Clear Browser Cache
1. Open DevTools (F12)
2. Right-click Refresh button
3. Select "Empty Cache and Hard Reload"

---

## 📞 GETTING HELP

If errors persist:

1. **Check Firebase Status:** https://status.firebase.google.com
2. **Firebase Docs:** https://firebase.google.com/docs
3. **Stack Overflow:** Tag with `firebase` + `google-cloud-functions`
4. **Firebase Support:** https://firebase.google.com/support

---

*Last Updated: 2025-12-08*
