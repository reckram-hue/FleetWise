# FleetWise V2 — WP5C Security Implementation

> Implementation record only. **Nothing was deployed. No real Firestore data was modified.**
> This document describes what was built and what must happen before the proposed rules go live.

---

## Objective

Close every gap identified in WP5B's lockdown impact matrix:
- Move all `users` reads/writes behind Cloud Function callables so direct client access can be denied.
- Move driver defect creation behind a PIN-verified callable (no Firebase Auth identity for drivers).
- Eliminate `pinHash` from any data that crosses the network to the browser.
- Ensure the proposed `firestore.rules.proposed` can be deployed without breaking any current feature.

---

## What Was Implemented

### New Cloud Function Callables (`functions/src/index.ts`)

| Callable | Auth | Purpose |
|---|---|---|
| `listDriversSafe` | None (public) | Driver-selection screen: returns `id, firstName, surname, area, department, employmentStatus, role` only. Never returns `pinHash`, PII fields. |
| `getAdminProfile` | Firebase Auth (any) | Admin login: reads `users/{context.auth.uid}`, verifies `role == 'admin'`, returns profile sans `pinHash`. |
| `listUsersAdmin` | Firebase Auth, role=admin | Admin screens: returns all users sans `pinHash`. |
| `createDriver` | Firebase Auth, role=admin | Creates driver doc. Strips `pinHash` from payload unconditionally. |
| `updateDriver` | Firebase Auth, role=admin | Patch-updates driver doc. Strips `pinHash`, `pinLastUpdated`, `pinLastUpdatedBy`. |
| `archiveDriver` | Firebase Auth, role=admin | Archive/inactivate: sets `employmentStatus=Inactive`, retention metadata, optional legal hold. Never physically deletes. Blocks if active shift exists. |
| `updateEmploymentStatus` | Firebase Auth, role=admin | Sets employment status + optional end date. |
| `createAdminUser` | Firebase Auth, role=admin | Creates Firebase Auth user + `users/{uid}` doc server-side (no secondary-app hack). |
| `reportDefect` | None (PIN-verified) | Creates defect document after bcrypt-verifying `driverId+pin`. Rate-limited. Verifies vehicle exists and driver is Active. |

All admin callables run `requireAdmin(context)` which confirms `context.auth` is present and `users/{uid}.data.role == 'admin'` before doing anything.

### Helper utilities added

- `requireAdmin(context)` — enforced admin gate, throws `unauthenticated` / `permission-denied`.
- `stripSensitiveFields(data, id)` — removes `pinHash`; used for admin-facing responses.
- `stripToDriverSafe(data, id)` — limits to 6 safe fields; used for `listDriversSafe`.

### Zod validation schemas added

`CreateDriverSchema`, `UpdateDriverSchema`, `UpdateEmploymentStatusSchema`, `CreateAdminSchema`, `ReportDefectSchema` — all inputs validated before any Firestore operation.

---

## Frontend Migration (`src/services/firebaseApi.ts`)

| Method | Before WP5C | After WP5C |
|---|---|---|
| `getUsers()` | Direct `getDocs(users)` — sends `pinHash` to browser | → `listUsersAdmin` callable |
| `getAdminUsers()` | Direct `getDocs(users, where role==admin)` | → `listUsersAdmin` callable + client filter |
| `listDriversSafe()` | Did not exist | → `listDriversSafe` callable (public) |
| `getAdminProfile()` | Did not exist | → `getAdminProfile` callable |
| `createAdminUser()` | Secondary-app hack in browser | → `createAdminUser` callable |
| `addDriver()` | Direct `addDoc(users)` | → `createDriver` callable |
| `updateDriver()` | Direct `updateDoc(users)` | → `updateDriver` callable |
| `archiveDriver()` | Direct `deleteDoc(users)` | → `archiveDriver` callable (inactivation + retention, never deletes) |
| `updateEmploymentStatus()` | Direct `updateDoc(users)` | → `updateEmploymentStatus` callable |
| `addDefectReport()` | Direct `addDoc(defects)` (no PIN) | → `reportDefect` callable (PIN-verified) |
| `getLeaderboard()` | `getUsers()` (admin-only) — broke for drivers | → `listDriversSafe()` (public) |

### Admin login (`AdminLogin.tsx`)

Before: `getUsers()` → scan all users to find matching email → sent `pinHash` of every user to browser.
After: `getAdminProfile()` callable → server reads `users/{uid}` directly, returns only the caller's profile.

### Driver selection (`DriverPinLogin.tsx`)

Before: `getUsers()` → all user documents (including `pinHash`, PII) downloaded.
After: `listDriversSafe()` callable → 6 safe fields only.

---

## PIN Session State — Design Rejection and Fix

The initial WP5C implementation stored the driver's raw PIN in React `useState` at the `App` level and threaded it through `UserContext.driverPin` for the entire session. This was rejected:

**Rejected design:**
- `DriverPinLogin` → `onLogin(user, requiresPinChange, pin)` — raw PIN passed up
- `App.tsx` → `const [driverPin, setDriverPin] = useState<string | null>(null)` — lives for session
- `UserContext.driverPin` — accessible to every component for the session's duration

**Secure replacement:**
- `driverPin` removed from `UserContext` and `App` state entirely
- `DriverPinLogin.onLogin` reverted to `(user, requiresPinChange)` — no PIN passed up
- `ReportDefectForm`: local `useState<string>('')` `pinInput` — 4-digit field above submit; cleared on submit/error
- `ShiftStart` defect modal: local `useState<string>('')` `defectPin` — cleared on submit/error/modal-close

The PIN now lives only in a single component's `useState` for the ~seconds of one form interaction. It is never promoted to a context spanning the component tree.

---

## Proposed Firestore Rules (`firestore.rules.proposed`)

Status: complete, not deployed.

```
users       → allow read, write: if false   (all operations via callables)
vehicles    → read: public; write: isAdmin()
shifts      → read: public; write: false    (owned by Cloud Functions)
defects     → read: public; create: false; update/delete: isAdmin()
costs/maintenanceRecords/scheduledServices/driverFines/vehicleDamages/
serviceProviders/settings/fuelEconomyAlerts/fw_health
            → read/write: isAdmin()
refuelRecords/chargeRecords
            → read: public; write: false    (deferred to fuel/energy WP)
rateLimits  → all: false                   (server-only)
default     → all: false
```

`isAdmin()` = `request.auth != null && get(/users/$(request.auth.uid)).data.role == 'admin'`

The `get()` inside `isAdmin()` is a rules-internal read and is NOT blocked by the `users` deny rule.

---

## Rules Test Coverage (`test/firestore.rules.test.js`)

Tests cover: unauthenticated, admin, non-admin authenticated, and cross-collection access patterns.

| Test group | Assertions |
|---|---|
| Unauthenticated — users | cannot read, list, create, update |
| Unauthenticated — shifts/defects | cannot write; can read public data |
| Unauthenticated — operational collections | cannot read any of costs/maintenanceRecords/scheduledServices/driverFines/vehicleDamages/serviceProviders/settings/fuelEconomyAlerts/fw_health |
| Unauthenticated — rateLimits/unknown | blocked |
| Admin — users | cannot read or write (callables only) |
| Admin — vehicles | full CRUD permitted |
| Admin — shifts | cannot write (callable-owned) |
| Admin — defects | cannot create; can update/delete |
| Admin — operational collections | full CRUD on all |
| Admin — fuelEconomyAlerts, fw_health | read/write permitted |
| Admin — rateLimits | blocked |
| Non-admin authenticated | cannot read/write users, vehicles, operational collections |
| Non-admin authenticated | can read public data (vehicles, shifts, defects) |

Test harness requires: `@firebase/rules-unit-testing` + Firestore emulator + Java.

```bash
npm install --save-dev @firebase/rules-unit-testing
firebase emulators:exec --only firestore "node test/firestore.rules.test.js"
```

---

## Remaining Deferred Items (out of WP5C scope)

| Item | Status | Required before lockdown? |
|---|---|---|
| `refuelRecords` / `chargeRecords` driver writes | Forms unwired; write blocked by proposed rules | YES — needs `logRefuel` / `logCharge` callables before lockdown |
| First-admin bootstrap | Admin creation callable exists; first admin still needs manual Firestore write or one-time script | YES |
| Admin can create defects via UI | No admin UI screen currently calls `addDefectReport`; a future admin defect-creation flow must use a callable (direct create is blocked by proposed rules) | When admin defect creation is needed |

---

## Pre-Deployment Checklist

Before promoting `firestore.rules.proposed` → `firestore.rules`:

- [ ] Deploy all new callables listed above (see deployment command below)
- [ ] Smoke-test driver login (listDriversSafe), admin login (getAdminProfile), manage drivers (all CRUD callables)
- [ ] Smoke-test defect reporting from ShiftStart and ReportDefectForm
- [ ] Run `firebase emulators:exec --only firestore "node test/firestore.rules.test.js"` — all tests pass
- [ ] Verify the six pre-existing bridge callables still work: `validateDriverPin`, `startShiftWithPin`, `endShift`, `getActiveShift`, `adminSetDriverPin`, `driverChangePin`
- [ ] Ensure first admin user exists in Firestore (bootstrap if needed)
- [ ] Deploy rules: `firebase deploy --only firestore:rules`
- [ ] Monitor Cloud Function error rates and Firestore security rule denials for 30 minutes post-deploy
