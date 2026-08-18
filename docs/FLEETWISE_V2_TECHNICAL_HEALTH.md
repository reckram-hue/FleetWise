# FleetWise V2 — Technical Health

> Work Package 3 (stabilise the retained application). Records build/type health and the
> runtime defects repaired in this pass. Contains no secrets.

## TypeScript
- **Before:** 21 errors (established at end of WP2).
- **After:** **0 errors** (`npx tsc --noEmit`, exit 0).
- Root cause of most errors: the `firebaseApi` rewrite omitted methods that `mockApi`
  previously provided, plus a duplicated `getVehicleStats` property and a few stale type fields.

## Build / checks
| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | **PASS (0 errors)** |
| Frontend production build (`npm run build`) | **NOT VERIFIED** — sandbox blocks esbuild child process (`spawn EPERM`). Environment limitation, not an app failure. |
| Cloud Functions build (`functions/ npm run build`) | **PASS** |
| Express syntax check (`node --check server/src/index.js`) | **PASS** |
| Tests | None configured |
| Lint | None configured |

A `typecheck` script (`npm run typecheck`) was added to `package.json`.

## Runtime defects repaired
- Restored missing `firebaseApi` methods (were lost in the mockApi→Firestore rewrite):
  `updateDefectStatus`, `assignDefect`, `updateDriverFine`, `updateVehicleDamage`,
  `determineDriverForFine`, `calculateFuelEconomyStatus`.
- Removed the duplicated `getVehicleStats` (kept the 1-argument version used by `LogChargeForm`).
- `getVehicleCosts()` now accepts no argument (returns all costs) as `ManageCosts` expects.
- `getDriverIncidentSummary` now consistently returns an array.
- Removed the invalid `useFetchStreams` Firestore option (removed in Firebase SDK 12).
- Removed unsupported `title` props on lucide icons in `FuelEconomyMonitor`.
- Added `Vehicle.year` and `Vehicle.licenseDiscNumber` fields (used by `VehicleLicenseRenewal`).
- Made `ServiceProvider.createdDate` / `lastModified` optional.

## Unresolved functional defects (deferred — not WP3 scope)
- **Charging is not persisted** — `LogChargeForm` still ends in `alert()`; `addChargeRecord`
  exists but is never called. Needs a later wiring decision (existing record schema).
- **Refuelling is not persisted** — `LogRefuelForm` still ends in `alert()`; `addRefuelRecord`
  exists but is never called.
- **Driver PIN is validated client-side** (bcrypt hash read into the browser).
  Server-side validation exists in Cloud Functions but is not wired in.
- **Direct Firestore writes** remain the active path (Cloud Functions not yet integrated).
- **Firestore rules** remain open development rules (intentionally unchanged).
- **Legacy CDN importmap** in `index.html` (aistudiocdn.com) was left in place — safe removal
  requires a verified production build first.

## localStorage risk (unchanged)
- `fleetwise_active_shift` (`src/store/shift.ts`) remains a **risky duplicate** of Firestore
  shift state. Not removed in WP3; the authoritative shift-state redesign is a later work package.
- `fleetwise_device_id` (`DriverPinLogin.tsx`) is a **safe UI cache**.

## Recommended next technical step
Wire the frontend shift/PIN operations to the existing Cloud Functions
(`startShiftWithPin`, `endShift`, `validateDriverPin`, `driverChangePin`), then decide and
implement the correct charge/refuel persistence. The codebase is now type-clean and ready for that.
