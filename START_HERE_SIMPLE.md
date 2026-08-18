# 🚀 Simple Setup Guide - Start Here!

## Step 1: Open the PIN Fix Tool in Your Browser

### Windows Users:
1. **Open File Explorer** (Windows key + E)
2. **Navigate to**: `C:\Users\User\Projects\FleetWise`
3. **Find the file**: `fix-drivers-simple.html`
4. **Right-click on it** → Select **"Open with"** → Choose **"Chrome"** or **"Edge"** or **"Firefox"**
5. A web page will open in your browser

### What You'll See:
A dark page with a blue button that says "🔐 Fix All Driver PINs"

## Step 2: Fix Your Drivers

1. **Click the blue button**: "🔐 Fix All Driver PINs"
2. **Wait a few seconds**
3. **Look for green checkmarks** that say: "✅ Set PIN for: [Driver Name]"
4. **You should see**: "✨ Complete! Fixed: X driver(s)"

## Step 3: Deploy Cloud Functions (REQUIRED)

Open **Command Prompt** or **PowerShell**:

1. Press **Windows key**
2. Type: `cmd` and press Enter
3. Type these commands one by one:

```bash
cd C:\Users\User\Projects\FleetWise\functions
firebase deploy --only functions
```

Wait for it to finish (may take 2-3 minutes). You should see:
```
✔ functions[validateDriverPin]
✔ functions[driverChangePin]
```

## Step 4: Restart Your App

In the same command prompt:

```bash
cd ..
npm run dev
```

## Step 5: Test Driver Login

1. **Open your app** in browser (usually http://localhost:5173)
2. **Click**: "I'm a Driver"
3. **Select** any driver name
4. **Enter PIN**: `1234`
5. **It should work now!** ✅

## Step 6: About Admin Login

**Important**: You CANNOT use Firestore credentials to login as admin.

### To Login as Admin, You Need:

**Option A: Create Firebase Auth Account** (Recommended)

1. Go to: https://console.firebase.google.com
2. Select your project: **fleetwise-9ab3a**
3. Click **"Authentication"** in left menu
4. Click **"Users"** tab
5. Click **"Add User"** button
6. Enter:
   - Email: `admin@fleetwise.com` (or your email)
   - Password: `YourPassword123!` (choose a strong one)
7. Click **"Add User"**
8. **COPY THE UID** (looks like: xK2jF8pL3mN...)

**Now Create Admin Profile in Firestore:**

1. Still in Firebase Console, click **"Firestore Database"**
2. Click on **"users"** collection
3. Click **"Add Document"**
4. **Document ID**: Paste the UID you copied
5. **Add these fields**:
   - `firstName` (string): "Admin"
   - `surname` (string): "User"
   - `email` (string): "admin@fleetwise.com" (must match!)
   - `role` (string): "admin"
   - `employmentStatus` (string): "Active"
6. Click **"Save"**

**Now you can login:**
- Email: admin@fleetwise.com
- Password: YourPassword123! (whatever you set)

---

**Option B: Use Mock Admin** (Quick Test Only)

For now, you can temporarily use the mock admin:

Edit `src\App.tsx` and find this section (around line 73):

```typescript
// Admin email/password login
if (appState.screen === 'admin-login') {
  return <AdminLogin onLogin={handleAdminLogin} onBack={handleBack} />;
}
```

Replace it with:

```typescript
// Admin email/password login
if (appState.screen === 'admin-login') {
  // TEMPORARY: Use mock admin for testing
  const mockAdmin = {
    id: 'admin1',
    firstName: 'Admin',
    surname: 'User',
    role: 'admin' as const,
    email: 'admin@fleetwise.com',
    employmentStatus: 'Active' as const
  };
  handleAdminLogin(mockAdmin);
  return null;
}
```

Then:
- Restart app (Ctrl+C in terminal, then `npm run dev`)
- Click "I'm an Admin"
- You'll login automatically

---

## 🎯 Quick Summary

### For Drivers:
1. ✅ Fix PINs using HTML tool (open in browser)
2. ✅ Deploy Cloud Functions
3. ✅ Login with PIN: 1234
4. ✅ Change PIN to something secure

### For Admin:
1. ✅ Create Firebase Auth user
2. ✅ Create Firestore profile with role "admin"
3. ✅ Login with email/password

---

## 🆘 Still Having Issues?

### Issue: "Cannot find firebase command"
**Fix**: Install Firebase CLI:
```bash
npm install -g firebase-tools
firebase login
```

### Issue: HTML tool shows errors
**Fix**: Check browser console (F12) and share the error message

### Issue: Drivers still can't login
**Check**:
1. Did you click the button in the HTML tool?
2. Did you deploy Cloud Functions?
3. Did you restart your app?

---

## 📞 What Each File Does

- `fix-drivers-simple.html` → Adds PINs to existing drivers
- Cloud Functions → Validates PINs when logging in
- Your app → The actual FleetWise application

All three need to work together!

---

**Next Step**: Open `fix-drivers-simple.html` in Chrome/Edge browser (not VS Code!)
