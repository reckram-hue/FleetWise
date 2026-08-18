# Admin Account Setup Guide

## Overview

Your FleetWise application now has proper role-based authentication:
- **Drivers**: Login with 4-digit PIN
- **Admins**: Login with Firebase Authentication (email/password)

## Setting Up Your First Admin Account

### Option 1: Using Firebase Console (Recommended)

1. **Create Firebase Auth User**
   ```
   Go to: Firebase Console → Authentication → Users
   Click: "Add User"

   Email: admin@fleetwise.com (or your preferred email)
   Password: [Create a strong password]
   ```

2. **Create Admin Profile in Firestore**
   ```
   Go to: Firebase Console → Firestore Database → users collection
   Click: "Add Document"

   Document ID: [Use the UID from the Auth user you just created]

   Fields:
   - firstName: "Admin"
   - surname: "User"
   - email: "admin@fleetwise.com" (must match Auth email)
   - role: "admin"
   - employmentStatus: "Active"
   - createdAt: [Timestamp - now]
   ```

3. **Test Login**
   - Open your app
   - Click "I'm an Admin"
   - Enter email and password
   - Should redirect to admin dashboard

### Option 2: Using Firebase CLI

```bash
# Create Auth user
firebase auth:create admin@fleetwise.com --password "YourSecurePassword"

# Get the UID from the output, then create Firestore document
# (You'll need to do this manually in Console or via script)
```

### Option 3: Using Admin SDK Script

Create a setup script (`setup-admin.js`):

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./path/to/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function createAdmin() {
  const email = 'admin@fleetwise.com';
  const password = 'YourSecurePassword';

  try {
    // Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      emailVerified: true,
    });

    console.log('✅ Created Auth user:', userRecord.uid);

    // Create Firestore profile
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      firstName: 'Admin',
      surname: 'User',
      email: email,
      role: 'admin',
      employmentStatus: 'Active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Created Firestore profile');
    console.log('\n📧 Admin Email:', email);
    console.log('🔑 Admin Password:', password);
    console.log('🆔 Admin UID:', userRecord.uid);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createAdmin();
```

Run it:
```bash
node setup-admin.js
```

## Authentication Flow

### For Admins:
```
1. Open app
   ↓
2. Click "I'm an Admin"
   ↓
3. Enter email & password (Firebase Auth)
   ↓
4. System validates credentials
   ↓
5. Fetches admin profile from Firestore
   ↓
6. Verifies role is "admin"
   ↓
7. Redirects to admin dashboard
```

### For Drivers:
```
1. Open app
   ↓
2. Click "I'm a Driver"
   ↓
3. Select name from list
   ↓
4. Enter 4-digit PIN
   ↓
5. System validates PIN via Cloud Function
   ↓
6a. If PIN is "1234" → Force PIN change
6b. If PIN is custom → Go to dashboard
```

## Security Rules

Make sure your Firestore security rules allow admins to read/write but drivers to only read their own data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function to check if user is admin
    function isAdmin() {
      return request.auth != null &&
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }

    // Users collection
    match /users/{userId} {
      // Admins can read/write all
      allow read, write: if isAdmin();

      // Drivers can read their own profile
      allow read: if isAuthenticated() && request.auth.uid == userId;
    }

    // Vehicles - admins full access, drivers read-only
    match /vehicles/{vehicleId} {
      allow read, write: if isAdmin();
      allow read: if isAuthenticated();
    }

    // Shifts - admins full access, drivers can read own shifts
    match /shifts/{shiftId} {
      allow read, write: if isAdmin();
      allow read: if isAuthenticated() &&
                     resource.data.driverId == request.auth.uid;
    }

    // Other collections follow similar patterns
  }
}
```

## Important Notes

### Email Verification
- By default, Firebase Auth doesn't require email verification
- You can enable it in Firebase Console → Authentication → Settings
- Or require verified emails in your security rules

### Password Reset
Users can reset their password via Firebase Auth:
1. Go to Firebase Console → Authentication
2. Find the user
3. Click "Reset password"
4. Firebase will send a password reset email

### Multiple Admins
To create additional admin accounts:
1. Create Firebase Auth user (email/password)
2. Create Firestore profile with `role: "admin"`
3. Give them their credentials

### Driver Accounts vs Auth
- **Drivers do NOT need Firebase Auth accounts**
- They only need a Firestore profile with `pinHash`
- PIN authentication is handled via Cloud Functions
- Drivers never access Firebase Auth

## Testing

### Test Admin Login:
```
Email: admin@fleetwise.com
Password: [Your password]

Expected: Access to admin dashboard
Expected: Can manage drivers, vehicles, shifts
```

### Test Driver Login:
```
Select: [Any active driver]
PIN: 1234 (first time) or their custom PIN

Expected: Access to driver dashboard
Expected: Can start/end shifts, report defects
```

### Test Role Separation:
```
1. Login as driver
2. Try to access /admin route
Expected: Redirected to /driver

1. Login as admin
2. Try to access /driver route
Expected: Redirected to /admin
```

## Troubleshooting

### "Invalid email or password"
- Check email is correct in Firebase Auth
- Check password is correct
- Check user exists in Firebase Auth

### "User profile not found"
- Auth user exists but Firestore profile doesn't
- Create Firestore document with matching email
- Ensure `role: "admin"` is set

### "Access denied. Admin privileges required"
- Firestore profile exists but role is not "admin"
- Update the role field to "admin" in Firestore

### Can't login to admin panel
- Verify Firebase Auth is working (check Firebase Console)
- Check browser console for errors
- Verify Firestore security rules allow admin access

## Production Recommendations

1. **Use Strong Passwords**: Minimum 12 characters, mix of upper/lower/numbers/symbols
2. **Enable 2FA**: Firebase supports 2FA for additional security
3. **Limit Admin Accounts**: Only create admin accounts for trusted personnel
4. **Audit Logs**: Monitor Firebase Auth logs for suspicious activity
5. **Regular Reviews**: Periodically review admin accounts and remove unused ones

## Next Steps

After creating your admin account:
1. ✅ Login and verify access to admin dashboard
2. ✅ Create your first driver (will get default PIN: 1234)
3. ✅ Create some vehicles
4. ✅ Test driver login with default PIN
5. ✅ Test PIN change flow
6. ✅ Test shift start/end with PIN authentication

---

**Created**: January 2026
**Admin Auth**: Firebase Authentication (email/password)
**Driver Auth**: PIN-based (bcrypt hashed)
