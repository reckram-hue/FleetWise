# 🔧 Fix "Incorrect PIN" Issue - Existing Drivers

## The Problem

Your existing drivers were created **before** the PIN system was implemented. They don't have a `pinHash` field in Firestore, so PIN validation fails.

## Quick Fix - Choose ONE Method:

---

## ✨ Method 1: Browser-Based Tool (EASIEST - NO SETUP)

### Step 1: Open the Fix Tool
1. Open file in browser: `fix-drivers-simple.html`
2. Or: Right-click → Open With → Chrome/Firefox

### Step 2: Click the Button
1. Click "🔐 Fix All Driver PINs"
2. Wait for it to complete
3. Should see: "✅ Set PIN for: [Driver Name]"

### Step 3: Test
1. Refresh your FleetWise app
2. Login as driver
3. Enter PIN: `1234`
4. Should work now! ✨

---

## 💻 Method 2: Node.js Script (More Secure)

### Step 1: Get Service Account Key
1. Go to: [Firebase Console](https://console.firebase.google.com/)
2. Project Settings → Service Accounts
3. Click "Generate New Private Key"
4. Save as: `serviceAccountKey.json` in your project root

### Step 2: Run the Script
```bash
node fix-existing-drivers.js
```

### Step 3: Verify
You should see output like:
```
✅ Set PIN for: John Doe (ID: abc123)
✅ Set PIN for: Jane Smith (ID: def456)

✨ Complete!
   Fixed: 2 driver(s)
```

---

## 🔥 Method 3: Firebase Console (Manual)

For each driver individually:

### Step 1: Get the PIN Hash
Run this in your browser console (F12):
```javascript
// Copy this bcrypt library loader
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/dcodeIO-bcrypt.js/2.4.3/bcrypt.min.js';
document.head.appendChild(script);

// Wait 2 seconds, then run:
const salt = dcodeIO.bcrypt.genSaltSync(10);
const hash = dcodeIO.bcrypt.hashSync('1234', salt);
console.log('Copy this hash:', hash);
```

### Step 2: Add to Firestore
1. Firebase Console → Firestore → `users` collection
2. Find your driver document
3. Add field:
   - Field: `pinHash`
   - Type: string
   - Value: [paste the hash from console]

### Step 3: Test
Driver can now login with PIN: `1234`

---

## 🎯 After Fixing

### Test It:
1. **Open your FleetWise app**
2. **Click "I'm a Driver"**
3. **Select any driver**
4. **Enter PIN: 1234**
5. **Should work!** → Forces PIN change
6. **Create new PIN** (e.g., 5827)
7. **Done!** ✨

### What Happens Next:
- ✅ Driver logs in with PIN `1234`
- ✅ System forces PIN change
- ✅ Driver creates custom PIN
- ✅ Driver uses custom PIN going forward

---

## 🔍 Verify It Worked

### Check in Firestore:
1. Firebase Console → Firestore
2. Open `users` collection
3. Find your driver
4. Should now have field: `pinHash: "$2a$10$..."`

### Check in Browser Console (F12):
When you create a NEW driver, you should see:
```
Driver created with default PIN (1234): driverXYZ
```

---

## ⚠️ Important Notes

1. **All existing drivers need this fix** - They were created before PIN system
2. **New drivers are automatic** - They get PIN 1234 automatically
3. **Default PIN is 1234** - All fixed drivers start with this
4. **Forced PIN change** - They MUST change it on first login
5. **One-time fix** - Only need to do this once

---

## 🆘 Still Getting "Incorrect PIN"?

### Check These:

1. **Cloud Functions Deployed?**
   ```bash
   firebase functions:list
   ```
   Should show: `validateDriverPin`

2. **Driver Has pinHash?**
   - Firebase Console → Firestore → users → [driver]
   - Look for `pinHash` field

3. **Check Logs:**
   ```bash
   firebase functions:log --only validateDriverPin
   ```

4. **Browser Console (F12):**
   - Look for errors
   - Should see: "Validating PIN for driver..."

---

## 📞 Quick Commands

```bash
# Check if Cloud Functions deployed
firebase functions:list

# View logs
firebase functions:log

# Run Node.js fix script
node fix-existing-drivers.js

# Check driver in Firestore
# (Use Firebase Console web interface)
```

---

## ✅ Success Checklist

After fixing, you should have:

- [ ] Cloud Functions deployed
- [ ] Each driver has `pinHash` field in Firestore
- [ ] Can login with PIN `1234`
- [ ] Gets redirected to PIN change screen
- [ ] Can set new PIN successfully
- [ ] Can login with new PIN

---

**TL;DR**: Open `fix-drivers-simple.html` in browser, click button, done! 🎉
