# FleetWise V2 — Cloud Function Bridge (WP4)

> Work Package 4: secure transactional bridge with real Firestore compatibility.
> Contains no secrets. **No existing Firestore data was migrated or rewritten in WP4.**

## Actual real Firestore schema (authoritative compatibility baseline)
- **users** (37 docs): drivers **and** admins live in `users` (no separate `drivers` collection).
  Relevant fields: `area, contactNumber, createdAt, department, driversLicenceExpiry,
  driversLicenceImageUrl, driversLicenceNumber, email, employmentStatus, firstName, id,
  idNumber, pinHash, pinLastUpdated, role, surname, updatedAt`.
- **vehicles** (12 docs): `alias, baselineEnergyConsumption, baselineFuelConsumption,
  batteryCapacityKwh, currentOdometer, fuelType, licenseExpiryDate, licenseNumber, make, model,
  odometer, reg, registration, status, vehicleType, vin, year` + finance/insurance/tracking/warranty.
  - Compat note: vehicles may contain **both** `currentOdometer` **and** `odometer`, and **both**
    `registration` **and** `reg`. These are read tolerantly and never normalised destructively.
- **shifts** (3 docs): `driverId, vehicleId, startTime, endTime, startOdometer, endOdometer,
  startChargePercent, endChargePercent, status, createdAt, updatedAt`.

## Historical shift compatibility
- The real historical shift field names are `startTime/endTime/startOdometer/endOdometer`
  with `status` values `Active` / `Completed`.
- The Cloud Functions previously used `startAt/endAt/startOdo/endOdo` and `active/ended`.
  WP4 **changed the Cloud Functions to write/read the real legacy-compatible field names** so new
  shifts match historical shifts. No historical document is rewritten.

## Status compatibility decision
- Canonical status values (both reads and writes): **`Active`** and **`Completed`**
  (matching `src/types.ts` `ShiftStatus` and the real data). The `active`/`ended` convention
  was removed from the Cloud Functions.

## Additive activeShiftId strategy
- `startShiftWithPin` additively writes an `activeShiftId` pointer on the driver `users` doc and
  the `vehicles` doc **inside a Firestore transaction** to make concurrent claims atomic.
- Historical docs have no such pointer, so the function **also** performs a legacy lookup
  (single-field `driverId`/`vehicleId` query + in-memory `status === 'Active'` filter).
- `endShift` clears the pointer with `FieldValue.delete()` (a no-op on legacy docs that never
  had it). It never rewrites the historical shift beyond setting end fields.

## Callable mapping (frontend facade → Cloud Function)
| firebaseApi.ts facade | Cloud Function | Notes |
|---|---|---|
| `validateDriverPin` | `validateDriverPin` | server-side bcrypt; no pinHash sent to client |
| `startShift` | `startShiftWithPin` | now requires a PIN; transactional claim |
| `endShift` | `endShift` | legacy-compatible completion |
| `driverChangePin` | `driverChangePin` | server-side verify + hash |
| `adminSetDriverPin` | `adminSetDriverPin` | server-side hash; admin auth via Firebase Auth |
| `getActiveShift` | `getActiveShift` | pointer-first, legacy fallback; no auth required for PIN users |

`firebaseApi.ts` remains the **only** active frontend service facade. Components are unchanged
except `ShiftStart` now collects a 4-digit PIN.

## Client-side credential handling (removed)
- No `bcrypt` import/usage remains in `src/` (0 matches).
- `validateDriverPin` no longer downloads `pinHash` for bcrypt comparison.
- `adminSetDriverPin`/addDriver no longer hash PINs client-side.
- `getUsers` strips `pinHash` from results before returning (defence in depth).

## localStorage strategy
- `fleetwise_active_shift` (`src/store/shift.ts`) is only written **after** a successful
  Cloud Function start-shift response, and only cleared after a successful end-shift response.
- Dashboard startup still prefers the server result over stale localStorage.

## Remaining direct Firestore client writes (non-sensitive, unchanged)
Drivers/vehicles CRUD, defects, costs, maintenance/services, service providers, fines, damages,
settings, refuel/charge records, admin user creation, and the `fw_health` probe. These remain on
the direct Firestore path until a later work package migrates them (or rules are secured).

## Future index needs
- None required by WP4: Cloud Functions and the client now use **single-field** queries only
  (`driverId`/`vehicleId`/`role`), which Firestore auto-indexes. The former composite
  `driverId + status` query was removed.

## Explicit statement
No existing Firestore data was migrated or rewritten in WP4. All changes are code-only
(function rewrites + facade rewiring + one UI field). Firestore rules were **not** changed.
