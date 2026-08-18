# FleetWise V2 — Cloud Function Runtime Verification (WP5A)

> Work Package 5A: controlled functions deployment + runtime verification.
> **Outcome: deployment and runtime verification could NOT be executed in this environment**
> because outbound network egress is blocked (the sandbox closes every HTTPS connection and the
> `firebase deploy` attempt timed out). This document records what was verified locally, what must
> still be verified by a human in a network-enabled environment, and the WP5B access inventory.
> Contains no secrets, raw PINs, or PIN hashes.

## Firebase project
- Project ID: **fleetwise-9ab3a** (confirmed via `.firebaserc`).
- Firestore database: **(default)**.
- Functions source: `functions`, codebase `default`, Node runtime `18`.
- Functions region: **us-central1** (default; no region override in `functions.https.onCall`).

## Deployment result
- **NOT DEPLOYED.** `firebase deploy --only functions` was attempted and **timed out**
  (outbound network blocked). The Firebase CLI is logged in as the owner account, but the CLI
  cannot reach Google Cloud from this sandbox.
- No functions were uploaded; no Firestore data, rules, or indexes were touched.

## Pre-deploy build checks (PASS, local)
| Check | Result |
|---|---|
| `npm run typecheck` (frontend) | PASS — 0 errors |
| Cloud Functions build (`functions/ npm run build`) | PASS |
| Frontend production build (`npm run build`) | NOT VERIFIED — sandbox `spawn EPERM` (esbuild) |

## Runtime tests — NOT EXECUTED (blocked by environment)
The following tests could not be run because Firestore/Cloud Functions are unreachable. They must
be run by a human after deploying the functions from a network-enabled machine. Expected results
(derived from the WP4 implementation) are listed for the operator.

| Test | Expected | Status |
|---|---|---|
| Correct PIN | `validateDriverPin` returns `{valid:true, requiresPinChange, message}` | NOT RUN |
| Incorrect PIN | structured `permission-denied` → facade returns `{valid:false}` | NOT RUN |
| Admin Set PIN | `adminSetDriverPin` hashes server-side; `pinHash` written only server-side | NOT RUN |
| Driver Change PIN | `driverChangePin` verifies + hashes server-side | NOT RUN |
| Start Shift | creates legacy-compatible `shifts` doc (`startTime/startOdometer/status:'Active'` + `createdAt/updatedAt`) + additive `activeShiftId` | NOT RUN |
| Duplicate driver start | second `startShiftWithPin` rejected; first shift intact | NOT RUN |
| Duplicate vehicle claim | second claim of same vehicle rejected | NOT RUN |
| Get Active Shift | returns active shift (pointer-first, legacy fallback); errors distinct from "no shift" | NOT RUN |
| End Shift | same shift → `endTime/endOdometer/status:'Completed'/updatedAt`; pointer cleared | NOT RUN |
| Post-end active shift | `getActiveShift` returns "no active shift"; localStorage cleared | NOT RUN |

## Historical data integrity
- **No Firestore writes of any kind were attempted in WP5A** (network blocked before any write).
- `firestore.rules` is byte-for-byte unchanged (verified via git).
- Existing `users`, `vehicles`, historical `shifts`, licensing, `defects`, `settings`, and
  `serviceProviders` remain untouched.

## Explicit statement
**Firestore rules were not changed or deployed in WP5A.** The temporary development rules remain
in place intentionally; rule lockdown is deferred to WP5B (after runtime verification).

## Remaining direct client Firestore accesses (input for WP5B)
| Collection | Client READ | Client CREATE | Client UPDATE | Client DELETE | Role / Screen |
|---|---|---|---|---|---|
| users | getUsers, getAdminUsers | addDriver, createAdminUser | updateDriver, updateEmploymentStatus | deleteDriver | Admin (ManageDrivers, Settings); Driver (login list) |
| vehicles | getVehicles, getVehicle | addVehicle | updateVehicle | deleteVehicle | Admin (ManageVehicles) |
| shifts | getDriverShifts, getActiveShifts, getLastCompletedShift | — (via function) | — (via function) | — | Driver (dashboard); Admin |
| defects | getActiveDefects, getVehicleDefects, getAllDefects | addDefectReport | updateDefectReport, updateDefectStatus, assignDefect | deleteDefectReport | Driver (ReportDefectForm); Admin (ManageDefects) |
| costs | getCosts, getVehicleCosts | addCost | updateCost | deleteCost | Admin (ManageCosts) |
| maintenanceRecords | — (nested in vehicle) | addMaintenanceRecord | — | — | Admin (ManageVehicles) |
| scheduledServices | getScheduledServices | addScheduledService | updateScheduledService | — | Admin (AdminDashboard) |
| driverFines | getDriverFines | addDriverFine | updateDriverFine | — | Admin (ManageIncidents) |
| vehicleDamages | getVehicleDamages | addVehicleDamage | updateVehicleDamage | — | Admin (ManageIncidents) |
| refuelRecords | getRefuelRecords | addRefuelRecord (unwired) | — | — | Driver (LogRefuelForm) |
| chargeRecords | getChargeRecords | addChargeRecord (unwired) | — | — | Driver (LogChargeForm) |
| serviceProviders | getServiceProviders | addServiceProvider | updateServiceProvider | deleteServiceProvider | Admin (ManageServiceProviders) |
| settings | getSettings | (auto-create default) | updateSettings | — | Admin (Settings) |
| fuelEconomyAlerts | getFuelEconomyAlerts | — | — | — | Admin (FuelEconomyMonitor) |
| fw_health | readHealthProbe | writeHealthProbe | writeHealthProbe (setDoc merge) | — | Admin (AdminHealth) |

## How to complete WP5A (human, network-enabled)
1. From a machine with Firebase access: `firebase deploy --only functions --project fleetwise-9ab3a`.
2. Choose one test driver + one available vehicle (confirm neither is in live operational use).
3. Run the runtime tests above (correct/incorrect PIN, admin set PIN, start/duplicate/end shift,
   getActiveShift), then confirm historical records are unchanged and `getActiveShift` returns null.
4. Record results and re-run `npm run build` on a real machine for the frontend PASS.
