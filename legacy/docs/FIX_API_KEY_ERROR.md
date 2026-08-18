# 🔧 Fix "API Key Not Valid" Error

## The Problem

Your Firebase API key is correct in the `.env` file, but you're getting an error because:

1. **The app needs to be rebuilt** to pick up environment variables, OR
2. **The API key needs to be enabled** in Firebase Console

---

## ✅ Solution 1: Rebuild Your App (MOST LIKELY FIX)

### Stop Your App
If your app is running, press `Ctrl+C` in the terminal to stop it.

### Rebuild and Restart
```bash
cd C:\Users\User\Projects\FleetWise
npm run build
npm run dev
```

### Test Again
1. Open your app in browser
2. Click "I'm an Admin"
3. Login with your email/password
4. Should work now! ✅

---

## ✅ Solution 2: Enable API Key in Firebase Console

If rebuilding doesn't work, check Firebase Console:

### Step 1: Go to Firebase Console
1. Visit: https://console.firebase.google.com
2. Select your project: **fleetwise-9ab3a**

### Step 2: Check API Key Restrictions
1. Click the **gear icon** (⚙️) → **Project Settings**
2. Scroll down to **"Your apps"** section
3. Under **Web apps**, find your app
4. Click **"Config"** to see your API key
5. Verify the API key matches your `.env` file:
   ```
   AIzaSyDU_jLgRLba1Kvb8ZytGH45UqlR6494y24
   ```

### Step 3: Check API Restrictions (Google Cloud Console)
1. Go to: https://console.cloud.google.com
2. Select project: **fleetwise-9ab3a**
3. Menu → **APIs & Services** → **Credentials**
4. Find your API key: `AIzaSyDU_jLgRLba1Kvb8ZytGH45UqlR6494y24`
5. Click on it
6. Under **"API restrictions"**:
   - Should be **"None"** OR
   - Should include these APIs:
     - Identity Toolkit API
     - Cloud Firestore API
     - Firebase Authentication
7. If restricted, either:
   - Select **"None"** (easiest), OR
   - Add the required APIs

### Step 4: Save and Test
1. Click **"Save"** if you made changes
2. Wait 5 minutes for changes to propagate
3. Rebuild your app:
   ```bash
   npm run build
   npm run dev
   ```
4. Test login again

---

## 🔍 Verify Your .env File

Make sure your `.env` file has these **exact values**:

```env
VITE_FIREBASE_API_KEY=AIzaSyDU_jLgRLba1Kvb8ZytGH45UqlR6494y24
VITE_FIREBASE_AUTH_DOMAIN=fleetwise-9ab3a.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=fleetwise-9ab3a
VITE_FIREBASE_STORAGE_BUCKET=fleetwise-9ab3a.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=152244336755
VITE_FIREBASE_APP_ID=1:152244336755:web:d45ac6cd98eacf46785206
```

**Important**:
- No quotes around values
- No spaces before/after `=`
- File must be named exactly `.env` (with the dot)
- File must be in project root: `C:\Users\User\Projects\FleetWise\.env`

---

## 🔄 Complete Fix Process

### Option A: Quick Bat File (EASIEST)

**Double-click**: `FIX_AND_RESTART.bat`

### Option B: Manual Commands

```bash
# Stop current app (Ctrl+C)

# Navigate to project
cd C:\Users\User\Projects\FleetWise

# Clean rebuild
npm run build

# Restart
npm run dev
```

---

## 🆘 If Still Not Working

### Check Browser Console (F12)
1. Open your app
2. Press `F12` to open DevTools
3. Go to **Console** tab
4. Look for Firebase errors
5. Share the error message

### Common Issues:

**1. Wrong Project Selected**
- Make sure you're in project: **fleetwise-9ab3a**
- Not some other Firebase project

**2. API Key Has Restrictions**
- Remove restrictions in Google Cloud Console
- Or add required APIs

**3. Environment Variables Not Loading**
- Make sure `.env` file exists
- Restart dev server
- Clear browser cache (Ctrl+Shift+Delete)

**4. Using Wrong API Key**
- Verify API key in Firebase Console matches `.env`
- Copy-paste to avoid typos

---

## 📋 Quick Checklist

- [ ] `.env` file exists in project root
- [ ] API key in `.env` matches Firebase Console
- [ ] Rebuilt app: `npm run build`
- [ ] Restarted app: `npm run dev`
- [ ] Cleared browser cache
- [ ] API key has no restrictions (or correct APIs enabled)
- [ ] Waited 5 minutes after making Firebase Console changes

---

## 🎯 Most Common Fix (90% of cases):

```bash
cd C:\Users\User\Projects\FleetWise
npm run build
npm run dev
```

Then test admin login again!

---

**TL;DR**: Stop app, run `npm run build`, run `npm run dev`, try again! 🚀
