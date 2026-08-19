# FleetWise V2 — Firestore Security Plan (WP5B)

> Design + local validation only. **No rules were deployed and no real data was changed.**
> Contains no secrets.

## Actual authentication model (verified from code)
- **Admin** — signs in via Firebase Auth email/password (AdminLogin.tsx → signInWithEmailAndPassword).
  The admin's Firestore document is users/{firebaseAuthUid} with role 'admin'
  (createAdminUser writes setDoc(users, uid, { role: 'admin' })).
- **Driver** — signs in with a 4-digit PIN via the validateDriverPin callable. **No Firebase Auth.**
  The logged-in driver is only React/application state (currentUser) — request.auth is **null**.
- **Unauthenticated** — request.auth == null.

## Admin trust model
- Admins are STRONGLY identifiable by Firestore rules:
  request.auth != null AND get(/users/$(request.auth.uid)).data.role == 'admin'.
- Caveat: admin creation (createAdminUser) currently writes users/{uid} from the client.
  If users is locked down, the first admin must be bootstrapped another way (one-time script or
  Cloud Function), and future admin creation must move behind a callable.

## Driver trust model
- PIN-authenticated drivers are NOT identifiable by Firestore rules (no request.auth).
  Firestore cannot distinguish a logged-in driver from an unauthenticated client.
- Therefore no per-driver write can be authorized by rules alone. Driver-sensitive writes
  (defect reporting, refuel, charge) must move behind Cloud Functions.

## Firestore rules limitations
- Rules cannot redact individual fields: allowing a document read returns the WHOLE document.
- Therefore pinHash cannot be hidden while still allowing client reads of users.
- Rules cannot evaluate 'which driver is this?' without a Firebase Auth identity.

## pinHash exposure issue
- getUsers() runs getDocs(collection('users')) → downloads every user document, including
  pinHash, to the browser (the client-side delete is cosmetic; the data still crosses the wire).
- Resolution: deny direct client reads of users and provide a server-side safe projection
  via a callable (list users without pinHash).

## Direct client access matrix (active src, excludes legacy/)
| Collection | Client READ | CREATE | UPDATE | DELETE |
|---|---|---|---|---|
| users | getUsers, getAdminUsers | addDriver, createAdminUser | updateDriver, updateEmploymentStatus | deleteDriver |
| vehicles | getVehicles, getVehicle | addVehicle | updateVehicle | deleteVehicle |
| shifts | getDriverShifts, getActiveShifts, getLastCompletedShift | — (function) | — (function) | — |
| defects | getActiveDefects, getVehicleDefects, getAllDefects | addDefectReport | updateDefectReport, updateDefectStatus, assignDefect | deleteDefectReport |
| costs | getCosts, getVehicleCosts | addCost | updateCost | deleteCost |
| maintenanceRecords | — (nested in vehicle) | addMaintenanceRecord | — | — |
| scheduledServices | getScheduledServices | addScheduledService | updateScheduledService | — |
| driverFines | getDriverFines | addDriverFine | updateDriverFine | — |
| vehicleDamages | getVehicleDamages | addVehicleDamage | updateVehicleDamage | — |
| refuelRecords | getRefuelRecords | addRefuelRecord (unwired) | — | — |
| chargeRecords | getChargeRecords | addChargeRecord (unwired) | — | — |
| serviceProviders | getServiceProviders | addServiceProvider | updateServiceProvider | deleteServiceProvider |
| settings | getSettings | (auto-create default) | updateSettings | — |
| fuelEconomyAlerts | getFuelEconomyAlerts | — | — | — |
| fw_health | readHealthProbe | writeHealthProbe | writeHealthProbe | — |
| rateLimits | — | — | — | — (server only) |

## Proposed rule policy (firestore.rules.proposed — NOT deployed)
- Default deny for unspecified collections.
- users: deny all direct client read/write (pinHash). Move to callables.
- vehicles: public read; admin write.
- shifts: public read; create/update/delete denied (Cloud Functions own them).
- defects: public read; admin update/delete; create denied (driver report → callable).
- costs / maintenanceRecords / scheduledServices / driverFines / vehicleDamages / serviceProviders / settings / fuelEconomyAlerts / fw_health: admin read/write.
- refuelRecords / chargeRecords: public read; write denied (driver → callable).
- rateLimits: deny all (server only).
- Cloud Functions use the Admin SDK, which bypasses these rules, so the six bridge callables
  (validateDriverPin, startShiftWithPin, endShift, getActiveShift, adminSetDriverPin,
  driverChangePin) keep working unchanged.

## Lockdown impact matrix
| Feature | Current path | Safe after lockdown? | Required action |
|---|---|---|---|
| Admin login | Firebase Auth + getUsers | NO | add admin-profile/lookup callable |
| Driver selection | getUsers (list) | NO | add list-users-safe callable |
| Driver PIN login | validateDriverPin callable | YES | none |
| Start Shift | startShiftWithPin callable | YES | none |
| Active Shift lookup | getActiveShift callable | YES | none |
| End Shift | endShift callable | YES | none |
| Vehicle list | getVehicles (direct read) | YES (public read) | none |
| Manage vehicles | admin CRUD | YES (isAdmin) | none |
| Manage drivers | getUsers + update/delete | NO (users denied) | move to callables |
| Report defect | addDefectReport (direct) | NO (no driver auth) | reportDefect callable |
| View defects | direct read | YES (public read) | none |
| Log refuel | addRefuelRecord (unwired) | NO | logRefuel callable (when wired) |
| Log charge | addChargeRecord (unwired) | NO | logCharge callable (when wired) |
| Costs / maintenance / fines / damages / providers / settings | admin CRUD | YES (isAdmin) | none |
| Stats / history | direct reads | YES (public read) | none |

## Required Cloud Functions BEFORE live lockdown
1. listUsersSafe — return users without pinHash (driver selection + admin screens).
2. createDriver / updateDriver / deleteDriver / updateEmploymentStatus — admin user CRUD.
3. createAdminUser (server-side) — admin provisioning + first-admin bootstrap.
4. reportDefect — driver defect reporting (driver identity via the callable).
5. logRefuel / logCharge — driver fuel/charge logging (when those forms are wired).

These are the additional secure-bridge items that must land before the proposed rules can be
deployed without breaking driver login / driver-selection / defect-reporting.

## Recommended rollout order
1. Implement + deploy the required callables (listUsersSafe, user CRUD, reportDefect).
2. Repoint the frontend to those callables; remove direct users reads and direct defects create.
3. Run the rules unit tests against the emulator (see test/).
4. Deploy the proposed rules in a test/(default) project first, then verify the six bridge callables
   still pass (Admin SDK bypass) and the real app works end-to-end.
5. Deploy to production only after the above passes.

## Rollback considerations
- Keep the current open firestore.rules unchanged until step 4 passes.
- Rules can be rolled back by re-deploying the previous open rules file; no data is affected by a
  rules change (rules gate access, not data).
- The callable migrations are additive and do not touch existing Firestore records.

## Tests created
- firestore.rules.proposed — proposed default-deny rules.
- test/firestore.rules.test.js — emulator unit tests (unauthenticated, admin, shifts, rateLimits,
  unknown-collection cases).

## Emulator test result
- NOT EXECUTED in this environment — the sandbox has no Java, no @firebase/rules-unit-testing
  package, and no network to install the emulator/test package. The harness is authored and ready
  to run with: npm i -D @firebase/rules-unit-testing, then
  firebase emulators:exec --only firestore "node test/firestore.rules.test.js".