# 🚀 FLEETWISE FIREBASE DEPLOYMENT GUIDE

**Last Updated:** 2025-12-08
**Firebase Project ID:** fleetwise-9ab3a
**Status:** ✅ All critical issues FIXED

---

## 📋 PRE-DEPLOYMENT CHECKLIST

- [x] firebase.json fixed (predeploy command)
- [x] .firebaserc verified (correct project ID)
- [x] firestore.rules updated (users collection)
- [x] Cloud Functions updated (users collection)
- [x] localhost:3001 calls commented out
- [ ] Functions dependencies installed
- [ ] Frontend built successfully
- [ ] Cloud Functions built successfully

---

## 🔧 STEP 1: INSTALL CLOUD FUNCTIONS DEPENDENCIES

Open PowerShell in your repo root and run:

```powershell
cd functions
npm install
cd ..
```

**Expected output:** No errors, all packages installed

---

## 🏗️ STEP 2: BUILD FRONTEND

```powershell
npm run build
```

**Expected output:**
- ✓ Vite build successful
- dist/ folder created with index.html and assets

**Verify build:**
```powershell
dir dist
```

You should see: `index.html`, `assets/` folder

---

## ☁️ STEP 3: DEPLOY TO FIREBASE

### 3.1 Select Firebase Project

```powershell
firebase use fleetwise-9ab3a
```

**Expected output:**
```
Now using project fleetwise-9ab3a
```

### 3.2 Deploy Everything (Firestore Rules + Cloud Functions + Hosting)

```powershell
firebase deploy
```

**This will:**
1. Deploy Firestore security rules
2. Build and deploy Cloud Functions (4 functions):
   - `startShiftWithPin`
   - `endShift`
   - `adminSetDriverPin`
   - `getActiveShift`
3. Deploy frontend to Firebase Hosting

**Expected duration:** 2-5 minutes

**Expected output:**
```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/fleetwise-9ab3a/overview
Hosting URL: https://fleetwise-9ab3a.web.app
```

### 3.3 Deploy Individual Components (Optional)

If you only want to deploy specific parts:

```powershell
# Deploy only Firestore rules
firebase deploy --only firestore:rules

# Deploy only Cloud Functions
firebase deploy --only functions

# Deploy only Hosting (frontend)
firebase deploy --only hosting
```

---

## ✅ STEP 4: VERIFY DEPLOYMENT

### 4.1 Check Firestore Rules

```powershell
firebase firestore:indexes
```

### 4.2 Check Cloud Functions

```powershell
firebase functions:list
```

**Expected output:**
```
┌──────────────────────┬────────────────┬────────┐
│ Function             │ Region         │ Status │
├──────────────────────┼────────────────┼────────┤
│ startShiftWithPin    │ us-central1    │ Active │
│ endShift             │ us-central1    │ Active │
│ adminSetDriverPin    │ us-central1    │ Active │
│ getActiveShift       │ us-central1    │ Active │
└──────────────────────┴────────────────┴────────┘
```

### 4.3 Check Hosting

```powershell
firebase hosting:channel:list
```

### 4.4 Open Your Live Site

```powershell
start https://fleetwise-9ab3a.web.app
```

---

## 🧪 STEP 5: LOCAL TESTING (BEFORE DEPLOYMENT)

### 5.1 Start Frontend Locally

```powershell
npm run dev
```

**Expected output:**
```
  VITE v6.2.0  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h + enter to show help
```

Open: http://localhost:5173

### 5.2 Verify Firebase Connection

Open browser console (F12) and check:
- No red errors related to Firebase
- Look for: "Firebase initialized successfully" (if you have logging)

### 5.3 Test Shift Management

**AS ADMIN:**
1. Login with an admin account
2. Go to **Manage Drivers**
3. Create a test driver (e.g., "Test Driver")
4. Click "Set PIN" and enter `1234`
5. Check console - should see success message

**AS DRIVER:**
1. Logout and login as the test driver
2. Go to **Driver Dashboard**
3. Click "Start Shift"
4. Select a vehicle
5. Enter odometer reading (e.g., 1000)
6. Enter PIN: `1234`
7. Click "Start Shift"

**Expected:**
- ✅ Shift starts successfully
- ✅ Vehicle shows as "In Use"
- ✅ Driver shows active shift

**End Shift:**
1. Click "End Shift"
2. Enter end odometer (e.g., 1050)
3. Click "End Shift"

**Expected:**
- ✅ Shift ends successfully
- ✅ Vehicle shows as "Available"
- ✅ Shift appears in history

### 5.4 Check Firestore Data

Go to Firebase Console:
```
https://console.firebase.google.com/project/fleetwise-9ab3a/firestore
```

**Verify collections exist:**
- `users` - Should have your driver
- `vehicles` - Should have your vehicles
- `shifts` - Should have the test shift you created
- `rateLimits` - May be empty or have test driver's rate limit

---

## 🔍 STEP 6: POST-DEPLOYMENT VERIFICATION

### 6.1 Test Cloud Functions in Production

Open your deployed site: https://fleetwise-9ab3a.web.app

1. Login as admin
2. Go to Manage Drivers
3. Set a PIN for a driver
4. Login as that driver
5. Start a shift with PIN
6. End the shift

**Check Firebase Functions Logs:**
```powershell
firebase functions:log
```

Look for:
- No errors
- Successful function invocations
- Proper authentication

### 6.2 Check for Errors

```powershell
firebase functions:log --only startShiftWithPin
firebase functions:log --only endShift
```

---

## 🚨 COMMON ERRORS & FIXES

| Error | Cause | Fix |
|-------|-------|-----|
| **"Collection 'drivers' not found"** | Old Firestore rules | ✅ FIXED - Updated to `users` |
| **"npm --prefix '' run build" failed** | Wrong predeploy command | ✅ FIXED - Uses `$RESOURCE_DIR` now |
| **"localhost:3001 connection refused"** | Hardcoded localhost calls | ✅ FIXED - Commented out |
| **"PIN verification failed"** | Driver has no `pinHash` | Run `adminSetDriverPin` function |
| **"Too many failed PIN attempts"** | Rate limiting active | Wait 10 minutes or delete rate limit doc |
| **"Invalid PIN"** | Wrong PIN entered | Try correct PIN or reset via admin |
| **"Driver already has active shift"** | Shift not ended properly | End shift manually or clear `activeShiftId` |
| **"Vehicle is already in use"** | Vehicle locked by another shift | End other shift or clear `activeShiftId` |
| **"Permission denied"** | User not authenticated | Ensure Firebase Auth is working |
| **"Function not found"** | Functions not deployed | Run `firebase deploy --only functions` |

---

## 🛠️ TROUBLESHOOTING COMMANDS

### Clear Firebase Cache
```powershell
firebase functions:config:unset --force
firebase deploy --force
```

### View Real-Time Logs
```powershell
firebase functions:log --lines 50
```

### Delete All Functions and Redeploy
```powershell
firebase functions:delete startShiftWithPin
firebase functions:delete endShift
firebase functions:delete adminSetDriverPin
firebase functions:delete getActiveShift
firebase deploy --only functions
```

### Test Functions Locally (Emulators)
```powershell
firebase emulators:start
```

Open: http://localhost:4000

---

## 📊 MONITORING YOUR DEPLOYMENT

### Firebase Console Links

- **Project Overview:** https://console.firebase.google.com/project/fleetwise-9ab3a/overview
- **Firestore Database:** https://console.firebase.google.com/project/fleetwise-9ab3a/firestore
- **Cloud Functions:** https://console.firebase.google.com/project/fleetwise-9ab3a/functions
- **Hosting:** https://console.firebase.google.com/project/fleetwise-9ab3a/hosting
- **Authentication:** https://console.firebase.google.com/project/fleetwise-9ab3a/authentication

### View Logs
```powershell
# All logs
firebase functions:log

# Last 100 lines
firebase functions:log --lines 100

# Follow logs in real-time
firebase functions:log --lines 50 --follow
```

### Check Function Metrics

Go to: https://console.firebase.google.com/project/fleetwise-9ab3a/functions

You'll see:
- Invocations per function
- Execution times
- Error rates
- Memory usage

---

## 🔐 SECURITY NOTES

### ✅ WHAT'S SECURE

1. **PIN Hashing:** All PINs are hashed with bcrypt (never stored in plain text)
2. **Server-Side Validation:** All shift operations go through Cloud Functions
3. **Rate Limiting:** Max 6 failed PIN attempts per 10 minutes
4. **Firestore Rules:** Strict read/write permissions based on roles
5. **No Client-Side Shift Writes:** Shifts collection is read-only from clients

### ⚠️ SECURITY CHECKLIST

- [ ] Change all default admin PINs
- [ ] Enable Firebase App Check (prevents API abuse)
- [ ] Set up Firebase Authentication properly
- [ ] Review Firestore rules before going live
- [ ] Enable Firebase Security Rules monitoring

---

## 📞 SUPPORT

If you encounter issues:

1. Check this guide's troubleshooting section
2. Check Firebase Console for errors
3. Run `firebase functions:log` to see detailed logs
4. Check browser console (F12) for frontend errors

**Firebase Quotas:**
- Spark (Free) Plan:
  - 125K function invocations/month
  - 40K GB-seconds compute/month
  - 10 GB hosting storage

If you exceed limits, upgrade to Blaze (pay-as-you-go) plan.

---

## 🎉 DEPLOYMENT COMPLETE!

Your FleetWise application is now live at:

**🌐 https://fleetwise-9ab3a.web.app**

Next steps:
1. Add your production data (drivers, vehicles)
2. Set PINs for all drivers
3. Train users on the system
4. Monitor logs for the first few days

---

*Generated by Claude Code - 2025-12-08*
